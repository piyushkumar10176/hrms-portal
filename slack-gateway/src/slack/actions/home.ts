/**
 * Buttons on the Home tab.
 *
 * These need handling separately from message buttons for one reason: a Home tab
 * interaction carries no response_url. That channel only exists for messages, so
 * anything pressed here answers by redrawing the tab and, where a confirmation
 * is worth keeping, sending a direct message.
 */

import { createPunch, getTodayPunches, getLeaveRequests } from "@/lib/salesforce-queries";
import { summarizeDay, isCheckIn, formatHours, formatMinutes } from "@/lib/attendance";
import { businessTimeNow } from "@/lib/business-time";
import type { SlackEmployee } from "@/lib/slack";
import { postMessage } from "../api";
import { refreshHome } from "../home/publish";
import { context, header, table, type Block } from "../views/blocks";

/** Punches from the Home tab, with the sequence rules the other surfaces apply. */
async function clock(employee: SlackEmployee, slackUserId: string, direction: "in" | "out") {
  const punches = await getTodayPunches(employee.Id);
  const last = punches.length ? punches[punches.length - 1] : null;
  const lastWasIn = last ? isCheckIn(last.Punch_Type__c) : false;

  if (direction === "in" && lastWasIn) {
    await postMessage(slackUserId, "You are already clocked in.");
    return;
  }
  if (direction === "out" && !lastWasIn) {
    await postMessage(
      slackUserId,
      last ? "You are already clocked out." : "You have not clocked in today."
    );
    return;
  }

  await createPunch({
    employeeId: employee.Id,
    punchType: direction === "in" ? "Check-In" : "Check-Out",
    // Marked as Slack so the Apex notifier stays quiet: the tab redraw and the
    // message below are already the confirmation, and a third would be noise.
    source: "Slack",
  });

  const day = summarizeDay(await getTodayPunches(employee.Id));
  const closedBreak = day.log.length ? day.log[day.log.length - 1].breakBeforeMinutes : undefined;

  const text =
    direction === "in"
      ? closedBreak
        ? `Clocked in at ${businessTimeNow()} after a ${formatMinutes(closedBreak)} break.`
        : `Clocked in at ${businessTimeNow()}.`
      : `Clocked out at ${businessTimeNow()}. ${formatHours(day.effectiveHours)} worked` +
        (day.breakMinutes > 0 ? `, ${formatMinutes(day.breakMinutes)} break.` : ".");

  await postMessage(slackUserId, text);
}

/** The full punch log for today, sent as a message so it can be scrolled back to. */
async function sendPunchLog(employee: SlackEmployee, slackUserId: string) {
  const day = summarizeDay(await getTodayPunches(employee.Id));
  if (day.log.length === 0) {
    await postMessage(slackUserId, "No punches recorded today.");
    return;
  }

  const rows = day.log.map(entry => [
    entry.time,
    entry.type === "Check-In" ? "Clock in" : "Clock out",
    entry.breakBeforeMinutes ? `after ${formatMinutes(entry.breakBeforeMinutes)}` : "",
    entry.source ?? "",
  ]);

  const blocks: Block[] = [
    header("Today's punches"),
    table(["Time", "What", "Break", "Via"], rows, 20),
    context(
      `Worked ${formatHours(day.effectiveHours)}  ·  break ${formatMinutes(day.breakMinutes)}` +
      `  ·  on premises ${formatHours(day.grossHours)}`
    ),
  ];
  await postMessage(slackUserId, "Today's punches", blocks);
}

/** The reader's own leave requests, most recent first. */
async function sendMyRequests(employee: SlackEmployee, slackUserId: string) {
  const requests = await getLeaveRequests(employee.Id);
  if (requests.length === 0) {
    await postMessage(slackUserId, "You have no leave requests.");
    return;
  }
  const rows = requests.slice(0, 15).map(r => [
    r.Leave_Type__r?.Name ?? "Leave",
    `${r.From_Date__c} → ${r.To_Date__c}`,
    `${r.Days__c ?? 0}d`,
    r.Status__c,
  ]);
  await postMessage(slackUserId, "Your leave requests", [
    header("Your leave requests"),
    table(["Type", "Dates", "Days", "Status"], rows, 15),
    context("Use `/myleave` to apply for or cancel leave."),
  ]);
}

/**
 * Handles a Home tab button.
 *
 * @returns true when the action belonged here, so the caller stops looking
 */
export async function handleHomeAction(
  actionId: string,
  employee: SlackEmployee,
  slackUserId: string
): Promise<boolean> {
  switch (actionId) {
    case "home_clock_in":
      await clock(employee, slackUserId, "in");
      break;
    case "home_clock_out":
      await clock(employee, slackUserId, "out");
      break;
    case "home_view_punches":
      await sendPunchLog(employee, slackUserId);
      break;
    case "home_my_requests":
      await sendMyRequests(employee, slackUserId);
      break;
    case "home_open_approvals":
      await postMessage(
        slackUserId,
        "Use `/approvals` to see everything waiting on you, with Approve and Reject buttons."
      );
      break;
    default:
      return false;
  }

  // Whatever just happened, the tab is now out of date.
  await refreshHome(slackUserId);
  return true;
}
