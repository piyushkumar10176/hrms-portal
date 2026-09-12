/**
 * GET /api/health
 *
 * Says whether this deployment is configured, without revealing any secret and
 * without needing a signed Slack request. Useful for confirming a fresh deploy
 * before repointing Slack at it.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    service: "hrms-slack-gateway",
    ok: true,
    // Booleans only. Never the values.
    configured: {
      salesforce: Boolean(
        process.env.SF_INSTANCE_URL &&
          (process.env.SF_REFRESH_TOKEN || process.env.SF_PASSWORD)
      ),
      slackBotToken: Boolean(process.env.SLACK_BOT_TOKEN),
      slackSigningSecret: Boolean(process.env.SLACK_SIGNING_SECRET),
      slackTeamId: Boolean(process.env.SLACK_TEAM_ID),
      biometricWebhook: Boolean(process.env.BIOMETRIC_WEBHOOK_SECRET),
      email: process.env.EMAIL_DRIVER || "disabled",
    },
  });
}
