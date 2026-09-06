/**
 * POST /api/slack/events
 *
 * Slack Events API receiver. Handles the one-off url_verification handshake and
 * acknowledges everything else immediately; Slack retries anything not answered
 * within 3 seconds, so this route never does real work inline.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySlackRequest } from "@/lib/slack-verify";

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
    console.warn("[slack/events] rejected:", verdict.reason);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: { type?: string; challenge?: string; event?: { type?: string } };
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

  return NextResponse.json({ ok: true });
}
