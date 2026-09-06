/**
 * POST /api/slack/interactivity
 *
 * Receives button clicks and modal submissions.
 *
 * The same authorisation rules as the web portal apply: only the approver named
 * on a request may decide it, nobody may approve their own, and a request that
 * has already been decided cannot be decided again. Those checks live in
 * Salesforce-facing helpers so Slack and the portal cannot drift apart.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { verifySlackRequest } from "@/lib/slack-verify";
import { employeeForSlackUser, ephemeral, postToResponseUrl } from "@/lib/slack";
import { getLeaveTypes, getLeaveBalances, getHolidays } from "@/lib/salesforce-queries";
import { query, updateRecord, createRecord } from "@/lib/salesforce";
import { assertSalesforceId } from "@/lib/soql";
import { countWorkingDays } from "@/lib/leave-days";
import { availableDays } from "@/lib/leave-balance";

export const dynamic = "force-dynamic";

const SLACK_API = "https://slack.com/api";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const verdict = verifySlackRequest(
    rawBody,
    req.headers.get("x-slack-signature"),
    req.headers.get("x-slack-request-timestamp"),
    process.env.SLACK_SIGNING_SECRET
  );
  if (!verdict.ok) {
    console.warn("[slack/interactivity] rejected:", verdict.reason);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payloadRaw = new URLSearchParams(rawBody).get("payload");
  if (!payloadRaw) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  let payload: SlackInteraction;
  try {
    payload = JSON.parse(payloadRaw);
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // A modal submission must be answered on this response, not later, because
  // Slack closes or keeps the modal based on what comes back within 3 seconds.
  if (payload.type === "view_submission") {
    return handleViewSubmission(payload);
  }

  // after() rather than a floating promise: serverless freezes the invocation
  // once the response is sent, which would drop the work entirely.
  after(async () => {
    await handleAction(payload);
  });
  return new NextResponse(null, { status: 200 });
}

interface SlackInteraction {
  type: string;
  user?: { id: string };
  trigger_id?: string;
  response_url?: string;
  actions?: { action_id: string; value?: string }[];
  view?: {
    callback_id?: string;
    state?: { values: Record<string, Record<string, { value?: string; selected_option?: { value: string }; selected_date?: string }>> };
  };
}

async function handleAction(payload: SlackInteraction): Promise<void> {
  const action = payload.actions?.[0];
  const slackUserId = payload.user?.id ?? "";
  const responseUrl = payload.response_url ?? "";
  if (!action) return;

  try {
    const actor = await employeeForSlackUser(slackUserId);
    if (!actor) {
      await postToResponseUrl(responseUrl, ephemeral("Your Slack account is not linked to an employee."));
      return;
    }

    if (action.action_id === "open_leave_modal") {
      await openLeaveModal(payload.trigger_id ?? "", actor.Id);
      return;
    }

    if (action.action_id === "approve_leave" || action.action_id === "reject_leave") {
      const decision = action.action_id === "approve_leave" ? "Approved" : "Rejected";
      const result = await decideLeave(action.value ?? "", actor.Id, decision);
      await postToResponseUrl(responseUrl, {
        response_type: "ephemeral",
        replace_original: false,
        text: result,
      });
    }
  } catch (err) {
    console.error("[slack/interactivity] action failed:", err);
    await postToResponseUrl(responseUrl, ephemeral("That did not go through. Please try again."));
  }
}

/**
 * Applies a decision to a leave request, enforcing the same rules as the portal.
 */
async function decideLeave(
  requestId: string,
  actorEmployeeId: string,
  decision: "Approved" | "Rejected"
): Promise<string> {
  let id: string;
  try {
    id = assertSalesforceId(requestId);
  } catch {
    return "That request id is not valid.";
  }

  const [record] = await query<{
    Id: string;
    Approver__c: string | null;
    Employee__c: string | null;
    Status__c: string | null;
  }>(`
    SELECT Id, Approver__c, Employee__c, Status__c
    FROM Leave_Request__c WHERE Id = '${id}' LIMIT 1
  `);

  if (!record) return "That request no longer exists.";
  if (record.Approver__c !== actorEmployeeId) return "You are not the approver for that request.";
  if (record.Employee__c === actorEmployeeId) return "You cannot decide your own request.";
  if (record.Status__c !== "Submitted") return `That request is already ${record.Status__c}.`;

  await updateRecord("Leave_Request__c", id, { Status__c: decision });
  return `Leave request ${decision.toLowerCase()}.`;
}

/** Opens the apply-for-leave modal. */
async function openLeaveModal(triggerId: string, employeeId: string): Promise<void> {
  if (!triggerId) return;
  const [types, balances] = await Promise.all([getLeaveTypes(), getLeaveBalances(employeeId)]);

  const remainingByType = new Map(
    balances.map((b) => [b.Leave_Type__c, availableDays(b)] as const)
  );

  const options = types.slice(0, 100).map((t) => ({
    text: {
      type: "plain_text",
      text: `${t.Name} (${remainingByType.get(t.Id) ?? 0} left)`.slice(0, 75),
    },
    value: t.Id,
  }));

  await fetch(`${SLACK_API}/views.open`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN ?? ""}`,
    },
    body: JSON.stringify({
      trigger_id: triggerId,
      view: {
        type: "modal",
        callback_id: "leave_apply",
        title: { type: "plain_text", text: "Apply for leave" },
        submit: { type: "plain_text", text: "Submit" },
        close: { type: "plain_text", text: "Cancel" },
        blocks: [
          {
            type: "input",
            block_id: "leave_type",
            label: { type: "plain_text", text: "Leave type" },
            element: {
              type: "static_select",
              action_id: "value",
              options,
            },
          },
          {
            type: "input",
            block_id: "from_date",
            label: { type: "plain_text", text: "From" },
            element: { type: "datepicker", action_id: "value" },
          },
          {
            type: "input",
            block_id: "to_date",
            label: { type: "plain_text", text: "To" },
            element: { type: "datepicker", action_id: "value" },
          },
          {
            type: "input",
            block_id: "reason",
            optional: true,
            label: { type: "plain_text", text: "Reason" },
            element: { type: "plain_text_input", action_id: "value", multiline: true },
          },
        ],
      },
    }),
  });
}

/**
 * Validates and creates the leave request. Errors are returned as Slack
 * response_action errors so they appear against the offending field.
 */
async function handleViewSubmission(payload: SlackInteraction): Promise<NextResponse> {
  if (payload.view?.callback_id !== "leave_apply") {
    return new NextResponse(null, { status: 200 });
  }

  const values = payload.view.state?.values ?? {};
  const leaveTypeId = values.leave_type?.value?.selected_option?.value ?? "";
  const fromDate = values.from_date?.value?.selected_date ?? "";
  const toDate = values.to_date?.value?.selected_date ?? "";
  const reason = values.reason?.value?.value ?? "";

  if (fromDate > toDate) {
    return NextResponse.json({
      response_action: "errors",
      errors: { to_date: "The end date must be on or after the start date." },
    });
  }

  try {
    const actor = await employeeForSlackUser(payload.user?.id ?? "");
    if (!actor) {
      return NextResponse.json({
        response_action: "errors",
        errors: { leave_type: "Your Slack account is not linked to an employee." },
      });
    }

    const holidays = await getHolidays();
    const holidayDates = new Set(
      holidays.map((h) => h.Date__c).filter((d): d is string => Boolean(d))
    );
    const days = countWorkingDays(fromDate, toDate, holidayDates, false);
    if (days <= 0) {
      return NextResponse.json({
        response_action: "errors",
        errors: { from_date: "That range has no working days once weekends and holidays are removed." },
      });
    }

    const balances = await getLeaveBalances(actor.Id);
    const balance = balances.find((b) => b.Leave_Type__c === leaveTypeId);
    const remaining = balance ? availableDays(balance) : 0;
    if (days > remaining) {
      return NextResponse.json({
        response_action: "errors",
        errors: { leave_type: `That needs ${days} day(s) and you have ${remaining} left.` },
      });
    }

    await createRecord("Leave_Request__c", {
      Employee__c: actor.Id,
      Leave_Type__c: leaveTypeId,
      From_Date__c: fromDate,
      To_Date__c: toDate,
      Days__c: days,
      Half_Day__c: false,
      Reason__c: reason,
      Status__c: "Submitted",
      Approver__c: actor.Reporting_Manager__c,
    });

    return NextResponse.json({ response_action: "clear" });
  } catch (err) {
    console.error("[slack/interactivity] leave submission failed:", err);
    return NextResponse.json({
      response_action: "errors",
      errors: { leave_type: "Could not save that in Salesforce. Please try again." },
    });
  }
}
