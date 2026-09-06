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
import { employeeForSlackUser, ephemeral, postToResponseUrl, canOverrideApproval, type SlackEmployee } from "@/lib/slack";
import {
  getLeaveTypes,
  getLeaveBalances,
  getHolidays,
  getPenalisedDays,
  countRegularizationsInMonth,
} from "@/lib/salesforce-queries";
import { query, updateRecord, createRecord } from "@/lib/salesforce";
import { assertSalesforceId } from "@/lib/soql";
import { countWorkingDays, SHIFT_START, SHIFT_END, SHIFT_MIDPOINT, type HalfDaySession } from "@/lib/leave-days";
import { availableDays } from "@/lib/leave-balance";
import { businessToday } from "@/lib/business-time";

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

/** A Block Kit block. Only the type matters here; the rest is passed through. */
interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

interface SlackInteraction {
  type: string;
  user?: { id: string };
  trigger_id?: string;
  response_url?: string;
  actions?: { action_id: string; value?: string }[];
  message?: { blocks?: SlackBlock[] };
  view?: {
    callback_id?: string;
    state?: {
      values: Record<
        string,
        Record<
          string,
          {
            value?: string;
            selected_option?: { value: string };
            selected_date?: string;
            selected_time?: string;
          }
        >
      >;
    };
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

    if (action.action_id === "cancel_leave") {
      const outcome = await cancelOwnLeave(action.value ?? "", actor);
      if (!outcome.decided) {
        await postToResponseUrl(responseUrl, ephemeral(outcome.message));
        return;
      }
      const original = payload.message?.blocks ?? [];
      const withoutButtons = original.filter((block) => block.type !== "actions");
      withoutButtons.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: `:no_entry_sign: *Cancelled* by ${actor.Name}` }],
      });
      await postToResponseUrl(responseUrl, {
        replace_original: true,
        blocks: withoutButtons,
        text: outcome.message,
      });
      return;
    }

    if (action.action_id === "open_regularize_modal") {
      await openRegularizeModal(payload.trigger_id ?? "", actor.Id, responseUrl);
      return;
    }

    const decisionActions: Record<string, { object: string; label: string; decision: "Approved" | "Rejected" }> = {
      approve_leave: { object: "Leave_Request__c", label: "Leave request", decision: "Approved" },
      reject_leave: { object: "Leave_Request__c", label: "Leave request", decision: "Rejected" },
      approve_regularization: { object: "Regularization_Request__c", label: "Regularization", decision: "Approved" },
      reject_regularization: { object: "Regularization_Request__c", label: "Regularization", decision: "Rejected" },
    };

    const decisionAction = decisionActions[action.action_id];
    if (decisionAction) {
      const outcome = await decideRequest(
        decisionAction.object, decisionAction.label, action.value ?? "", actor, decisionAction.decision
      );

      if (!outcome.decided) {
        // Refused, so leave the message alone: the buttons stay for whoever may
        // legitimately act on it, and only the clicker sees why they could not.
        await postToResponseUrl(responseUrl, ephemeral(outcome.message));
        return;
      }

      // Decided: rewrite the original message without its buttons, so a settled
      // request cannot be clicked again and the outcome is visible to everyone
      // who can see it.
      const original = payload.message?.blocks ?? [];
      const withoutButtons = original.filter((block) => block.type !== "actions");
      withoutButtons.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `${decisionAction.decision === "Approved" ? ":white_check_mark:" : ":x:"} ` +
                  `*${decisionAction.decision}* by ${actor.Name}`,
          },
        ],
      });

      await postToResponseUrl(responseUrl, {
        replace_original: true,
        blocks: withoutButtons,
        text: outcome.message,
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
/** Whether the decision was applied, and what to tell the clicker. */
interface DecisionOutcome {
  decided: boolean;
  message: string;
}

async function decideRequest(
  objectName: string,
  label: string,
  requestId: string,
  actor: SlackEmployee,
  decision: "Approved" | "Rejected"
): Promise<DecisionOutcome> {
  let id: string;
  try {
    id = assertSalesforceId(requestId);
  } catch {
    return { decided: false, message: "That request id is not valid." };
  }

  const [record] = await query<{
    Id: string;
    Approver__c: string | null;
    Employee__c: string | null;
    Status__c: string | null;
  }>(`
    SELECT Id, Approver__c, Employee__c, Status__c
    FROM ${objectName} WHERE Id = '${id}' LIMIT 1
  `);

  if (!record) return { decided: false, message: "That request no longer exists." };

  const isApprover = record.Approver__c === actor.Id;
  const isHrOverride = canOverrideApproval(actor);
  if (!isApprover && !isHrOverride) {
    return { decided: false, message: "You are not the approver for that request." };
  }
  // Approving your own leave is refused even for HR.
  if (record.Employee__c === actor.Id) {
    return { decided: false, message: "You cannot decide your own request." };
  }
  if (record.Status__c !== "Submitted") {
    return { decided: false, message: `That request is already ${record.Status__c}.` };
  }

  await updateRecord(objectName, id, { Status__c: decision });
  return {
    decided: true,
    message: isApprover
      ? `${label} ${decision.toLowerCase()}.`
      : `${label} ${decision.toLowerCase()} as an HR override.`,
  };
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
            block_id: "duration",
            label: { type: "plain_text", text: "Duration" },
            element: {
              type: "static_select",
              action_id: "value",
              initial_option: {
                text: { type: "plain_text", text: "Full day" },
                value: "full",
              },
              options: [
                { text: { type: "plain_text", text: "Full day" }, value: "full" },
                {
                  text: { type: "plain_text", text: `Half day, first half (${SHIFT_START}-${SHIFT_MIDPOINT})` },
                  value: "first",
                },
                {
                  text: { type: "plain_text", text: `Half day, second half (${SHIFT_MIDPOINT}-${SHIFT_END})` },
                  value: "second",
                },
              ],
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `Shift runs ${SHIFT_START} to ${SHIFT_END}. A half day counts as 0.5 and applies to a single date.`,
              },
            ],
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

/** Monthly regularization allowance, mirroring the Salesforce label. */
const REGULARIZATIONS_PER_MONTH = Number(process.env.HRMS_REGULARIZATIONS_PER_MONTH ?? "3");

/**
 * Opens the regularization modal, pre-filled with the month's penalised days.
 *
 * The allowance is re-checked here as well as on submission, because the button
 * that opened this modal may have been rendered before the last one was used.
 */
async function openRegularizeModal(
  triggerId: string,
  employeeId: string,
  responseUrl: string
): Promise<void> {
  if (!triggerId) return;
  const today = businessToday();
  const [penalised, used] = await Promise.all([
    getPenalisedDays(employeeId, today),
    countRegularizationsInMonth(employeeId, today),
  ]);

  if (used >= REGULARIZATIONS_PER_MONTH) {
    await postToResponseUrl(
      responseUrl,
      ephemeral(`You have used all ${REGULARIZATIONS_PER_MONTH} regularizations this month.`)
    );
    return;
  }
  if (penalised.length === 0) {
    await postToResponseUrl(responseUrl, ephemeral("No penalised days to regularize this month."));
    return;
  }

  const options = penalised.slice(0, 100).map((d) => ({
    text: {
      type: "plain_text",
      text: `${d.Date__c} — ${(d.Penalty_Reason__c ?? "policy breach").slice(0, 50)}`.slice(0, 75),
    },
    value: d.Date__c,
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
        callback_id: "regularize_apply",
        title: { type: "plain_text", text: "Regularize" },
        submit: { type: "plain_text", text: "Submit" },
        close: { type: "plain_text", text: "Cancel" },
        blocks: [
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `${REGULARIZATIONS_PER_MONTH - used} of ${REGULARIZATIONS_PER_MONTH} remaining this month.`,
              },
            ],
          },
          {
            type: "input",
            block_id: "on_date",
            label: { type: "plain_text", text: "Day to regularize" },
            element: { type: "static_select", action_id: "value", options },
          },
          {
            type: "input",
            block_id: "clock_in",
            label: { type: "plain_text", text: "Actual clock in" },
            element: { type: "timepicker", action_id: "value" },
          },
          {
            type: "input",
            block_id: "clock_out",
            label: { type: "plain_text", text: "Actual clock out" },
            element: { type: "timepicker", action_id: "value" },
          },
          {
            type: "input",
            block_id: "reason",
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
  if (payload.view?.callback_id === "regularize_apply") {
    return handleRegularizeSubmission(payload);
  }
  if (payload.view?.callback_id !== "leave_apply") {
    return new NextResponse(null, { status: 200 });
  }

  const values = payload.view.state?.values ?? {};
  const leaveTypeId = values.leave_type?.value?.selected_option?.value ?? "";
  const fromDate = values.from_date?.value?.selected_date ?? "";
  const toDate = values.to_date?.value?.selected_date ?? "";
  const reason = values.reason?.value?.value ?? "";
  const duration = values.duration?.value?.selected_option?.value ?? "full";
  const isHalfDay = duration === "first" || duration === "second";
  const session: HalfDaySession | null = duration === "first"
    ? "First Half"
    : duration === "second"
      ? "Second Half"
      : null;

  if (fromDate > toDate) {
    return NextResponse.json({
      response_action: "errors",
      errors: { to_date: "The end date must be on or after the start date." },
    });
  }

  // Half of several days is meaningless, so it is refused rather than guessed at.
  if (isHalfDay && fromDate !== toDate) {
    return NextResponse.json({
      response_action: "errors",
      errors: { duration: "A half day applies to one date. Set the same date for both, or choose Full day." },
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
    const days = countWorkingDays(fromDate, toDate, holidayDates, isHalfDay);
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
      Half_Day__c: isHalfDay,
      Half_Day_Session__c: session,
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

/**
 * Creates the regularization request after re-checking the monthly allowance.
 *
 * The allowance is enforced here, not only in the UI, because the modal could
 * have been open while another request was submitted elsewhere.
 */
async function handleRegularizeSubmission(payload: SlackInteraction): Promise<NextResponse> {
  const values = payload.view?.state?.values ?? {};
  const onDate = values.on_date?.value?.selected_option?.value ?? "";
  const clockIn = values.clock_in?.value?.selected_time ?? "";
  const clockOut = values.clock_out?.value?.selected_time ?? "";
  const reason = values.reason?.value?.value ?? "";

  if (clockIn && clockOut && clockOut <= clockIn) {
    return NextResponse.json({
      response_action: "errors",
      errors: { clock_out: "Clock out must be after clock in." },
    });
  }

  try {
    const actor = await employeeForSlackUser(payload.user?.id ?? "");
    if (!actor) {
      return NextResponse.json({
        response_action: "errors",
        errors: { on_date: "Your Slack account is not linked to an employee." },
      });
    }

    const used = await countRegularizationsInMonth(actor.Id, onDate || businessToday());
    if (used >= REGULARIZATIONS_PER_MONTH) {
      return NextResponse.json({
        response_action: "errors",
        errors: {
          on_date: `You have used all ${REGULARIZATIONS_PER_MONTH} regularizations for that month.`,
        },
      });
    }

    await createRecord("Regularization_Request__c", {
      Employee__c: actor.Id,
      Date__c: onDate,
      Requested_Clock_In__c: clockIn ? `${clockIn}:00.000Z` : null,
      Requested_Clock_Out__c: clockOut ? `${clockOut}:00.000Z` : null,
      Reason__c: reason,
      Status__c: "Submitted",
      Approver__c: actor.Reporting_Manager__c,
    });

    return NextResponse.json({ response_action: "clear" });
  } catch (err) {
    console.error("[slack/interactivity] regularization failed:", err);
    return NextResponse.json({
      response_action: "errors",
      errors: { on_date: "Could not save that in Salesforce. Please try again." },
    });
  }
}

/**
 * Cancels the requester's own leave, before or after approval.
 *
 * Only the person who asked may cancel, and only while the leave has not wholly
 * passed. The balance needs no adjustment here: Cancelled is not one of the
 * statuses that consume leave, so the trigger restores the days on its own.
 */
async function cancelOwnLeave(
  requestId: string,
  actor: SlackEmployee
): Promise<DecisionOutcome> {
  let id: string;
  try {
    id = assertSalesforceId(requestId);
  } catch {
    return { decided: false, message: "That request id is not valid." };
  }

  const [record] = await query<{
    Id: string;
    Employee__c: string | null;
    Status__c: string | null;
    To_Date__c: string | null;
    Days__c: number | null;
  }>(`
    SELECT Id, Employee__c, Status__c, To_Date__c, Days__c
    FROM Leave_Request__c WHERE Id = '${id}' LIMIT 1
  `);

  if (!record) return { decided: false, message: "That request no longer exists." };
  if (record.Employee__c !== actor.Id) {
    return { decided: false, message: "You can only cancel your own leave." };
  }
  if (record.Status__c !== "Submitted" && record.Status__c !== "Approved") {
    return { decided: false, message: `That request is already ${record.Status__c}.` };
  }
  if (record.To_Date__c && record.To_Date__c < businessToday()) {
    return {
      decided: false,
      message: "That leave has already been taken. Ask HR to correct it.",
    };
  }

  await updateRecord("Leave_Request__c", id, {
    Status__c: "Cancelled",
    Cancelled_On__c: new Date().toISOString(),
    Cancellation_Reason__c: "Cancelled by the requester in Slack",
  });

  return {
    decided: true,
    message: `Leave cancelled. ${record.Days__c ?? 0} day(s) returned to your balance.`,
  };
}
