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

import { NextRequest, NextResponse } from "next/server";
import { verifySlackRequest } from "@/lib/slack-verify";
import {
  employeeForSlackUser,
  ephemeral,
  notLinkedMessage,
  postToResponseUrl,
} from "@/lib/slack";
import {
  getLeaveBalances,
  getLeaveRequests,
  getPendingApprovals,
  getTodayPunches,
  createPunch,
} from "@/lib/salesforce-queries";
import { toLeaveBalanceView } from "@/lib/leave-balance";
import { businessTimeNow } from "@/lib/business-time";

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
  void handleCommand(command, text, slackUserId, responseUrl);

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
        await handleApprovals(employee.Id, responseUrl);
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
    ephemeral("Try `/myleave balance`, `/myleave apply` or `/myleave status`.")
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

async function handleApprovals(employeeId: string, responseUrl: string): Promise<void> {
  const pending = await getPendingApprovals(employeeId);
  if (pending.length === 0) {
    await postToResponseUrl(responseUrl, ephemeral("Nothing is waiting on you."));
    return;
  }

  // Slack truncates silently past 50 blocks, so cap the list and say so.
  const shown = pending.slice(0, 10);
  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: "Waiting for your decision" } },
  ];

  for (const request of shown) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*${request.Employee__r?.Name ?? "Employee"}* — ${request.Leave_Type__r?.Name ?? "Leave"}\n` +
          `${request.From_Date__c} to ${request.To_Date__c} (${request.Days__c} day(s))` +
          (request.Reason__c ? `\n_${request.Reason__c}_` : ""),
      },
    });
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: "approve_leave",
          style: "primary",
          value: request.Id,
          text: { type: "plain_text", text: "Approve" },
        },
        {
          type: "button",
          action_id: "reject_leave",
          style: "danger",
          value: request.Id,
          text: { type: "plain_text", text: "Reject" },
        },
      ],
    });
  }

  if (pending.length > shown.length) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Showing ${shown.length} of ${pending.length}. Run the command again after actioning these.`,
        },
      ],
    });
  }

  await postToResponseUrl(responseUrl, { response_type: "ephemeral", blocks });
}
