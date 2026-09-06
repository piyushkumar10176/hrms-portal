# CloudSheer HRMS build reference

Salesforce holds the record. Slack is where people do the work. This describes
what exists, how data moves through it, and what remains before it displaces
Keka for the employee-facing half.

Compiled 6 September 2026 from the live org and this repository. Record counts
and test figures were read at that time and drift as the system is used.

- 29 employees, 34 custom objects
- 104 Apex tests, 86% org-wide coverage
- 6 Slack slash commands

---

## 1. The shape of it

Two layers, frequently confused, doing unrelated jobs.

**Salesforce is the system of record.** Every employee, leave request, balance,
punch and attendance day lives there. All business rules are enforced in Apex:
balance arithmetic, working-day counts, attendance penalties, the regularization
cap, approval authority.

**The Next.js app is a gateway, not a brain.** It verifies Slack's request
signature, answers inside Slack's three-second deadline, and asks Salesforce to
do the work. It holds no business rules. It lives on Vercel because that
deadline is unforgiving and a Salesforce Site guest-user endpoint would add
cold-start latency and a public attack surface on the org itself.

The web portal still exists and still works. It is no longer the only way in,
and for day-to-day employee tasks it is no longer the primary one.

> **Why the portal cannot simply be deleted.** Something must receive Slack's
> interactivity payloads over HTTPS within three seconds. Even if every screen
> were retired, the gateway routes would remain. What can go is the UI, not the
> service.

---

## 2. How a leave request moves

```
  Slack                Gateway (Vercel)          Salesforce
  ---------            ------------------        --------------------------
  /myleave apply  -->  verify HMAC signature -->  working days, minus
  modal: type,         reject if > 5 min old      weekends and holidays
  dates, reason        map Slack id to            balance sufficiency
                       Employee__c                overlap check
                       ack within 3 seconds       insert Leave_Request__c
                                                  trigger recalculates balance
                                                          |
                                                          v
  Slack, back out  <-------------------------  Queueable + Named Credential
  DM to approver                               chat.postMessage
  post to #hrms with buttons

  Also written in the same transaction:
  Notification__c, Leave_Balance__c, HistoryRecord__c  (visible in the portal)
```

Every rule is enforced in Salesforce. The gateway validates *who is asking*,
never *what they may do*.

Approval runs the same way in reverse. A click on **Approve** reaches the
gateway, which re-reads the record and refuses unless the clicker is the named
approver on it. The buttons are a convenience; they are not the authorisation
boundary. Once a decision lands, the original message is rewritten without its
buttons and a line is appended naming who decided.

---

## 3. Slack commands

App `A0BVCALTXBK` in the `Cloudsheer HRMS` sandbox (`E0C001VB7JQ`). Every
command hits `/api/slack/commands`.

| Command | What it does |
|---|---|
| `/myleave balance` | Days remaining per leave type, with a button to apply |
| `/myleave apply` | Opens the leave modal. Days are counted server-side |
| `/myleave status` | Your recent requests and where each one stands |
| `/attendance in \| out` | Punch, with sequence checks so you cannot clock in twice |
| `/attendance today` | Today's punches |
| `/approvals` | Leave and regularizations awaiting your decision |
| `/whosout` | Who is on approved leave today |
| `/regularize` | This month's penalised days and remaining allowance |
| `/hrdash` | Who is out, leave counts by status, penalties this month |

`/leave` is reserved by Slack for leaving a channel and cannot be registered,
which is why the command is `/myleave`.

**Daily digest.** A scheduled job posts to `#hrms` (`C0BVCBYSEJV`) at 09:00 IST
on weekdays: who is on approved leave, any holiday falling that day, and
everything still awaiting a decision. Nobody has to ask for it.

---

## 4. Attendance policy

Every threshold is a Custom Label, so the policy changes in Setup without a code
deploy.

| Rule | Label | Value |
|---|---|---|
| Arrival at or after this time is a penalty | `HRMS_Penalty_Arrival_Time` | 11:00 |
| Working less than this is a penalty | `HRMS_Penalty_Minimum_Hours` | 9 |
| Hours that count as a full day | `HRMS_Default_Full_Day_Hours` | 9 |
| Regularizations per employee per month | `HRMS_Regularizations_Per_Month` | 3 |
| Business time zone | `HRMS_Business_Time_Zone` | Asia/Kolkata |

**Penalties are derived, never sticky.** They are recomputed from the punches
every time those punches change, so correcting a punch clears the flag rather
than leaving it stuck. Weekends and holidays are never penalised. A day still
open because there is no check-out yet is left alone rather than judged early.

**Rejected regularizations still consume the monthly allowance.** The cap exists
to stop regularization substituting for turning up, not to reward being refused.
The allowance is checked when the modal opens and again on submission, because
the button may have been drawn before the last one was used.

Worked example from the seeded data, showing each branch:

| Day | Arrived | Hours | Outcome |
|---|---|---|---|
| Wed 2 Sep | 11:45 | 9.25 | Late only |
| Thu 3 Sep | 09:30 | 6.50 | Short shift only |
| Wed 2 Sep (other employee) | 12:10 | 4.83 | Both reasons |
| Fri 4 Sep | 09:25 | 9.42 | No penalty |
| Sun 6 Sep | 13:02 | 1.41 | Week off, exempt |

---

## 5. Biometric sync

There are two ways a physical punch machine reaches Salesforce, and which one
applies depends entirely on the device.

### Option A: the device pushes, in real time

ZKTeco, eSSL, Biomax and Matrix devices support a push mode, usually through a
cloud bridge such as CAMS. The device sends an HTTP POST to a URL you configure,
as each punch happens:

```json
{
  "RealTime": {
    "OperationID": "unique-id",
    "PunchLog": {
      "Type": "CheckIn",
      "InputType": "Fingerprint",
      "UserId": "EMP018",
      "LogTime": "2026-09-06 09:24:11 GMT +0530"
    },
    "AuthToken": "<32 characters>",
    "Time": "2026-09-06 03:54:11 GMT +0000"
  }
}
```

The endpoint validates `AuthToken`, returns `{"status":"done"}` immediately, and
queues the work. That last part is a hard requirement, not a nicety: the device
will not wait.

This repository already carries a stub at `/api/webhook/biometric/punch` built
for exactly this shape. It validates a secret and returns a stub response; the
processing block is written and commented out. Making it live is roughly a day:
read the token from the body rather than a header, map `UserId` to
`Employee_Code__c`, and write `Attendance_Punch__c`.

### Option B: you poll the vendor

Truein offers **no webhooks at all**. Its API is pull-only, and the constraints
shape the design:

- Bearer token from `getAccessToken`, expiring every 24 hours
- One request per 40 seconds, per endpoint and key
- `getPunchLog` caps at a 31-day window and 500 pairs per call

That means scheduled Apex on a cursor, not a webhook. Perhaps two days including
token refresh and pagination. Attendance would lag by the polling interval
rather than appearing instantly.

> **Confirm the device before anyone builds.** The two designs share nothing but
> the destination. The existing stub assumes push, which is right for ZKTeco and
> eSSL and wrong for Truein. Naming the exact make and model settles it in a
> minute and saves a week.

Either way the rest is already in place. A punch becomes `Attendance_Punch__c`;
a trigger rolls punches into a daily `Attendance__c` row with first check-in,
last check-out, hours, lateness and penalty; the digest and `/hrdash` read from
that. Adding the biometric feed changes where punches come from and nothing else.

---

## 6. What is built

| Capability | State | Notes |
|---|---|---|
| Leave: apply, balance, status | Built | Slack modal and web portal, shared rules |
| Leave approval | Built | Named approver only; buttons clear once decided |
| Balance arithmetic | Built | Trigger maintains availed and closing balance |
| Working-day counting | Built | Excludes weekends and `Holiday__c` |
| Attendance punches | Built | Slack and web; sequence validated |
| Daily attendance rollup | Built | Time-zone explicit, idempotent |
| Attendance penalties | Built | Late arrival and short shift, label-driven |
| Regularization | Built | Three per month, enforced server-side |
| Notifications to Slack | Built | Approver DM plus `#hrms` channel |
| Daily who-is-out digest | Built | 09:00 IST weekdays |
| Dashboard command | Built | `/hrdash`: leave, counts, penalties |
| HR override on approvals | Off by default | A setting; manager-only until switched on |
| Biometric feed | Stub | Endpoint exists, processing commented out |
| Employee self-service profile | Web only | Not yet exposed in Slack |
| Expenses and reimbursements | Schema only | Objects deployed, no records, no Slack surface |
| Onboarding checklists | Schema only | Trigger generates tasks from templates; none defined |

---

## 7. Data on the ground

What the org actually holds, which matters more than what the schema permits.

| Object | Records | Comment |
|---|---|---|
| `Employee__c` | 29 | 28 active. Only 2 mapped to Slack accounts |
| `Leave_Balance__c` | 135 | One per employee per leave type for 2026 |
| `Leave_Request__c` | 16 | Includes seeded demo data |
| `Attendance_Punch__c` | 18 | Web and seeded; none from a device yet |
| `Attendance__c` | 9 | Derived, not entered |
| `Notification__c` | 18 | In-app feed the portal reads |
| `Payslip__c` | 84 | Out of scope, left alone |
| `Regularization_Request__c` | 0 | Flow is live, nobody has used it |

Twelve objects remain empty: assets, audit log, employee documents, expense
reports, loans, onboarding tasks, salary structures, separations, shifts, shift
assignments, reimbursements and payslip lines. The schema is deployed; the
features behind them are not in scope or not yet built.

> **The constraint that limits every demo.** Twenty-six of twenty-eight active
> employees carry `@test.com` addresses. Slack accounts are matched to employees
> by email, so those twenty-six cannot be linked. Everything works for the two
> real accounts and will work for the rest the moment their addresses are real.

---

## 8. What Keka still does

### Deliberately out of scope

Agreed as staying with Keka: payroll processing, salary structure design,
provident fund and statutory compliance, payslip generation and delivery, tax
filing. These are large builds in their own right and the regulatory surface is
the expensive part, not the software.

### In scope, not yet built

| Capability | Rough effort |
|---|---|
| Expenses and reimbursement claims in Slack | 3-4 days |
| Employee profile and team directory in Slack | 2-3 days |
| Onboarding and offboarding checklists | 1 week |
| Document management and expiry tracking | 1 week |
| Audit log across status changes | 2-3 days |
| Shift patterns and rosters | 1 week |
| Weekly and monthly scheduled reports | 2-3 days |
| Assets issued and returned | 2-3 days |

### Where Slack is the wrong surface

Some of Keka's work does not belong in a message window, and forcing it there
would cost more than it saves. Slack caps a message at 50 blocks and a modal at
100, a table at 100 rows and 20 columns with one table per message, and a modal
stack at three views deep. Exceeding those truncates silently.

So bulk administration over the whole company, interactive analytics, document
libraries, org charts as charts, and browsing two years of payslips all stay
better on a screen. The realistic end state is Slack for everything an employee
does daily, and a much smaller web application for administration and
reporting: not the deletion of the portal, but its reduction to what only a
screen can do.

---

## 9. Operating notes

### Deployment

- A push to `main` deploys the gateway to Vercel automatically.
- An active scheduled job **blocks Apex deploys**. Abort the digest's cron
  trigger, deploy, reschedule.
- Permission set metadata requires elements of the same type to be contiguous.
  Appending field permissions after `classAccesses` produces a misleading
  "element is duplicated" error when nothing is duplicated.

### Traps already hit

- Next.js 16 renamed `middleware` to `proxy`. A stale `middleware.ts` still
  compiles and still appears in the build output, but never runs, silently
  disabling every auth check in it.
- Serverless freezes the invocation once a response is sent. Background work
  must use `after()`, not a floating promise, or it is dropped with a 200 in the
  logs and no error.
- A Named Credential needs `allowMergeFieldsInHeader` enabled, or a
  `$Credential` merge field in a header resolves to an empty token and every
  call returns `not_authed`.
- `expr0` is a reserved SOQL alias. Supplying it explicitly fails the query.
- Salesforce evaluates cron in the *org's* time zone. This org runs
  America/Los_Angeles while the business runs Asia/Kolkata, so schedules drift
  an hour across US daylight saving. Setting the org default time zone to
  Asia/Kolkata is the durable fix.

### Open decisions

- Whether HR may approve on a manager's behalf. The switch exists and is off.
- Which biometric device, which decides push against poll.
- Whether to change the org time zone, which affects reports and date handling
  everywhere.
- Whether the remaining twenty-six employees get real email addresses, without
  which they cannot be linked to Slack.
