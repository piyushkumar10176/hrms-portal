/**
 * Employee profile and the modals that maintain it.
 *
 * The onboarding form is deliberately short. Slack caps a modal at 100 blocks
 * and three deep, and offers no file upload inside one, so a full thirty-field
 * form would become a three-screen chain that people abandon. Only what is
 * needed to create a usable record and send the invitation is asked here; the
 * rest is filled in afterwards on the record, which is how HR actually works.
 */

import {
  header, section, fields, context, divider, actions, button, escape, type Block,
} from "./blocks";
import type { AdminEmployee, NamedRecord } from "../data/admin";

type Option = { text: { type: "plain_text"; text: string }; value: string };

function option(label: string, value: string): Option {
  return { text: { type: "plain_text", text: label.slice(0, 75) }, value };
}

function optionsFrom(records: NamedRecord[]): Option[] {
  // Slack rejects a select with zero options, so callers must skip the block
  // entirely when the list is empty rather than render one.
  return records.slice(0, 100).map(r => option(r.Name, r.Id));
}

interface InputSpec {
  blockId: string;
  label: string;
  element: Record<string, unknown>;
  optional?: boolean;
  hint?: string;
}

function input(spec: InputSpec): Block {
  const block: Block = {
    type: "input",
    block_id: spec.blockId,
    label: { type: "plain_text", text: spec.label },
    element: { action_id: "value", ...spec.element },
    optional: spec.optional ?? false,
  };
  if (spec.hint) block.hint = { type: "plain_text", text: spec.hint };
  return block;
}

const text = (placeholder?: string, initial?: string) => ({
  type: "plain_text_input",
  ...(placeholder ? { placeholder: { type: "plain_text", text: placeholder } } : {}),
  ...(initial ? { initial_value: initial } : {}),
});

const select = (opts: Option[], initial?: string) => {
  const chosen = initial ? opts.find(o => o.value === initial) : undefined;
  return {
    type: "static_select",
    options: opts,
    ...(chosen ? { initial_option: chosen } : {}),
  };
};

const datepicker = (initial?: string | null) => ({
  type: "datepicker",
  ...(initial ? { initial_date: initial.slice(0, 10) } : {}),
});

const EMPLOYMENT_TYPES = [
  option("Full Time", "Full_Time"),
  option("Contract", "Contract"),
  option("Intern", "Intern"),
  option("Consultant", "Consultant"),
];

const ROLES = [
  option("Employee", "Employee"),
  option("HR", "HR"),
  option("Admin", "Admin"),
];

/** The onboarding form. One screen, only what is needed to create and invite. */
export function addEmployeeModal(
  departments: NamedRecord[],
  designations: NamedRecord[],
  managers: NamedRecord[]
): Record<string, unknown> {
  const blocks: Block[] = [
    section("Creates the employee record and emails them a link to set their portal password."),
    input({ blockId: "first_name", label: "First name", element: text("Priya") }),
    input({ blockId: "last_name", label: "Last name", element: text("Sharma") }),
    input({
      blockId: "email", label: "Work email", element: text("priya@cloudsheer.com"),
      hint: "The invitation goes here, and it is what links their Slack account.",
    }),
    input({ blockId: "joining", label: "Date of joining", element: datepicker() }),
  ];

  if (departments.length) {
    blocks.push(input({
      blockId: "department", label: "Department",
      element: select(optionsFrom(departments)), optional: true,
    }));
  }
  if (designations.length) {
    blocks.push(input({
      blockId: "designation", label: "Designation",
      element: select(optionsFrom(designations)), optional: true,
    }));
  }
  if (managers.length) {
    blocks.push(input({
      blockId: "manager", label: "Reporting manager",
      element: select(optionsFrom(managers)), optional: true,
      hint: "Naming a manager is what makes them an approver for this person.",
    }));
  }

  blocks.push(input({
    blockId: "employment_type", label: "Employment type",
    element: select(EMPLOYMENT_TYPES, "Full_Time"), optional: true,
  }));
  blocks.push(input({
    blockId: "role", label: "Access level",
    element: select(ROLES, "Employee"), optional: true,
    hint: "Employee sees only their own data. HR sees everyone. Admin can also create records.",
  }));
  blocks.push(context(
    "Bank details, identifiers and documents are added later on the employee record."
  ));

  return {
    type: "modal",
    callback_id: "admin_create_employee",
    title: { type: "plain_text", text: "Add an employee" },
    submit: { type: "plain_text", text: "Create & invite" },
    close: { type: "plain_text", text: "Cancel" },
    blocks,
  };
}

/** Editing the handful of fields worth changing from Slack. */
export function editEmployeeModal(
  employee: AdminEmployee,
  departments: NamedRecord[],
  designations: NamedRecord[],
  managers: NamedRecord[]
): Record<string, unknown> {
  const blocks: Block[] = [
    section(`Editing *${escape(employee.Name)}*${employee.Employee_Code__c ? ` · ${employee.Employee_Code__c}` : ""}`),
    input({ blockId: "email", label: "Work email", element: text(undefined, employee.Official_Email__c ?? ""), optional: true }),
    input({ blockId: "mobile", label: "Mobile", element: text(undefined, employee.Mobile__c ?? ""), optional: true }),
  ];

  if (departments.length) {
    blocks.push(input({
      blockId: "department", label: "Department",
      element: select(optionsFrom(departments)), optional: true,
    }));
  }
  if (designations.length) {
    blocks.push(input({
      blockId: "designation", label: "Designation",
      element: select(optionsFrom(designations)), optional: true,
    }));
  }
  if (managers.length) {
    blocks.push(input({
      blockId: "manager", label: "Reporting manager",
      element: select(optionsFrom(managers), employee.Reporting_Manager__c ?? undefined),
      optional: true,
    }));
  }
  blocks.push(input({
    blockId: "role", label: "Access level",
    element: select(ROLES, employee.Role__c ?? "Employee"), optional: true,
  }));
  blocks.push(context("_Leave a field blank to keep what is already there._"));

  return {
    type: "modal",
    callback_id: "admin_edit_employee",
    private_metadata: employee.Id,
    title: { type: "plain_text", text: "Edit employee" },
    submit: { type: "plain_text", text: "Save" },
    close: { type: "plain_text", text: "Cancel" },
    blocks,
  };
}

/** Offboarding. Marks the record inactive; it is never deleted. */
export function offboardModal(employee: AdminEmployee): Record<string, unknown> {
  return {
    type: "modal",
    callback_id: "admin_offboard_employee",
    private_metadata: employee.Id,
    title: { type: "plain_text", text: "Offboard" },
    submit: { type: "plain_text", text: "Offboard" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      section(
        `*${escape(employee.Name)}* will be marked inactive and will no longer be able ` +
        `to sign in to the portal or use the Slack commands.`
      ),
      context("The record and its history are kept. Nothing is deleted."),
      input({ blockId: "lwd", label: "Last working day", element: datepicker() }),
      input({
        blockId: "reason", label: "Reason",
        element: { ...text("Resigned, moving to another company"), multiline: true },
        optional: true,
      }),
    ],
  };
}

/** Search box, used when the reader would rather type than scroll a list. */
export function findEmployeeModal(): Record<string, unknown> {
  return {
    type: "modal",
    callback_id: "admin_find_employee",
    title: { type: "plain_text", text: "Find an employee" },
    submit: { type: "plain_text", text: "Search" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      input({
        blockId: "term", label: "Name, code or email",
        element: text("piyush, EMP018, or piyush@…"),
      }),
    ],
  };
}

/**
 * An employee profile.
 *
 * Bank details and government identifiers are only included when the reader is
 * allowed them. The decision comes from lib/authz, the same module the portal
 * uses, so the two surfaces cannot disagree about who sees what.
 */
export function employeeProfile(
  employee: AdminEmployee,
  opts: { canSeeSensitive: boolean; canManage: boolean }
): Block[] {
  const blocks: Block[] = [
    header(employee.Name),
    fields([
      ["Code", employee.Employee_Code__c ?? "—"],
      ["Status", employee.Employee_Status__c ?? "—"],
      ["Department", employee.Department__c ?? "—"],
      ["Designation", employee.Designation__c ?? "—"],
      ["Reporting to", employee.Reporting_Manager__r?.Name ?? "—"],
      ["Access level", employee.Role__c ?? "Employee"],
      ["Email", employee.Official_Email__c ?? "—"],
      ["Mobile", employee.Mobile__c ?? "—"],
      ["Joined", employee.Date_of_Joining__c ?? "—"],
      ["Employment", (employee.Employment_Type__c ?? "—").replace(/_/g, " ")],
    ]),
  ];

  if (opts.canSeeSensitive) {
    blocks.push(divider());
    blocks.push(section("*Sensitive details*"));
    blocks.push(fields([
      ["Date of birth", employee.DOB__c ?? "—"],
      ["Bank account", employee.Bank_Account_Number__c ?? "—"],
      ["IFSC", employee.IFSC_Code__c ?? "—"],
      ["PAN", employee.PAN__c ?? "—"],
      ["Aadhaar", employee.Aadhaar__c ?? "—"],
    ]));
    blocks.push(context(
      ":lock: Visible to you because you are HR or an administrator. " +
      "This message stays in your Slack history."
    ));
  }

  const state: string[] = [];
  state.push(employee.Slack_User_Id__c ? ":white_check_mark: Slack linked" : ":warning: Slack not linked");
  state.push(employee.Password_Hash__c ? ":white_check_mark: Portal access set up" : ":warning: Never signed in to the portal");
  blocks.push(context(state.join("   ·   ")));

  if (opts.canManage && employee.Employee_Status__c === "Active") {
    blocks.push(actions(
      button({ text: "Edit", actionId: "admin_edit_employee", value: employee.Id }),
      button({ text: "Attendance", actionId: "admin_view_attendance", value: employee.Id }),
      button({ text: "Re-invite", actionId: "admin_reinvite", value: employee.Id }),
      button({
        text: "Offboard", actionId: "admin_offboard", value: employee.Id, style: "danger",
        confirm: {
          title: "Offboard this employee?",
          text: `*${employee.Name}* will lose access to the portal and Slack commands. The record is kept.`,
          confirmText: "Offboard",
        },
      })
    ));
  }

  return blocks;
}
