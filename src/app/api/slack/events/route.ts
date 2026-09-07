/**
 * POST /api/slack/events
 *
 * Slack Events API receiver. Handles the one-off url_verification handshake and
 * acknowledges everything else immediately; Slack retries anything not answered
 * within 3 seconds, so this route never does real work inline.
 *
 * The one event acted on is team_join. Employees are matched to Slack accounts
 * by email address, and doing that by hand is why only two of twenty-eight are
 * linked today. When somebody accepts their Slack invitation, this fills in
 * Slack_User_Id__c for them, so notifications start working without anyone
 * running a script.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { verifySlackRequest } from "@/lib/slack-verify";
import { queryOneOrNull, updateRecord } from "@/lib/salesforce";
import { escapeSoqlString } from "@/lib/soql";

export const dynamic = "force-dynamic";

interface SlackTeamJoinEvent {
  type?: string;
  user?: {
    id?: string;
    deleted?: boolean;
    is_bot?: boolean;
    profile?: { email?: string; real_name?: string };
  };
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const verdict = verifySlackRequest(
    rawBody,
    req.headers.get("x-slack-signature"),
    req.headers.get("x-slack-request-timestamp"),
    process.env.SLACK_SIGNING_SECRET
  );

  if (!verdict.ok) {
    console.warn("[slack/events] rejected:", verdict.reason);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: { type?: string; challenge?: string; event?: SlackTeamJoinEvent };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // Slack proves it owns this URL by asking us to echo a challenge back.
  if (payload.type === "url_verification" && payload.challenge) {
    return new NextResponse(payload.challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  if (payload.event?.type === "team_join") {
    // after() rather than a floating promise: a serverless invocation is frozen
    // the moment its response is sent, which silently drops background work.
    after(() => linkNewMember(payload.event as SlackTeamJoinEvent));
  }

  return NextResponse.json({ ok: true });
}

/**
 * Matches a newly joined Slack member to an employee by email and records the
 * Slack id against them. Never throws: this runs after the response, and a
 * failure here must not turn into a Slack retry storm.
 */
async function linkNewMember(event: SlackTeamJoinEvent): Promise<void> {
  const slackUserId = event.user?.id;
  const email = event.user?.profile?.email?.trim().toLowerCase();

  if (!slackUserId || event.user?.is_bot || event.user?.deleted) {
    return;
  }
  if (!email) {
    // The email is only present when the app holds users:read.email. Without
    // that scope there is nothing to match on, and saying so beats silence.
    console.warn(
      `[slack/events] ${slackUserId} joined with no email in the payload. ` +
      `Grant the app users:read.email to link members automatically.`
    );
    return;
  }

  try {
    const emp = await queryOneOrNull<{
      Id: string;
      Name: string;
      Slack_User_Id__c: string | null;
    }>(`
      SELECT Id, Name, Slack_User_Id__c
      FROM Employee__c
      WHERE Official_Email__c = '${escapeSoqlString(email)}'
        AND Employee_Status__c = 'Active'
      LIMIT 1
    `);

    if (!emp) {
      console.warn(`[slack/events] ${email} joined Slack but matches no active employee.`);
      return;
    }
    if (emp.Slack_User_Id__c === slackUserId) {
      return;
    }
    // A changed id means the person was removed and re-invited, so overwriting
    // is right; the old id would no longer receive anything.
    await updateRecord("Employee__c", emp.Id, { Slack_User_Id__c: slackUserId });
    console.log(`[slack/events] linked ${emp.Name} to Slack member ${slackUserId}`);
  } catch (err) {
    console.error("[slack/events] failed to link new member:", err);
  }
}
