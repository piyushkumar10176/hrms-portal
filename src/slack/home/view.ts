/**
 * The App Home tab.
 *
 * Everything before this was command-driven, which means the person has to
 * remember what to type. The Home tab is the opposite: open the app and today's
 * state is already there, with buttons on it. It is the difference between a
 * chat bot and something that feels like a product.
 *
 * The view is role-aware and additive. An employee sees their own day. A manager
 * sees that plus what is waiting for them. HR and admin see that plus the
 * company. Nobody sees a section they have no business seeing, and the checks
 * come from lib/authz so Slack and the portal cannot drift apart.
 */

import {
  header, section, fields, context, divider, actions, button, table,
  escape, capped, MAX_MODAL_BLOCKS, type Block,
} from "../views/blocks";
import { summarizeDay, formatHours, formatMinutes, MINIMUM_EFFECTIVE_HOURS } from "@/lib/attendance";
import { businessToday } from "@/lib/business-time";
import type { HomeData } from "./data";

/** Greeting that matches the reader's part of the day, in business time. */
function greeting(): string {
  const hour = Number(
    new Date().toLocaleString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false })
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel(): string {
  return new Date(businessToday() + "T00:00:00Z").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long",
  });
}

/** The clock-in card: where the reader stands right now, and the one button that matters. */
function attendanceSection(data: HomeData): Block[] {
  const day = summarizeDay(data.todayPunches);
  const blocks: Block[] = [];

  if (day.log.length === 0) {
    blocks.push(section("*Attendance*\nYou have not clocked in yet today."));
    blocks.push(actions(button({
      text: "Clock in", actionId: "home_clock_in", style: "primary", value: "in",
    })));
    return blocks;
  }

  const status = day.onTheClock
    ? `On the clock since *${day.clockIn}*`
    : `Clocked out at *${day.clockOut}* — ${formatHours(day.effectiveHours)} worked`;

  blocks.push(section(`*Attendance*\n${status}`));
  blocks.push(fields([
    ["First clock-in", day.clockIn ?? "—"],
    ["Last clock-out", day.clockOut ?? "—"],
    ["Break", formatMinutes(day.breakMinutes) + (day.breakOverAllowance ? "  :warning:" : "")],
    ["Worked", `${formatHours(day.effectiveHours)} of ${MINIMUM_EFFECTIVE_HOURS}h`],
  ]));
  blocks.push(actions(
    day.onTheClock
      ? button({ text: "Clock out", actionId: "home_clock_out", style: "danger", value: "out" })
      : button({ text: "Clock in", actionId: "home_clock_in", style: "primary", value: "in" }),
    button({ text: "Full log", actionId: "home_view_punches" })
  ));
  return blocks;
}

/** Leave balances as chips, plus the actions people reach for most. */
function leaveSection(data: HomeData): Block[] {
  const blocks: Block[] = [section("*Leave*")];

  if (data.balances.length === 0) {
    blocks.push(context("_No leave types are allocated to you yet._"));
    return blocks;
  }

  blocks.push(fields(
    data.balances.slice(0, 6).map(b => [
      b.leaveType,
      `${b.available} day${b.available === 1 ? "" : "s"} left`,
    ] as [string, string])
  ));

  const row = [button({ text: "Apply for leave", actionId: "open_leave_modal", style: "primary" })];
  if (data.myPendingCount > 0) {
    row.push(button({
      text: `My requests (${data.myPendingCount} pending)`, actionId: "home_my_requests",
    }));
  }
  row.push(button({ text: "Regularize a day", actionId: "open_regularize_modal" }));
  blocks.push(actions(...row));
  return blocks;
}

/** Only rendered for someone who actually has people reporting to them. */
function approvalsSection(data: HomeData): Block[] {
  if (!data.isApprover) return [];

  const total = data.pendingApprovals.length + data.pendingRegularizations;
  if (total === 0) {
    return [divider(), section("*Waiting on you*\n:white_check_mark: Nothing to approve."), ];
  }

  const rows = data.pendingApprovals.slice(0, 8).map(r => [
    r.employeeName,
    r.leaveType,
    `${r.fromDate} → ${r.toDate}`,
    `${r.days}d`,
  ]);

  const blocks: Block[] = [
    divider(),
    section(`*Waiting on you* · ${total} item${total === 1 ? "" : "s"}`),
  ];
  if (rows.length > 0) {
    blocks.push(table(["Who", "Type", "Dates", "Days"], rows, 8));
  }
  if (data.pendingRegularizations > 0) {
    blocks.push(context(`Plus ${data.pendingRegularizations} attendance regularization request(s).`));
  }
  blocks.push(actions(button({
    text: "Review approvals", actionId: "home_open_approvals", style: "primary",
  })));
  return blocks;
}

/** Who is off today. Useful to everyone, so it is not gated. */
function whoIsOutSection(data: HomeData): Block[] {
  if (data.outToday.length === 0 && data.remoteToday.length === 0) return [];

  const blocks: Block[] = [divider(), section("*Out today*")];
  if (data.outToday.length > 0) {
    blocks.push(context(
      ":palm_tree: " + data.outToday.map(p => escape(p.name) + (p.halfDay ? " (half day)" : "")).join(", ")
    ));
  }
  if (data.remoteToday.length > 0) {
    blocks.push(context(":house: Remote: " + data.remoteToday.map(p => escape(p.name)).join(", ")));
  }
  return blocks;
}

/** The company view. HR and admin only. */
function adminSection(data: HomeData): Block[] {
  if (!data.isAdmin || !data.company) return [];
  const c = data.company;

  return [
    divider(),
    header("Company today"),
    fields([
      ["Active employees", String(c.headcount)],
      ["Clocked in today", `${c.clockedIn} of ${c.headcount}`],
      ["On leave", String(c.onLeave)],
      ["Flagged days this month", String(c.flaggedThisMonth)],
    ]),
    actions(
      button({ text: "Find an employee", actionId: "admin_find_employee", style: "primary" }),
      button({ text: "Add an employee", actionId: "admin_add_employee" }),
      button({ text: "Attendance", actionId: "admin_attendance" }),
      button({ text: "Who is in today", actionId: "admin_today_attendance" })
    ),
  ];
}

/** Builds the whole Home view for this person. */
export function buildHome(data: HomeData): Block[] {
  const blocks: Block[] = [
    section(`${greeting()}, *${escape(data.employee.Name.split(" ")[0])}*  ·  ${todayLabel()}`),
    divider(),
    ...attendanceSection(data),
    divider(),
    ...leaveSection(data),
    ...approvalsSection(data),
    ...whoIsOutSection(data),
    ...adminSection(data),
    divider(),
    context(
      "Commands still work: `/myleave`  `/attendance`  `/approvals`  `/whosout`  `/regularize`",
      "_Refreshes each time you open this tab._"
    ),
  ];

  // A Home view caps at 100 blocks and Slack drops the overflow silently.
  return capped(blocks, MAX_MODAL_BLOCKS, "_Some sections were hidden to fit._");
}

/** Shown to a Slack user with no matching employee record. */
export function buildUnlinkedHome(): Block[] {
  return [
    header("CloudSheer HRMS"),
    section(
      "Your Slack account is not linked to an employee record yet, so there is " +
      "nothing to show here."
    ),
    context(
      "Ask HR to add your Slack account against your employee record. " +
      "Linking is matched on your work email address."
    ),
  ];
}
