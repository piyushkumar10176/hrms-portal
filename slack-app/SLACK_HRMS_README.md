# Slack HRMS

The Salesforce-native app. Slack talks to Salesforce and nothing else: no
hosted gateway, no portal, no Vercel.

App id: **A0C0Z0L6ZLP**
Workspace: Cloudsheer HRMS (`T0BV8DT6LKG`)
Manage at: https://api.slack.com/apps/A0C0Z0L6ZLP

Created from `manifest-slack-hrms.json` with `apps.manifest.create`, which is
also how it should be changed: edit the manifest, then push it with
`apps.manifest.update`, so the file and the app cannot drift apart.

## Where every request goes

```
https://orgfarm-7f6d730097-dev-ed.develop.my.salesforce-sites.com
  /slack                      the Salesforce Site
  /services/apexrest          Apex REST
  /slack/{commands|interactivity|events}
```

## How a request is proved genuine

Two methods, chosen by what survived the request rather than by content type,
which a caller controls.

**Events** arrive as JSON, keep their body, and are checked by HMAC signature:
the strongest proof, covering origin, integrity and replay.

**Commands and interactivity** arrive form-encoded. Apex REST consumes a form
body into params and leaves the body empty, so there is nothing left to compute
a digest over, and rebuilding it does not work because the decoding is lossy and
a Map loses the field order. These are checked against the verification token
instead. That is a weaker proof: it travels in the request rather than being
derived from it, so it carries no replay protection.

Both credentials live in the **Slack Config** protected custom setting in
Salesforce, never in this repository.

## Turning it off

Untick **Gateway Enabled** in Slack Config. Every endpoint then answers 503 and
the app goes inert without touching Slack.

## What works

All six slash commands, and the Approve and Reject buttons.

Not yet ported: App Home, modals (applying for leave, onboarding, editing,
offboarding), and the admin surfaces. Those still live only on the older
**CloudSheer HRMS** app, which points at the hosted gateway and is untouched.

Run both side by side until the port is finished.
