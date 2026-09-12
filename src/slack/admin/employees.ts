/**
 * Admin actions on people, driven from Slack.
 *
 * Every entry point re-checks authority here rather than trusting that a button
 * was only rendered for the right person. A Slack action id and value are
 * supplied by the client, so a button is a convenience, never the authorisation
 * boundary.
 */

import { createRecord, updateRecord } from "@/lib/salesforce";
import { canSeeCompanyWideData, canManageEmployees, canSeeSensitiveFields, toRole } from "@/lib/authz";
import { issueInvite } from "@/lib/invite";
import { businessToday } from "@/lib/business-time";
import type { SlackEmployee } from "@/lib/slack";
import { openView, postMessage } from "../api";
import { header, context, table, escape, type Block } from "../views/blocks";
import {
  addEmployeeModal, editEmployeeModal, offboardModal, findEmployeeModal, employeeProfile,
} from "../views/employee";
import {
  getAdminEmployee, getEmployeeOptions, getDepartments, getDesignations,
  searchEmployees, nextEmployeeCode, type AdminEmployee,
} from "../data/admin";

/** The base URL invitations are built against. */
const APP_URL = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";

function actorOf(employee: SlackEmployee) {
  return { id: employee.Id, role: toRole(employee.Role__c) };
}

/** Reads a modal's submitted values into a flat map. */
export function readModalValues(
  state: { values: Record<string, Record<string, Record<string, unknown>>> } | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [blockId, block] of Object.entries(state?.values ?? {})) {
    const field = block.value as
      | { value?: string; selected_option?: { value: string }; selected_date?: string }
      | undefined;
    const value = field?.value ?? field?.selected_option?.value ?? field?.selected_date ?? "";
    if (value) out[blockId] = String(value).trim();
  }
  return out;
}

/** Loads the three option lists every people modal needs, in one round trip. */
async function formOptions() {
  const [departments, designations, managers] = await Promise.all([
    getDepartments(), getDesignations(), getEmployeeOptions(),
  ]);
  return { departments, designations, managers: managers.options };
}

export async function openAddEmployee(triggerId: string, actor: SlackEmployee): Promise<void> {
  if (!canManageEmployees(actorOf(actor))) {
    await postMessage(actor.Slack_User_Id__c ?? "", "Only an administrator can add employees.");
    return;
  }
  const { departments, designations, managers } = await formOptions();
  await openView(triggerId, addEmployeeModal(departments, designations, managers));
}

export async function openFindEmployee(triggerId: string): Promise<void> {
  await openView(triggerId, findEmployeeModal());
}

export async function openEditEmployee(
  triggerId: string, employeeId: string, actor: SlackEmployee
): Promise<void> {
  if (!canManageEmployees(actorOf(actor))) return;
  const employee = await getAdminEmployee(employeeId);
  if (!employee) return;
  const { departments, designations, managers } = await formOptions();
  await openView(triggerId, editEmployeeModal(employee, departments, designations, managers));
}

export async function openOffboard(
  triggerId: string, employeeId: string, actor: SlackEmployee
): Promise<void> {
  if (!canManageEmployees(actorOf(actor))) return;
  const employee = await getAdminEmployee(employeeId);
  if (!employee) return;
  await openView(triggerId, offboardModal(employee));
}

/** Creates the record and sends the invitation. Returns a message for the admin. */
export async function createEmployee(
  values: Record<string, string>, actor: SlackEmployee
): Promise<{ ok: boolean; errors?: Record<string, string>; message?: string }> {
  if (!canManageEmployees(actorOf(actor))) {
    return { ok: false, message: "Only an administrator can add employees." };
  }

  const email = (values.email ?? "").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, errors: { email: "That does not look like an email address." } };
  }
  // A placeholder address silently swallows the invitation, and 26 of the 28
  // existing employees carry one, so it is worth refusing here.
  if (/@(test|example)\.(com|org|net)$/i.test(email)) {
    return { ok: false, errors: { email: "That is a placeholder address, not a real mailbox." } };
  }

  const existing = await searchEmployees(email, 1);
  if (existing.some(e => (e.Official_Email__c ?? "").toLowerCase() === email)) {
    return { ok: false, errors: { email: "Somebody already has that address." } };
  }

  const first = values.first_name ?? "";
  const last = values.last_name ?? "";
  const code = await nextEmployeeCode();

  const id = await createRecord("Employee__c", {
    Name: `${first} ${last}`.trim(),
    First_Name__c: first,
    Last_Name__c: last,
    Employee_Code__c: code,
    Official_Email__c: email,
    Date_of_Joining__c: values.joining || businessToday(),
    Department_Ref__c: values.department || null,
    Designation_Ref__c: values.designation || null,
    Reporting_Manager__c: values.manager || null,
    Employment_Type__c: values.employment_type || "Full_Time",
    Role__c: values.role || "Employee",
    Employee_Status__c: "Active",
  });

  const invite = await issueInvite(id, first || "there", email, APP_URL);
  const delivered = invite.email.sent
    ? "The invitation has been emailed to them."
    : `No email could be sent, because no mail provider is configured. ` +
      `Send them this link yourself, it expires in 3 days:\n${invite.link}`;

  return {
    ok: true,
    message: `:white_check_mark: *${escape(`${first} ${last}`.trim())}* created as *${code}*.\n${delivered}`,
  };
}

export async function saveEmployee(
  employeeId: string, values: Record<string, string>, actor: SlackEmployee
): Promise<{ ok: boolean; errors?: Record<string, string>; message?: string }> {
  if (!canManageEmployees(actorOf(actor))) {
    return { ok: false, message: "Only an administrator can edit employees." };
  }
  const employee = await getAdminEmployee(employeeId);
  if (!employee) return { ok: false, message: "That employee no longer exists." };

  const patch: Record<string, unknown> = {};
  if (values.email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
      return { ok: false, errors: { email: "That does not look like an email address." } };
    }
    patch.Official_Email__c = values.email.toLowerCase();
  }
  if (values.mobile) patch.Mobile__c = values.mobile;
  if (values.department) patch.Department_Ref__c = values.department;
  if (values.designation) patch.Designation_Ref__c = values.designation;
  if (values.role) patch.Role__c = values.role;
  if (values.manager) {
    // Somebody reporting to themselves would make their own requests
    // undecidable, since nobody may approve their own.
    if (values.manager === employeeId) {
      return { ok: false, errors: { manager: "Somebody cannot report to themselves." } };
    }
    patch.Reporting_Manager__c = values.manager;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: true, message: "Nothing was changed." };
  }
  await updateRecord("Employee__c", employeeId, patch);
  return { ok: true, message: `:white_check_mark: *${escape(employee.Name)}* updated.` };
}

export async function offboardEmployee(
  employeeId: string, values: Record<string, string>, actor: SlackEmployee
): Promise<{ ok: boolean; message: string }> {
  if (!canManageEmployees(actorOf(actor))) {
    return { ok: false, message: "Only an administrator can offboard employees." };
  }
  const employee = await getAdminEmployee(employeeId);
  if (!employee) return { ok: false, message: "That employee no longer exists." };
  if (employee.Id === actor.Id) {
    return { ok: false, message: "You cannot offboard yourself." };
  }

  const lwd = values.lwd || businessToday();
  await updateRecord("Employee__c", employeeId, {
    Employee_Status__c: "Inactive",
    LWD__c: lwd,
    Resignation_Date__c: businessToday(),
    // Clearing the hash ends portal access immediately rather than at the next
    // session expiry.
    Password_Hash__c: null,
    Invite_Token_Hash__c: null,
  });

  return {
    ok: true,
    message:
      `:wave: *${escape(employee.Name)}* has been offboarded, last working day ${lwd}.\n` +
      `Portal access is revoked. The record and its history are kept.` +
      (values.reason ? `\n_Reason: ${escape(values.reason)}_` : ""),
  };
}

/** Sends search results, each with a button to open the full profile. */
export async function sendSearchResults(
  term: string, actor: SlackEmployee, slackUserId: string
): Promise<void> {
  if (!canSeeCompanyWideData(actorOf(actor))) {
    await postMessage(slackUserId, "Only HR and administrators can search the directory.");
    return;
  }
  const matches = await searchEmployees(term);
  if (matches.length === 0) {
    await postMessage(slackUserId, `Nothing matched "${term}".`);
    return;
  }
  if (matches.length === 1) {
    await sendProfile(matches[0].Id, actor, slackUserId);
    return;
  }

  const rows = matches.map(m => [
    m.Employee_Code__c ?? "—",
    m.Name,
    m.Department__c ?? "—",
    m.Employee_Status__c ?? "—",
  ]);
  await postMessage(slackUserId, `${matches.length} matches for "${term}"`, [
    header(`${matches.length} matches`),
    table(["Code", "Name", "Department", "Status"], rows, 20),
    context("Search again with a code or full email address to open one directly."),
  ]);
}

export async function sendProfile(
  employeeId: string, actor: SlackEmployee, slackUserId: string
): Promise<void> {
  const a = actorOf(actor);
  const employee = await getAdminEmployee(employeeId);
  if (!employee) {
    await postMessage(slackUserId, "That employee no longer exists.");
    return;
  }
  const blocks: Block[] = employeeProfile(employee, {
    canSeeSensitive: canSeeSensitiveFields(a, employee.Id),
    canManage: canManageEmployees(a),
  });
  await postMessage(slackUserId, employee.Name, blocks);
}

/** Re-issues a portal invitation from Slack. */
export async function reinvite(
  employeeId: string, actor: SlackEmployee, slackUserId: string
): Promise<void> {
  if (!canSeeCompanyWideData(actorOf(actor))) return;
  const employee: AdminEmployee | null = await getAdminEmployee(employeeId);
  if (!employee?.Official_Email__c) {
    await postMessage(slackUserId, "That employee has no email address on record.");
    return;
  }
  if (/@(test|example)\.(com|org|net)$/i.test(employee.Official_Email__c)) {
    await postMessage(
      slackUserId,
      `${employee.Official_Email__c} is a placeholder address, not a real mailbox. ` +
      `Replace it before inviting them.`
    );
    return;
  }
  const invite = await issueInvite(
    employee.Id, employee.First_Name__c || "there", employee.Official_Email__c, APP_URL
  );
  await postMessage(
    slackUserId,
    invite.email.sent
      ? `Invitation re-sent to ${employee.Official_Email__c}.`
      : `No email provider is configured. Send this link on yourself, it expires in 3 days:\n${invite.link}`
  );
}
