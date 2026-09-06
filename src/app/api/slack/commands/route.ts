/**
 * POST /api/slack/commands
 *
 * Slash command receiver: /leave, /attendance, /approvals.
 *
 * Slack expects an acknowledgement within 3 seconds. Anything that might take
 * longer replies immediately with a short "working on it" and posts the real
 * answer to the response_url, which Slack accepts up to five times in thirty
 * minutes. No business rules live here; Salesforce owns those.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { verifySlackRequest } from "@/lib/slack-verify";
import {
  employeeForSlackUser,
  ephemeral,
  notLinkedMessage,
  postToResponseUrl,
  actorFor,
} from "@/lib/slack";
import { canSeeCompanyWideData } from "@/lib/authz";
import {
  getLeaveBalances,
  getLeaveRequests,
  getPendingApprovals,
  getTodayPunches,
  createPunch,
  getAbsencesOn,
  getPenalisedDays,
  countRegularizationsInMonth,
  getLeaveSummary,
  getPenaltySummary,
  getPendingRegularizationApprovals,
  getCancellableRequests,
  getAllPendingApprovals,
  getAllPendingRegularizations,
} from "@/lib/salesforce-queries";
import { toLeaveBalanceView } from "@/lib/leave-balance";
import { businessTimeNow, businessToday } from "@/lib/business-time";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const verdict = verifySlackRequest(
    rawBody,
    req.headers.get("x-slack-signature"),
    req.headers.get("x-slack-request-timestamp"),
    process.env.SLACK_SIGNING_SECRET
  );
  if (!verdict.ok) {
    console.warn("[slack/commands] rejected:", verdict.reason);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = new URLSearchParams(rawBody);
  const command = form.get("command") ?? "";
  const text = (form.get("text") ?? "").trim().toLowerCase();
  const slackUserId = form.get("user_id") ?? "";
  const responseUrl = form.get("response_url") ?? "";

  // Answer Slack straight away, then do the work and post the result. Doing the
  // Salesforce round trip inline risks blowing the 3 second budget.
  //
  // This must be after(), not a bare floating promise. On serverless the
  // invocation is frozen once the response is returned, so fire-and-forget work
  // is silently dropped: Slack showed "Working on it…" and nothing ever
  // followed. after() keeps the invocation alive until the callback settles.
  after(async () => {
    await handleCommand(command, text, slackUserId, responseUrl);
  });

  return NextResponse.json(ephemeral("Working on it…"));
}

async function handleCommand(
  command: string,
  text: string,
  slackUserId: string,
  responseUrl: string
): Promise<void> {
  try {
    const employee = await employeeForSlackUser(slackUserId);
    if (!employee) {
      await postToResponseUrl(responseUrl, notLinkedMessage());
      return;
    }

    switch (command) {
      // Slack reserves /leave for leaving a channel, so the app registers /myleave.
      case "/myleave":
        await handleLeave(text, employee.Id, responseUrl);
        return;
      case "/attendance":
        await handleAttendance(text, employee.Id, responseUrl);
        return;
      case "/approvals":
        await handleApprovals(employee, responseUrl);
        return;
      case "/whosout":
        await handleWhosOut(responseUrl);
        return;
      case "/regularize":
        await handleRegularize(employee.Id, responseUrl);
        return;
      case "/hrdash":
        await handleDashboard(responseUrl);
        return;
      default:
        await postToResponseUrl(responseUrl, ephemeral(`Unknown command ${command}`));
    }
  } catch (err) {
    console.error("[slack/commands] handler failed:", err);
    await postToResponseUrl(
      responseUrl,
      ephemeral("Something went wrong reaching Salesforce. Please try again.")
    );
  }
}

async function handleLeave(
  text: string,
  employeeId: string,
  responseUrl: string
): Promise<void> {
  if (text === "" || text === "balance") {
    const balances = await getLeaveBalances(employeeId);
    if (balances.length === 0) {
      await postToResponseUrl(responseUrl, ephemeral("No leave balances found for this year."));
      return;
    }
    const lines = balances
      .map((b, i) => toLeaveBalanceView(b, i))
      .map((b) => `• *${b.leaveType}* — ${b.available} of ${b.total} day(s) left`)
      .join("\n");
    await postToResponseUrl(responseUrl, {
      response_type: "ephemeral",
      blocks: [
        { type: "header", text: { type: "plain_text", text: "Your leave balance" } },
        { type: "section", text: { type: "mrkdwn", text: lines } },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              action_id: "open_leave_modal",
              style: "primary",
              text: { type: "plain_text", text: "Apply for leave" },
            },
          ],
        },
      ],
    });
    return;
  }

  if (text === "cancel") {
    const cancellable = await getCancellableRequests(employeeId, businessToday());
    if (cancellable.length === 0) {
      await postToResponseUrl(
        responseUrl,
        ephemeral("You have no upcoming leave to cancel. Leave already taken has to be corrected by HR.")
      );
      return;
    }

    const blocks: unknown[] = [
      { type: "header", text: { type: "plain_text", text: "Cancel leave" } },
    ];
    for (const r of cancellable.slice(0, 8)) {
      const span = r.From_Date__c === r.To_Date__c ? r.From_Date__c : `${r.From_Date__c} to ${r.To_Date__c}`;
      const half = r.Half_Day__c ? ` (${r.Half_Day_Session__c ?? "half day"})` : "";
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${r.Leave_Type__r?.Name ?? "Leave"}* — ${span}${half}\n${r.Days__c} day(s), currently *${r.Status__c}*`,
        },
      });
      blocks.push({
        type: "actions",
        elements: [
          {
            type: "button",
            action_id: "cancel_leave",
            style: "danger",
            value: r.Id,
            text: { type: "plain_text", text: "Cancel this leave" },
          },
        ],
      });
    }
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: "Cancelling returns the days to your balance straight away." }],
    });

    await postToResponseUrl(responseUrl, { response_type: "ephemeral", blocks });
    return;
  }

  if (text === "status") {
    const requests = await getLeaveRequests(employeeId);
    if (requests.length === 0) {
      await postToResponseUrl(responseUrl, ephemeral("You have no leave requests."));
      return;
    }
    const lines = requests
      .slice(0, 10)
      .map(
        (r) =>
          `• ${r.Leave_Type__r?.Name ?? "Leave"} ${r.From_Date__c} to ${r.To_Date__c} — *${r.Status__c}*`
      )
      .join("\n");
    await postToResponseUrl(responseUrl, {
      response_type: "ephemeral",
      blocks: [
        { type: "header", text: { type: "plain_text", text: "Your recent leave" } },
        { type: "section", text: { type: "mrkdwn", text: lines } },
      ],
    });
    return;
  }

  if (text === "apply") {
    // The modal itself is opened from the interactivity route, which has a fresh
    // trigger_id. A trigger_id expires after 3 seconds and is single use, so it
    // is not safe to rely on the one delivered with a slash command here.
    await postToResponseUrl(responseUrl, {
      response_type: "ephemeral",
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: "Ready when you are." } },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              action_id: "open_leave_modal",
              style: "primary",
              text: { type: "plain_text", text: "Apply for leave" },
            },
          ],
        },
      ],
    });
    return;
  }

  await postToResponseUrl(
    responseUrl,
    ephemeral("Try `/myleave balance`, `/myleave apply`, `/myleave status` or `/myleave cancel`.")
  );
}

async function handleAttendance(
  text: string,
  employeeId: string,
  responseUrl: string
): Promise<void> {
  if (text === "in" || text === "out") {
    const punches = await getTodayPunches(employeeId);
    const last = punches.length ? punches[punches.length - 1] : null;
    const lastWasIn =
      last ? (last.Punch_Type__c || "").toLowerCase().replace(/[^a-z]/g, "") === "checkin" : false;

    if (text === "in" && lastWasIn) {
      await postToResponseUrl(responseUrl, ephemeral("You are already clocked in."));
      return;
    }
    if (text === "out" && !lastWasIn) {
      await postToResponseUrl(
        responseUrl,
        ephemeral(last ? "You are already clocked out." : "You have not clocked in today.")
      );
      return;
    }

    await createPunch({
      employeeId,
      punchType: text === "in" ? "Check-In" : "Check-Out",
      source: "Slack",
    });
    await postToResponseUrl(
      responseUrl,
      ephemeral(`Clocked ${text} at ${businessTimeNow()}.`)
    );
    return;
  }

  if (text === "" || text === "today") {
    const punches = await getTodayPunches(employeeId);
    if (punches.length === 0) {
      await postToResponseUrl(responseUrl, ephemeral("No punches recorded today."));
      return;
    }
    const lines = punches
      .map((p) => `• ${p.Punch_Type__c} — ${p.Punch_DateTime__c}`)
      .join("\n");
    await postToResponseUrl(responseUrl, {
      response_type: "ephemeral",
      blocks: [
        { type: "header", text: { type: "plain_text", text: "Today's punches" } },
        { type: "section", text: { type: "mrkdwn", text: lines } },
      ],
    });
    return;
  }

  await postToResponseUrl(
    responseUrl,
    ephemeral("Try `/attendance in`, `/attendance out` or `/attendance today`.")
  );
}

/** Who is on approved leave today, visible to anyone who asks. */
async function handleWhosOut(responseUrl: string): Promise<void> {
  const today = businessToday();
  const absences = await getAbsencesOn(today);

  if (absences.length === 0) {
    await postToResponseUrl(responseUrl, {
      response_type: "ephemeral",
      blocks: [
        { type: "header", text: { type: "plain_text", text: `Who is out, ${today}` } },
        { type: "section", text: { type: "mrkdwn", text: "Nobody is on approved leave today." } },
      ],
    });
    return;
  }

  const lines = absences
    .map((a) => {
      const span = a.From_Date__c === a.To_Date__c ? "today" : `${a.From_Date__c} to ${a.To_Date__c}`;
      const half = a.Half_Day__c ? " (half day)" : "";
      return `• *${a.Employee__r?.Name ?? "Unknown"}* — ${a.Leave_Type__r?.Name ?? "Leave"}${half}, ${span}`;
    })
    .join("\n");

  await postToResponseUrl(responseUrl, {
    response_type: "ephemeral",
    blocks: [
      { type: "header", text: { type: "plain_text", text: `Who is out, ${today}` } },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${absences.length} ${absences.length === 1 ? "person is" : "people are"} out:\n${lines}`,
        },
      },
    ],
  });
}

/** Monthly allowance, mirrored from the Salesforce label. */
const REGULARIZATIONS_PER_MONTH = Number(process.env.HRMS_REGULARIZATIONS_PER_MONTH ?? "3");

/**
 * Shows the month's penalised days and how much of the regularization
 * allowance is left, with a button to raise one.
 */
async function handleRegularize(employeeId: string, responseUrl: string): Promise<void> {
  const today = businessToday();
  const [penalised, used] = await Promise.all([
    getPenalisedDays(employeeId, today),
    countRegularizationsInMonth(employeeId, today),
  ]);

  const remaining = Math.max(REGULARIZATIONS_PER_MONTH - used, 0);
  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: "Attendance regularization" } },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `You have used *${used}* of *${REGULARIZATIONS_PER_MONTH}* regularizations this month` +
          `, *${remaining}* remaining.`,
      },
    },
  ];

  if (penalised.length === 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "No penalised days this month. Nothing to regularize." },
    });
  } else {
    const lines = penalised
      .slice(0, 10)
      .map((d) => `• *${d.Date__c}* — ${d.Penalty_Reason__c ?? "policy breach"}`)
      .join("\n");
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Penalised days this month*\n${lines}` },
    });
  }

  if (remaining > 0 && penalised.length > 0) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: "open_regularize_modal",
          style: "primary",
          text: { type: "plain_text", text: "Raise a regularization" },
        },
      ],
    });
  } else if (remaining === 0) {
    blocks.push({
      type: "context",
      elements: [
        { type: "mrkdwn", text: "Your allowance resets at the start of next month." },
      ],
    });
  }

  await postToResponseUrl(responseUrl, { response_type: "ephemeral", blocks });
}

/** A small dashboard: who is out, leave by status, and this month's penalties. */
async function handleDashboard(responseUrl: string): Promise<void> {
  const today = businessToday();
  const [absences, summary, penalties] = await Promise.all([
    getAbsencesOn(today),
    getLeaveSummary(),
    getPenaltySummary(today),
  ]);

  const byStatus = new Map(summary.map((r) => [r.Status__c, r.total]));
  const statusLine = ["Submitted", "Approved", "Rejected", "Cancelled"]
    .map((s) => `${s}: *${byStatus.get(s) ?? 0}*`)
    .join("   ");

  const outLines = absences.length
    ? absences
        .slice(0, 15)
        .map((a) => `• ${a.Employee__r?.Name ?? "Unknown"} — ${a.Leave_Type__r?.Name ?? "Leave"}`)
        .join("\n")
    : "_Nobody is out today._";

  const penaltyByPerson = new Map<string, number>();
  for (const p of penalties) {
    const name = p.Employee__r?.Name ?? "Unknown";
    penaltyByPerson.set(name, (penaltyByPerson.get(name) ?? 0) + 1);
  }
  const penaltyLines = penaltyByPerson.size
    ? [...penaltyByPerson.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => `• ${name} — ${count} day(s)`)
        .join("\n")
    : "_No attendance penalties this month._";

  await postToResponseUrl(responseUrl, {
    response_type: "ephemeral",
    blocks: [
      { type: "header", text: { type: "plain_text", text: `HR dashboard, ${today}` } },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*On leave today: ${absences.length}*\n${outLines}` },
      },
      { type: "divider" },
      { type: "section", text: { type: "mrkdwn", text: `*Leave requests this year*\n${statusLine}` } },
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Attendance penalties this month*\n${penaltyLines}` },
      },
    ],
  });
}

async function handleApprovals(
  employee: Awaited<ReturnType<typeof employeeForSlackUser>>,
  responseUrl: string
): Promise<void> {
  if (!employee) return;

  // HR and admin see everything awaiting a decision, so cover is never blocked
  // by a manager being away. Everyone else sees only what is theirs to decide.
  const companyWide = canSeeCompanyWideData(actorFor(employee));
  const [leave, regularizations] = companyWide
    ? await Promise.all([
        getAllPendingApprovals(),
        getAllPendingRegularizations().catch(() => []),
      ])
    : await Promise.all([
        getPendingApprovals(employee.Id),
        getPendingRegularizationApprovals(employee.Id).catch(() => []),
      ]);

  if (leave.length === 0 && regularizations.length === 0) {
    await postToResponseUrl(responseUrl, ephemeral("Nothing is waiting on you."));
    return;
  }

  // Slack truncates past 50 blocks with no error, so cap each list and say so.
  const blocks: unknown[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: companyWide ? "Everything awaiting a decision" : "Waiting for your decision",
      },
    },
  ];
  if (companyWide) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "You can see and action every request. Deciding one that is not yours is recorded as acting on the approver's behalf.",
        },
      ],
    });
  }

  const shownLeave = leave.slice(0, 8);
  for (const request of shownLeave) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `:palm_tree: *${request.Employee__r?.Name ?? "Employee"}* — ${request.Leave_Type__r?.Name ?? "Leave"}\n` +
          `${request.From_Date__c} to ${request.To_Date__c} (${request.Days__c} day(s))` +
          (companyWide && request.Approver__r?.Name ? `\napprover: ${request.Approver__r.Name}` : "") +
          (request.Reason__c ? `\n_${request.Reason__c}_` : ""),
      },
    });
    blocks.push(decisionButtons("approve_leave", "reject_leave", request.Id));
  }

  const shownReg = regularizations.slice(0, 8);
  for (const request of shownReg) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `:clock9: *${request.Employee__r?.Name ?? "Employee"}* — regularization for ${request.Date__c}\n` +
          `In ${request.Requested_Clock_In__c ?? "-"}, out ${request.Requested_Clock_Out__c ?? "-"}` +
          (request.Reason__c ? `\n_${request.Reason__c}_` : ""),
      },
    });
    blocks.push(decisionButtons("approve_regularization", "reject_regularization", request.Id));
  }

  const hiddenLeave = leave.length - shownLeave.length;
  const hiddenReg = regularizations.length - shownReg.length;
  if (hiddenLeave > 0 || hiddenReg > 0) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Not shown: ${hiddenLeave} leave, ${hiddenReg} regularization. Run the command again after actioning these.`,
        },
      ],
    });
  }

  await postToResponseUrl(responseUrl, { response_type: "ephemeral", blocks });
}

/** Approve and Reject buttons carrying the record id. */
function decisionButtons(approveAction: string, rejectAction: string, recordId: string) {
  return {
    type: "actions",
    elements: [
      {
        type: "button",
        action_id: approveAction,
        style: "primary",
        value: recordId,
        text: { type: "plain_text", text: "Approve" },
      },
      {
        type: "button",
        action_id: rejectAction,
        style: "danger",
        value: recordId,
        text: { type: "plain_text", text: "Reject" },
      },
    ],
  };
}
