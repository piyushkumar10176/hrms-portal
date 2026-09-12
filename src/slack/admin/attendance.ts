/**
 * Admin views over attendance, driven from Slack.
 *
 * Read and correct, not bulk edit. Slack has no data grid, so anything that
 * means working across many rows at once belongs in the Salesforce console.
 * What is here is what an admin actually does day to day: look at one person's
 * day, see who is in, and fix a punch somebody forgot.
 */

import { canSeeCompanyWideData, canManageEmployees, toRole } from "@/lib/authz";
import { summarizeDay, formatHours, formatMinutes } from "@/lib/attendance";
import { businessToday, BUSINESS_TIME_ZONE } from "@/lib/business-time";
import { createRecord } from "@/lib/salesforce";
import type { SlackEmployee } from "@/lib/slack";
import { openView, postMessage } from "../api";
import { header, section, fields, context, table, escape, divider, actions, button, type Block } from "../views/blocks";
import {
  getAdminEmployee, getPunchesOn, getAttendanceBetween,
  getTodayAttendanceAcrossCompany, getEmployeeOptions,
} from "../data/admin";

function actorOf(employee: SlackEmployee) {
  return { id: employee.Id, role: toRole(employee.Role__c) };
}

/** Renders a time in the business time zone, which is the only one that matters here. */
function hhmm(instant: string | null): string {
  if (!instant) return "—";
  return new Date(instant).toLocaleTimeString("en-GB", {
    timeZone: BUSINESS_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

/** One person's day: every punch, the breaks between them, and the derived totals. */
export async function sendPersonDay(
  employeeId: string, date: string, actor: SlackEmployee, slackUserId: string
): Promise<void> {
  if (!canSeeCompanyWideData(actorOf(actor)) && employeeId !== actor.Id) {
    await postMessage(slackUserId, "You can only look at your own attendance.");
    return;
  }

  const [employee, punches] = await Promise.all([
    getAdminEmployee(employeeId),
    getPunchesOn(employeeId, date),
  ]);
  if (!employee) {
    await postMessage(slackUserId, "That employee no longer exists.");
    return;
  }

  const day = summarizeDay(punches);
  const blocks: Block[] = [header(`${employee.Name} · ${date}`)];

  if (day.log.length === 0) {
    blocks.push(section("_No punches recorded on that day._"));
  } else {
    blocks.push(table(
      ["Time", "What", "After a break of", "Via"],
      day.log.map(e => [
        e.time,
        e.type === "Check-In" ? "Clock in" : "Clock out",
        e.breakBeforeMinutes ? formatMinutes(e.breakBeforeMinutes) : "",
        e.source ?? "",
      ]),
      20
    ));
    blocks.push(fields([
      ["Worked", formatHours(day.effectiveHours)],
      ["Break", formatMinutes(day.breakMinutes) + (day.breakOverAllowance ? "  :warning:" : "")],
      ["On premises", formatHours(day.grossHours)],
      ["Status", day.onTheClock ? "Still on the clock" : "Clocked out"],
    ]));
  }

  if (canManageEmployees(actorOf(actor))) {
    blocks.push(actions(button({
      text: "Add a missing punch",
      actionId: "admin_add_punch",
      value: `${employeeId}|${date}`,
    })));
  }
  blocks.push(context(
    "Punches are the record. The day above is derived from them, so correcting a " +
    "punch corrects the day and clears any flag on it."
  ));

  await postMessage(slackUserId, `${employee.Name} on ${date}`, blocks);
}

/** A person's recent days, so a pattern is visible rather than one day at a time. */
export async function sendPersonMonth(
  employeeId: string, actor: SlackEmployee, slackUserId: string
): Promise<void> {
  if (!canSeeCompanyWideData(actorOf(actor)) && employeeId !== actor.Id) {
    await postMessage(slackUserId, "You can only look at your own attendance.");
    return;
  }
  const today = businessToday();
  const from = today.slice(0, 8) + "01";
  const [employee, rows] = await Promise.all([
    getAdminEmployee(employeeId),
    getAttendanceBetween(employeeId, from, today),
  ]);
  if (!employee) return;

  if (rows.length === 0) {
    await postMessage(slackUserId, `No attendance recorded for ${employee.Name} this month.`);
    return;
  }

  const flagged = rows.filter(r => r.Penalty__c);
  await postMessage(slackUserId, `${employee.Name} this month`, [
    header(`${employee.Name} · this month`),
    table(
      ["Date", "In", "Out", "Break", "Worked", "Status"],
      rows.map(r => [
        r.Date__c.slice(5),
        hhmm(r.Check_In__c),
        hhmm(r.Check_Out__c),
        r.Break_Minutes__c ? formatMinutes(r.Break_Minutes__c) : "—",
        r.Total_Hours__c != null ? formatHours(r.Total_Hours__c) : "—",
        (r.Penalty__c ? "⚠ " : "") + (r.Status__c ?? ""),
      ]),
      25
    ),
    context(
      flagged.length > 0
        ? `:warning: ${flagged.length} day(s) flagged. Most recent: ${escape(flagged[0].Penalty_Reason__c ?? "")}`
        : ":white_check_mark: No days flagged this month."
    ),
  ]);
}

/** Who is in today, across the company. */
export async function sendTodayAcrossCompany(
  actor: SlackEmployee, slackUserId: string
): Promise<void> {
  if (!canSeeCompanyWideData(actorOf(actor))) {
    await postMessage(slackUserId, "Only HR and administrators can see company-wide attendance.");
    return;
  }
  const rows = await getTodayAttendanceAcrossCompany();
  if (rows.length === 0) {
    await postMessage(slackUserId, "Nobody has clocked in yet today.");
    return;
  }
  await postMessage(slackUserId, "Attendance today", [
    header(`Attendance · ${businessToday()}`),
    table(
      ["Name", "In", "Out", "Worked", "Status"],
      rows.map(r => [
        r.name,
        hhmm(r.checkIn),
        hhmm(r.checkOut),
        r.hours != null ? formatHours(r.hours) : "—",
        r.status ?? "",
      ]),
      30
    ),
    context(`${rows.length} people have attendance recorded today.`),
  ]);
}

/** The modal for adding a punch somebody forgot to make. */
export function addPunchModal(employeeId: string, date: string, employeeName: string) {
  return {
    type: "modal",
    callback_id: "admin_add_punch",
    private_metadata: `${employeeId}|${date}`,
    title: { type: "plain_text", text: "Add a punch" },
    submit: { type: "plain_text", text: "Add" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      section(`Adding a punch for *${escape(employeeName)}* on *${date}*.`),
      {
        type: "input", block_id: "punch_type",
        label: { type: "plain_text", text: "Clock in or out" },
        element: {
          type: "static_select", action_id: "value",
          options: [
            { text: { type: "plain_text", text: "Clock in" }, value: "Check-In" },
            { text: { type: "plain_text", text: "Clock out" }, value: "Check-Out" },
          ],
        },
      },
      {
        type: "input", block_id: "punch_time",
        label: { type: "plain_text", text: "Time" },
        element: { type: "timepicker", action_id: "value" },
      },
      {
        type: "context",
        elements: [{
          type: "mrkdwn",
          text: "The day is recalculated from the punches, so hours, break and any " +
                "flag update themselves once this is added.",
        }],
      },
    ],
  };
}

export async function openAddPunch(
  triggerId: string, employeeId: string, date: string, actor: SlackEmployee
): Promise<void> {
  if (!canManageEmployees(actorOf(actor))) return;
  const employee = await getAdminEmployee(employeeId);
  if (!employee) return;
  await openView(triggerId, addPunchModal(employeeId, date, employee.Name));
}

/**
 * Writes a corrective punch.
 *
 * Recorded with a source of Manual so a corrected day can be told apart from one
 * the employee punched themselves, which matters when somebody asks why a
 * flagged day stopped being flagged.
 */
export async function addPunch(
  employeeId: string, date: string, values: Record<string, string>, actor: SlackEmployee
): Promise<{ ok: boolean; message: string }> {
  if (!canManageEmployees(actorOf(actor))) {
    return { ok: false, message: "Only an administrator can correct attendance." };
  }
  const time = values.punch_time;
  const type = values.punch_type;
  if (!time || !type) {
    return { ok: false, message: "A time and a direction are both needed." };
  }

  // The picker gives wall-clock time in the business zone; Salesforce wants an
  // instant. Asia/Kolkata is UTC+5:30, which is why this is not a plain parse.
  const [hours, minutes] = time.split(":").map(Number);
  const utcMillis = Date.UTC(
    Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)),
    hours, minutes
  ) - 330 * 60_000;

  await createRecord("Attendance_Punch__c", {
    Employee__c: employeeId,
    Punch_DateTime__c: new Date(utcMillis).toISOString(),
    Punch_Type__c: type,
    Source__c: "Manual",
  });

  return {
    ok: true,
    message: `:white_check_mark: ${type === "Check-In" ? "Clock in" : "Clock out"} added at ${time} on ${date}. The day has been recalculated.`,
  };
}

/** The employee picker used by the attendance commands. */
export async function openAttendancePicker(triggerId: string): Promise<void> {
  const { options, truncated } = await getEmployeeOptions();
  if (options.length === 0) return;

  await openView(triggerId, {
    type: "modal",
    callback_id: "admin_pick_attendance",
    title: { type: "plain_text", text: "Whose attendance?" },
    submit: { type: "plain_text", text: "Show" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input", block_id: "employee",
        label: { type: "plain_text", text: "Employee" },
        element: {
          type: "static_select", action_id: "value",
          options: options.map(o => ({
            text: { type: "plain_text", text: o.Name.slice(0, 75) }, value: o.Id,
          })),
        },
      },
      {
        type: "input", block_id: "date", optional: true,
        label: { type: "plain_text", text: "Day" },
        element: { type: "datepicker", action_id: "value" },
        hint: { type: "plain_text", text: "Leave blank for this month's summary." },
      },
      ...(truncated
        ? [{ type: "context", elements: [{ type: "mrkdwn", text: "_Showing the first 100 employees._" }] }]
        : []),
    ],
  });
}

/** Divider re-exported so the views file owns the block vocabulary. */
export { divider };
