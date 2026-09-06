# CloudSheer HRMS

A Salesforce-backed HRMS with Slack as the primary employee interface and a
Next.js web portal for administration.

Employees apply for leave, clock in and out, and get their approvals in Slack.
Salesforce holds the record and every business rule. The portal covers what does
not fit in a chat window.

## Documentation

| Document | Answers |
|---|---|
| [docs/BUILD_STATUS.md](docs/BUILD_STATUS.md) | What is built, what is not, and what is blocking each thing |
| [docs/KEKA_PARITY.md](docs/KEKA_PARITY.md) | How this compares against Keka, module by module |
| [docs/HRMS_BUILD_REFERENCE.md](docs/HRMS_BUILD_REFERENCE.md) | How the system works, in detail |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Objects, relationships and derived fields |

## Layout

| Path | Holds |
|---|---|
| `src/app` | Next.js App Router: pages, API routes, the Slack gateway |
| `src/lib` | Salesforce access, permissions, attendance and leave calculation |
| `sf-hrms/` | SFDX source: objects, fields, Apex, triggers, permission sets |
| `scripts/` | One-off operational scripts |

## Running locally

```bash
npm install
npm run dev
```

Requires Salesforce credentials in `.env.local`. See
[docs/HRMS_BUILD_REFERENCE.md](docs/HRMS_BUILD_REFERENCE.md) for the full
configuration reference.

## Deployment

Pushing to `main` deploys the portal to Vercel automatically. Salesforce metadata
deploys separately:

```bash
cd sf-hrms
sf project deploy start --source-dir force-app --target-org hrms-org
```
