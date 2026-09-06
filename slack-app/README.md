# CloudSheer HRMS Slack app

Sandbox: **Cloudsheer HRMS** (`E0C001VB7JQ`) at https://cloudsheer-hrms.slack.com
App id: **A0BVCALTXBK**

`manifest.json` is the source of truth for the app configuration. It was created
with `apps.manifest.create` and can be updated with `apps.manifest.update`.

## Endpoints

All three point at the Next.js gateway, which verifies Slack's signature and
then talks to Salesforce. No business logic lives in the gateway.

| Purpose | URL |
|---|---|
| Slash commands | `/api/slack/commands` |
| Interactivity (buttons, modals) | `/api/slack/interactivity` |
| Events | `/api/slack/events` |

## Commands

- `/myleave balance` — remaining days per leave type, with an Apply button
- `/myleave apply` — opens the leave modal
- `/myleave status` — your recent requests
- `/attendance in` / `out` / `today`
- `/approvals` — requests awaiting your decision, with Approve and Reject buttons

`/leave` is reserved by Slack for leaving a channel, which is why the command is
`/myleave`.

## Secrets

- `SLACK_SIGNING_SECRET` is set in Vercel production. Used to verify every
  inbound request.
- `SLACK_BOT_TOKEN` must be set in Vercel after installing the app. Needed to
  open modals via `views.open`.
- The same bot token goes into Salesforce, as the `BotToken` authentication
  parameter on the `Slack_API` external credential, for outbound notifications.
