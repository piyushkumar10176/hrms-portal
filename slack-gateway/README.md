# HRMS Slack Gateway

Everything Slack and the biometric device call, deployed on its own so the web
portal can be switched off without taking Slack down with it.

## Why this exists separately

The Slack routes used to live inside the portal's deployment. They never read
data *from* the portal — both talk to Salesforce directly — but they shared a
deployment, so deleting the portal would have taken down every slash command,
every button, the App Home tab and the biometric endpoint at the same time.

```
Slack     ──►  this gateway  ──►  Salesforce
Device    ──►  this gateway  ──►  Salesforce
Portal    ─────────────────────►  Salesforce     (separate, disposable)
```

## What it serves

| Route | Called by |
|---|---|
| `POST /api/slack/commands` | The six slash commands |
| `POST /api/slack/interactivity` | Every button, modal and App Home action |
| `POST /api/slack/events` | App Home rendering, and `team_join` linking |
| `POST /api/webhook/biometric/punch` | The attendance terminal |
| `GET /api/health` | You, to check a deploy before repointing Slack at it |

It serves no pages. A browser visiting the root gets nothing, which is correct.

## What does not live here

Salesforce holds the data and all the business rules. The attendance rollup,
break derivation, leave balances, penalties and the notifications Salesforce
sends to Slack are Apex, and keep working whether or not this is running.

## Deploying

A separate Vercel project pointed at this directory, with **Root Directory** set
to `slack-gateway`. Environment variables are listed in `.env.example`; the
Salesforce and Slack ones are the same values the portal already uses.

After the first deploy, check `/api/health` before repointing Slack. It reports
which settings are present as booleans, never their values.

## A note on SLACK_TEAM_ID

Leave it blank. Every call this gateway makes is aimed at a person, and those
work without it. It is only needed for posts to a channel on an Enterprise Grid
org-wide install, and the value would then be the workspace id beginning with
`T`, not the enterprise id beginning with `E`.

## The shared code

`src/lib` is a copy of the portal's, not a shared package. Extracting it would
have meant changing the portal, which had to keep running untouched for a demo.

The duplication has an end date: when the portal goes, its copy goes with it and
this becomes the only one. Until then, **anything Slack-related is changed
here**, and the portal's copy is left frozen.
