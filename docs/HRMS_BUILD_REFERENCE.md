# CloudSheer HRMS

Complete guide to the system: what it is, how the data fits together, what each
person can and cannot do, and how a normal working day runs through it.

Salesforce holds the record. Slack is where people do the work. The web portal
still exists for administration.

Compiled 6 September 2026 from the live org and this repository. Counts drift as
the system is used.

| | |
|---|---|
| Employees | 28 active, 1 inactive system account |
| Custom objects | 34 deployed, 16 still empty |
| Apex tests | 121 passing, 88% org-wide coverage |
| Slack commands | 9 across 6 registrations |

For what is finished and what is not, see [BUILD_STATUS.md](BUILD_STATUS.md).
For how this compares against Keka, see [KEKA_PARITY.md](KEKA_PARITY.md).

---

## Contents

1. [Architecture](#1-architecture)
2. [The data model](#2-the-data-model)
3. [Who can do what](#3-who-can-do-what)
4. [What nobody can do yet](#4-what-nobody-can-do-yet)
5. [A day in the system](#5-a-day-in-the-system)
6. [Punching in and out, in detail](#6-punching-in-and-out-in-detail)
7. [Applying for leave, in detail](#7-applying-for-leave-in-detail)
8. [Regularization, in detail](#8-regularization-in-detail)
9. [Why Slack, and how it is shaped](#9-why-slack-and-how-it-is-shaped)
10. [Automation reference](#10-automation-reference)
11. [Configuration reference](#11-configuration-reference)
12. [Biometric integration](#12-biometric-integration)
13. [What Keka still does](#13-what-keka-still-does)
14. [Operating notes](#14-operating-notes)

---

## 1. Architecture

Three pieces, with a clear division of responsibility.

```
   People                Surfaces                    System of record
   ------                --------                    ----------------

   Employee   ------->   Slack app        \
   Manager    ------->   (9 commands)      \
   HR         ------->                      >---->   Salesforce
                                           /         - all data
   Admin      ------->   Web portal       /          - all business rules
                         (20 pages)                  - all automation

                              ^
                              |
                    Next.js gateway on Vercel
                    verifies, routes, never decides
```

**Salesforce is the system of record.** Every employee, leave request, balance,
punch, attendance day and notification lives there. Every business rule is
enforced in Apex: balance arithmetic, working-day counting, attendance
penalties, the regularization cap, who may approve what.

**The Next.js app is a gateway, not a brain.** It verifies Slack's request
signature, answers within Slack's three-second deadline, and asks Salesforce to
do the work. It contains no business rules. It also still serves the web portal.

**Slack is the primary surface for employees and managers.** The web portal
remains for administration and for anything that needs a real screen.

### Why the gateway is not in Apex

Slack requires an HTTP 200 within three seconds of any interaction. A Salesforce
Site guest-user endpoint adds cold-start latency and puts a public attack
surface directly on the org. Vercel answers fast and holds no data. Business
logic stays in Salesforce regardless.

### Why the portal cannot simply be deleted

Something must receive Slack's interactivity payloads over HTTPS inside that
three-second window. Even if every screen were retired, the gateway routes
remain. What can go is the UI, not the service.

---

## 2. The data model

### The spine

Everything hangs off `Employee__c`. It is not a Salesforce `User`: employees
authenticate against `Password_Hash__c` on their own record, so the org needs no
per-employee licence.

```
                          Department__c <----- Designation__c
                               ^ Head__c            ^
                               |                    |
                               |  Department_Ref__c |  Designation_Ref__c
                               +-------- Employee__c --------+
                                          |  ^  |
                    Reporting_Manager__c   |  |  |   Work_Location__c
                    (self-lookup, the      +--+  +-----> Location__c
                     whole org chart)
```

`Reporting_Manager__c` is a self-lookup on `Employee__c`. It is the entire org
chart and the source of approval routing. Nothing is hardcoded.

### Leave

```
   Leave_Type__c ------+                    Holiday__c
   (5 types, quotas)   |                    (public holidays,
                       |                     excluded from day counts)
                       v
   Employee__c ---> Leave_Balance__c        one row per employee,
                    (opening, accrued,      per leave type, per year
                     availed, closing)
        |
        |            Leave_Request__c
        +----------> Employee__c    (who is asking)
                     Approver__c    (who decides; set from Reporting_Manager__c)
                     Leave_Type__c
                     From/To/Days   (days derived on the server)
                     Status__c      Submitted -> Approved | Rejected | Cancelled
```

`Leave_Balance__c` is maintained by a trigger, never by hand:

```
Availed__c        = SUM(Days__c) of all Submitted and Approved requests
                    for that employee and leave type
Closing_Balance__c = Opening_Balance__c + Accrued__c - Availed__c
```

### Attendance

```
   Attendance_Punch__c          raw events, one row per punch
   Employee__c                  from Slack, the web portal, or a device
   Punch_DateTime__c
   Punch_Type__c                Check-In | Check-Out
   Source__c                    Web | Slack | Mobile | Biometric
            |
            |  AttendancePunchTrigger -> AttendanceRollupService
            v
   Attendance__c                one derived row per employee per day
   Date__c                      bucketed in the business time zone
   Check_In__c                  earliest check-in that day
   Check_Out__c                 latest check-out that day
   Total_Hours__c               span between them
   Late_By_Minutes__c           against shift start plus grace
   Status__c                    Present | Half Day | Absent | Holiday | Week Off
   Penalty__c                   derived, see the policy below
   Penalty_Reason__c
            |
            v
   Regularization_Request__c    a correction, capped at 3 per month
   Employee__c, Approver__c, Date__c
   Requested_Clock_In__c, Requested_Clock_Out__c
   Status__c                    Submitted -> Approved | Rejected
```

Punches are the source of truth. `Attendance__c` is entirely derived and is
recomputed whenever the punches for that day change. Nothing about a day is
sticky: correct a punch and the hours, status and penalty all follow.

### Everything else

`Notification__c` is the in-app feed the portal reads, written by triggers.
`HistoryRecord__c` is a per-employee timeline, master-detail so it dies with the
employee. `Payslip__c`, `Employee_Salary_Structure__c` and `Tax_Declaration__c`
carry payroll data and are out of scope, but they **block employee deletion**,
which matters when off-boarding.

Twelve objects are deployed but empty: assets, audit log, employee documents,
expense reports, loans, onboarding tasks, salary structures, separations,
shifts, shift assignments, reimbursements, payslip lines.

---

## 3. Who can do what

Three roles. There is no formal role hierarchy in Salesforce; the model is
`Employee__c.Role__c` (Employee or Admin) plus the `Reporting_Manager__c` chain.

### Every employee

**In Slack**

| Can | How |
|---|---|
| See their leave balance | `/myleave balance` |
| Apply for leave | `/myleave apply`, or the button on the balance |
| See their own requests and status | `/myleave status` |
| Cancel their own upcoming leave | `/myleave cancel` |
| Clock in and out | `/attendance in`, `/attendance out` |
| See today's punches | `/attendance today` |
| See who is out today | `/whosout` |
| See their penalised days and allowance | `/regularize` |
| Raise a regularization | button inside `/regularize` |
| See the daily digest | posted to `#hrms` at 09:00 IST |

**In the portal**: dashboard, own profile, own documents, attendance calendar,
leave history, payslips, expenses, loans, the org chart.

**Cannot**: see anyone else's balance, payslip, bank details or documents;
approve anything, including their own request; amend a submitted request, though
it can be cancelled; alter attendance directly; cancel leave that has already
been taken, which is an HR correction.

### Manager

Everything an employee can do, plus:

| Can | How |
|---|---|
| See requests awaiting them | `/approvals` |
| Approve or reject leave | buttons in `/approvals` or on the `#hrms` post |
| Approve or reject regularizations | same place |
| See their team's leave balances | portal dashboard |
| See who on the team is out | `/whosout`, `/hrdash` |

A manager is anyone named as `Approver__c` on a request, which is set from the
requester's `Reporting_Manager__c`. There is no separate manager flag.

**Cannot**: approve a request where they are not the named approver; approve
their own; decide a request already settled; see team members' bank details,
PAN or Aadhaar.

### HR

Currently HR is an employee whose `Department__c` is `HR`. HR has no special
approval power **unless the override is switched on**.

| Can | How |
|---|---|
| See every leave request in `#hrms` | channel post on every submission |
| See the daily digest | 09:00 IST |
| See the whole-company dashboard | `/hrdash` |
| See who is out | `/whosout` |
| Approve anything | only if `HR_Can_Approve__c` is on |

`/hrdash` returns who is out today, leave requests by status for the year, and
attendance penalties this month grouped by person.

### Admin

`Role__c = Admin`. Adds the portal's admin pages: employees, departments,
designations, salary, assets, onboarding templates. Admin is the only role that
can create or edit employee records, and the only one besides the employee
themselves who can see bank details, PAN, Aadhaar and date of birth.

### The authorisation rules, precisely

These are enforced in Salesforce and in the gateway, not in the UI:

1. Sensitive personal fields are returned only to the employee themselves or an
   admin. Everyone else gets the colleague-visible subset.
2. Only the `Approver__c` named on a request may decide it. HR may too, but only
   when `HR_Can_Approve__c` is on.
3. Nobody may approve their own request. This holds even for HR override.
4. A request that is not `Submitted` cannot be decided again.
5. Leave days are counted on the server. A client cannot supply them.
6. The regularization cap is checked on submission, not only when the form opens.

---

## 4. What nobody can do yet

Honest list of gaps, so nobody goes looking.

**Not built at all**

- Expenses or reimbursement claims from Slack. Objects exist, no surface.
- Employee profile or team directory in Slack.
- Onboarding and offboarding checklists. The trigger generates tasks from
  templates, but no templates are defined.
- Document upload, storage or expiry tracking.
- Shift patterns and rosters. `Shift__c` and `Shift_Assignment__c` are empty, so
  the rollup falls back to default hours for everyone.
- Audit log of status changes.
- Weekly or monthly scheduled reports. Only the daily digest exists.
- Asset issue and return.

**Deliberately out of scope**

Payroll processing, salary structure design, provident fund and statutory
compliance, payslip generation, tax filing. These stay with Keka.

**Blocked by data, not code**

Twenty-six of twenty-eight active employees carry `@test.com` addresses. Slack
accounts are matched to employees by email, so only two people can currently use
the Slack app at all. Everything works the moment the addresses are real.

---

## 5. A day in the system

A normal weekday, in order.

**09:00 IST — the digest posts.** A scheduled job writes to `#hrms`: who is on
approved leave today, any holiday, and every request still awaiting a decision.
Nobody has to ask.

**09:20 — people arrive.** Each person runs `/attendance in`, or punches on the
device once that is wired. A row is written to `Attendance_Punch__c`. The
trigger immediately derives or updates that day's `Attendance__c` row.

**10:40 — someone needs leave.** They run `/myleave balance`, see what is left,
press **Apply for leave** and fill the modal. On submit, Salesforce counts the
working days, checks the balance and checks for overlap. If it passes, the
request is created, the balance moves, and two messages go out: a DM to the
manager and a post to `#hrms` carrying Approve and Reject buttons.

**10:41 — the manager decides.** They press **Approve** in the DM or the
channel. The gateway re-reads the record and confirms they are the named
approver. The status changes, the balance is recalculated, the original message
is rewritten without its buttons and with a line saying who decided, and the
employee gets a DM.

**14:00 — someone checks the team.** `/whosout` for the quick answer, `/hrdash`
for leave counts and this month's attendance penalties.

**18:45 — people leave.** `/attendance out`. The rollup recomputes the day:
hours worked, lateness, whether the day breaches policy.

**Next morning — a penalty appears.** Someone who arrived at 11:30 or left after
six hours sees it in `/regularize`, along with how much of their monthly
allowance remains. They raise a regularization; it goes to their manager through
the same approval path as leave.

---

## 6. Punching in and out, in detail

### What a punch is

A punch is an immutable event: an employee, an instant, and a direction.
Everything else about attendance is derived from punches, never entered.

### The three ways a punch arrives

| Source | Route | Confirms to the employee | Status |
|---|---|---|---|
| Slack | `/attendance in` or `out` | The command's own reply | Live |
| Web portal | Clock page | Slack direct message | Live |
| Biometric device | `POST /api/webhook/biometric/punch` | Slack direct message | Endpoint live, no device pointed at it |

Every source writes the same `Attendance_Punch__c` record, so the trigger, the
rollup and the Slack notice all behave identically whichever way the punch came
in. A Slack-sourced punch is the one exception to the direct message: the slash
command has already answered the person who typed it, and a direct message on
top would say the same thing twice.

### The biometric endpoint

`POST /api/webhook/biometric/punch`, authenticated by an `x-webhook-secret`
header compared in constant time. It returns 503 until `BIOMETRIC_WEBHOOK_SECRET`
is set, so an unconfigured deployment cannot be used to write attendance.

```json
{ "deviceId": "GATE-01",
  "punches": [ { "employeeCode": "EMP007",
                 "timestamp": "2026-09-06T10:00:00+05:30",
                 "punchType": "IN" } ] }
```

- Up to 200 punches per request; a single punch may also be posted bare.
- `punchType` accepts `IN`/`OUT`, `0`/`1`, and the spelled-out forms.
- Each punch gets an `External_Punch_ID__c` of `device:employee:timestamp`, which
  is unique in Salesforce. A terminal replaying its buffer after losing the
  uplink therefore records nothing twice, which matters because a duplicated
  punch would invent break time nobody took.
- Timestamps more than 90 days old, or in the future, are refused: a terminal
  with a wrong clock would otherwise corrupt months of attendance quietly.
- Unusable punches are reported per punch, by index and reason, and the usable
  ones in the same batch are still recorded.

Terminals differ. When the make and model are settled, either point the device at
a small adapter or extend `normalisePunch()` in the route; nothing downstream
changes.

### Sequence rules

A punch is refused if it does not make sense:

- Clocking in when the last punch today was a check-in returns *"You are already
  clocked in."*
- Clocking out with no punch today returns *"You have not clocked in today."*
- Clocking out when the last punch was a check-out returns *"You are already
  clocked out."*

Without these, the rollup would derive nonsense hours from a mismatched pair.

### How a day is derived

When any punch for a day changes, `AttendanceRollupService` recomputes that
whole day:

1. **Bucket the punch into a business date.** Punch times are instants. The date
   is computed in `Asia/Kolkata`, not the running user's time zone. This matters:
   the integration user runs in `America/Los_Angeles`, and using its clock would
   file evening punches on the wrong day.
2. **First check-in, last check-out.** Multiple pairs in a day collapse to the
   outer span, so a lunch break does not split the day in two.
3. **Break** is the sum of every gap between a check-out and the next check-in.
   See below.
4. **Effective hours** (`Total_Hours__c`) are the sum of each check-in to
   check-out stretch, to two decimals. No completed stretch yet means hours stay
   empty rather than being guessed.
5. **Gross hours** (`Gross_Hours__c`) are the elapsed time from the first
   check-in to the last punch, break included.
6. **Lateness** is arrival minus shift start minus grace, floored at zero.
7. **Status** is Week Off on Saturday and Sunday, Holiday if the date is in
   `Holiday__c`, otherwise Present, Half Day or Absent by effective hours.
8. **Penalty** is derived last, from the rules below.

### Break time

The shift runs 10:00 to 19:00: nine hours, of which **eight are effective and one
is break**. Break is not declared by the employee and there is no separate break
button. It is simply the gap between punches:

> **A break is the time between a clock-out and the next clock-in on the same
> business day.**

Clock in at 10:00, out at 10:30, back in at 11:15, and that is 45 minutes of
break. It makes no difference whether the hour is taken in one stretch or in
several short ones; the gaps add up either way.

| Punches | Break | Effective | Gross |
|---|---|---|---|
| in 10:00, out 19:00 | 0m | 9h | 9h |
| in 10:00, out 13:00, in 14:00, out 19:00 | 1h | 8h | 9h |
| in 10:00, out 10:30, in 11:15, out 16:00, in 16:15, out 19:00 | 1h | 8h | 9h |
| in 10:00, out 13:00, in 15:00, out 19:00 | 2h | 7h | 9h |
| in 10:00, out 10:30, in 11:15 *(still working)* | 45m | 30m | 1h 15m |

Effective hours are summed from the worked stretches rather than subtracted from
the span. The two agree on a finished day but not part way through one: the last
row above has a break longer than the distance between the first check-in and the
last check-out, and subtracting would report a negative day.

Two kinds of bad data are handled rather than trusted. A stray check-out before
the day's first check-in does not open a break that swallows the morning, and a
device firing the same punch twice neither shortens a break nor loses worked
time. Punches are sorted by time on read, so a batch import arriving out of order
still derives correctly.

### The penalty rules

| Breach | Threshold | Message |
|---|---|---|
| Late arrival | at or after 11:00 | `arrived at 11:45, at or after 11:00` |
| Short day | under 8 **effective** hours | `worked 7.00 of 8 effective hours (2h break, over the 1h allowance)` |

Both thresholds are Custom Labels and change in Setup without a deploy. A day
can breach both, and the reason then names both.

The hours test reads effective hours, so a long lunch shortens the day exactly as
leaving early does. Overrunning the one-hour break allowance is **named inside
the reason but is not a breach on its own**: someone who breaks for ninety
minutes and stays ninety minutes later has still done the work. The break is
always visible on the record either way.

**Never penalised**: weekends, public holidays, and any day still open because
there is no check-out yet.

**Never sticky**: penalties are recomputed from the punches every time. Correct
a punch and the penalty clears itself.

Worked examples from real data:

| Day | Arrived | Break | Effective | Outcome |
|---|---|---|---|---|
| Wed 2 Sep | 11:45 | 0m | 9.25 | Late only |
| Thu 3 Sep | 09:30 | 0m | 6.50 | Short day only |
| Wed 2 Sep (other person) | 12:10 | 0m | 4.83 | Both reasons |
| Fri 4 Sep | 09:25 | 0m | 9.42 | No penalty |
| Sun 6 Sep | 13:02 | 0m | 1.41 | Week off, exempt |

### What the employee sees

**On every punch** made from the web portal or a biometric device, a Slack direct
message: the time, the day's first clock-in and last clock-out, break so far
against the one-hour allowance, and effective hours against the eight required.
A clock-out that breached the policy also carries the reason.

**`/attendance today`** in Slack lists every punch of the day in order, with the
break that preceded each return, then the totals underneath.

**The clock page** shows the same log, with each break called out between the
punches that bound it, and three tiles: effective, break and time on premises.
The clock-in button reads *Back from Break* while a break is open.

**The attendance page** carries Break, Effective and On Premises columns per day,
a month total for break, and an average effective day. A flagged day shows a
warning marker whose tooltip is the reason.

---

## 7. Applying for leave, in detail

### The flow

1. `/myleave balance` shows days remaining per type, with an **Apply** button.
2. The button opens a modal: leave type, from date, to date, reason. The type
   list shows remaining days beside each name.
3. On submit, the server checks, in order:
   - dates parse and the start is not after the end
   - working days in the range, excluding weekends and `Holiday__c`
   - the range contains at least one working day
   - no overlap with an existing Submitted or Approved request
   - the balance covers the request
4. If any check fails, the modal stays open with the error against the offending
   field. Nothing is written.
5. If all pass, `Leave_Request__c` is created with `Status__c = Submitted` and
   `Approver__c` taken from the requester's `Reporting_Manager__c`.

### What happens on creation

A single trigger does four things:

- Recalculates `Availed__c` and `Closing_Balance__c` for that employee and type
- Writes a `Notification__c` for the approver, which the portal shows
- Queues a Slack DM to the approver
- Queues a Slack post to `#hrms` with Approve and Reject buttons

Slack failures are logged and swallowed. Slack being unreachable must never stop
someone submitting leave.

### Deciding

The buttons appear in two places, and both run the same checks. The gateway
re-reads the record and refuses unless the clicker is the named approver, is not
the requester, and the request is still `Submitted`. The buttons are a
convenience; they are not the authorisation boundary.

On a decision the original message is rewritten in place: buttons removed, a
line appended naming who decided. On a refusal the message is untouched and only
the clicker sees why.

### Cancelling

The requester, and only the requester, may cancel their own leave through
`/myleave cancel`. It works both before and after approval.

The rule is that leave which has wholly passed cannot be self-cancelled: once
`To_Date__c` is behind today, correcting it is an HR matter, not self-service.
Everything still upcoming, whether `Submitted` or `Approved`, can go.

No balance adjustment is written by the cancel action. `Cancelled` is simply not
one of the statuses that consume leave, so the existing trigger recalculates and
the days come back on their own. Verified end to end: a 0.5 day approved request
moved availed from 3 to 3.5, and cancelling returned it to exactly 3.

`Cancelled_On__c` and `Cancellation_Reason__c` are stamped so a cancelled
request still explains itself later.

### Half days

The modal offers three durations:

| Choice | Counts as | Covers |
|---|---|---|
| Full day | 1 per working day | the whole shift |
| Half day, first half | 0.5 | 10:00 to 14:30 |
| Half day, second half | 0.5 | 14:30 to 19:00 |

The shift is 10:00 to 19:00, nine hours, so the midpoint is 14:30. All three
times come from Custom Labels.

A half day applies to **one date only**. Half of several days is meaningless, so
selecting a half day across a range is refused rather than guessed at. A half
day on a weekend or public holiday counts as zero, like any other non-working
day, and is refused for having no working days in range.

### Day counting

Days are **always** computed on the server from the date range. The client
cannot supply a count. Weekends and public holidays are excluded.

| Range | Days | Why |
|---|---|---|
| Mon to Fri | 5 | full week |
| Fri to Mon | 2 | weekend excluded |
| Sat to Sun | 0 | refused, no working days |
| Thu to Mon over a Friday holiday | 2 | holiday and weekend excluded |

---

## 8. Regularization, in detail

A regularization is a request to correct a day that breached attendance policy.

**The allowance is three per employee per calendar month**, set by
`HRMS_Regularizations_Per_Month`.

**Rejected requests still consume the allowance.** The cap exists to stop
regularization substituting for turning up, not to reward being refused.

`/regularize` shows the month's penalised days, how much allowance remains, and
a button when both are non-zero. The modal offers only days that actually
breached, so nobody regularizes a day that was fine.

The allowance is checked twice: when the modal opens, and again on submission.
The second check matters because the button may have been drawn before the third
request was used.

A future date cannot be regularized. `Regularization_Request__c` carries a
`Past_Date_Only` validation rule enforcing it in the database, not just the UI.

Approval runs through `/approvals` alongside leave, with the same rules.

---

## 9. Why Slack, and how it is shaped

### What Slack is good at here

Short transactions with few fields, where the alternative is opening a browser,
logging in and finding a page. Clocking in, checking a balance, approving a
request, seeing who is out. For these, Slack is genuinely better than a web form,
not merely equivalent.

Notifications are the other half. A leave request that appears in the manager's
DM and in `#hrms` gets decided in minutes. The same request sitting in a portal
inbox waits for someone to log in.

### The constraints that shaped the design

Slack's limits are not advisory. Exceeding most of them truncates silently.

| Limit | Value | How the design responds |
|---|---|---|
| Interaction acknowledgement | 3 seconds | Ack first, work after, post the result to `response_url` |
| `trigger_id` lifetime | 3 seconds, single use | Modals open from a button, never from a slash command |
| `response_url` | 5 posts in 30 minutes | One reply per interaction |
| Blocks per message | 50 | Approval lists cap at 8 of each type and say what is hidden |
| Blocks per modal | 100 | Modals stay short |
| Table | 100 rows, 20 columns, one per message | No tables; summaries instead |
| Modal stack | 3 deep | Single-step modals only |

### The serverless constraint

The gateway runs on Vercel, and a serverless invocation is frozen the moment its
response is sent. Background work started as a floating promise is silently
dropped. All post-response work uses `after()` from `next/server`, which keeps
the invocation alive until it finishes. This caused a real bug: Slack showed
*"Working on it…"* forever, with a 200 in the logs and no error anywhere.

### Security

Slack authenticates itself by signing every request. The gateway verifies the
signature before parsing anything: base string `v0:{timestamp}:{raw body}`, HMAC
SHA256, constant-time comparison, and anything older than five minutes rejected.
The raw body is used exactly as received, because re-serialising the JSON would
change the digest.

Slack routes are public in the proxy for precisely this reason: they carry no
session, and the signature is the credential.

### What Slack is wrong for

Bulk administration across the company, interactive analytics, document
libraries, org charts drawn as charts, browsing two years of payslips. These
need a screen. The realistic end state is Slack for everything an employee does
daily and a smaller web application for administration.

---

## 10. Automation reference

### Triggers

| Trigger | Object | Does |
|---|---|---|
| `LeaveRequestTrigger` | `Leave_Request__c` | Recalculates balances, writes notifications, queues Slack |
| `AttendancePunchTrigger` | `Attendance_Punch__c` | Rebuilds the daily attendance row and its penalty |
| `EmployeeTrigger` | `Employee__c` | Generates onboarding tasks from templates on hire |

All are after-triggers, bulk safe, with no SOQL or DML in loops.

### Services

| Class | Responsibility |
|---|---|
| `LeaveRequestTriggerHandler` | Balance arithmetic, notification records |
| `AttendanceRollupService` | Punches to daily attendance, penalties |
| `RegularizationService` | Monthly allowance, penalised-day lookup |
| `LeaveDigestService` | Builds the daily digest |
| `SlackService` | `chat.postMessage` through the Named Credential |
| `LeaveSlackNotifier` | Queueable that sends leave notifications |
| `EmployeeTriggerHandler` | Onboarding task generation |

### Scheduled

| Job | When | Does |
|---|---|---|
| `DailyLeaveDigestSchedulable` | 09:00 IST, weekdays | Posts the digest to `#hrms` |

The org runs `America/Los_Angeles` and Salesforce evaluates cron in org time, so
the expression is Pacific and fires SUN-THU. It drifts an hour across US
daylight saving. Setting the org default time zone to `Asia/Kolkata` is the
durable fix.

### Validation rules

Enforced in the database, so neither surface can bypass them.

| Object | Rule |
|---|---|
| `Employee__c` | Email required and well formed; PAN format; Aadhaar 12 digits; cannot manage self |
| `Leave_Request__c` | Start not after end; days positive |
| `Regularization_Request__c` | Past dates only |
| `Loan__c` | Outstanding not above principal |
| `Payroll_Cycle__c` | Start not after end |

`Leave_Balance__c.Closing_Non_Negative` is deliberately **inactive**. The field
is derived by the trigger, and blocking a negative value there stops the trigger
writing at all, which blocks every leave request for that employee. Sufficiency
is enforced when the request is made instead.

---

## 11. Configuration reference

### Custom Labels, the attendance and leave policy

| Label | Value | Meaning |
|---|---|---|
| `HRMS_Business_Time_Zone` | Asia/Kolkata | Time zone for all date bucketing |
| `HRMS_Penalty_Arrival_Time` | 11:00 | Arrival at or after this is a penalty |
| `HRMS_Penalty_Minimum_Hours` | 8 | Effective hours below this is a penalty |
| `HRMS_Break_Allowance_Minutes` | 60 | Break the shift allows before it is called out |
| `HRMS_Default_Full_Day_Hours` | 8 | Effective hours that count as a full day |
| `HRMS_Default_Half_Day_Hours` | 4 | Effective hours that count as a half day |
| `HRMS_Default_Shift_Start` | 10:00 | Shift start when no shift is assigned |
| `HRMS_Default_Shift_End` | 19:00 | Shift end, used to describe half-day sessions |
| `HRMS_Default_Grace_Minutes` | 15 | Grace before lateness counts |
| `HRMS_Regularizations_Per_Month` | 3 | Allowance per employee per month |

### HRMS_Slack_Setting__mdt, the Default record

| Field | Value | Meaning |
|---|---|---|
| `Enabled__c` | true | Master switch for all Slack sending |
| `Notify_Punch__c` | true | Direct message the employee on a web or biometric punch |
| `Named_Credential__c` | Slack_API | Where the bot token lives |
| `Workspace_Team_Id__c` | T0BV8DT6LKG | Required for an Enterprise Grid org install |
| `HR_Channel_Id__c` | C0BVCBYSEJV | `#hrms` |
| `Notify_Manager__c` | true | DM the approver on a new request |
| `Notify_HR__c` | true | Post to the HR channel |
| `HR_Can_Approve__c` | false | HR override, off |

### Secrets

The Slack bot token lives in two places and nowhere else: the `Slack_API`
external credential in Salesforce, and `SLACK_BOT_TOKEN` on Vercel. It is never
in source control. The signing secret is `SLACK_SIGNING_SECRET` on Vercel only.

---

## 12. Biometric integration

You have a physical punch machine. Two integration shapes exist and they share
nothing but the destination, so the device model decides the design.

### Option A: the device pushes, in real time

ZKTeco, eSSL, Biomax and Matrix devices support push, usually via a cloud bridge
such as CAMS. The device POSTs to a URL you configure as each punch happens:

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
queues the work. Responding immediately is a hard requirement; the device will
not wait.

This repository already has a stub at `/api/webhook/biometric/punch` built for
this shape, with the processing block written and commented out. Making it live
is roughly a day: read the token from the body rather than a header, map
`UserId` to `Employee_Code__c`, and write `Attendance_Punch__c`.

### Option B: you poll the vendor

Truein offers **no webhooks**. Pull only, with constraints that shape the design:

- Bearer token from `getAccessToken`, expiring every 24 hours
- One request per 40 seconds, per endpoint and key
- `getPunchLog` caps at a 31-day window and 500 pairs per call

That means scheduled Apex on a cursor, around two days including token refresh
and pagination, with attendance lagging by the polling interval.

### Either way

Everything downstream already works. A punch becomes `Attendance_Punch__c`; the
trigger derives the daily row with hours, lateness and penalty; the digest,
`/hrdash` and `/regularize` read from that. The biometric feed changes only where
punches originate.

**Confirm the device make and model before anyone builds.** The existing stub
assumes push, which is right for ZKTeco and eSSL and wrong for Truein.

---

## 13. What Keka still does

### Deliberately out of scope

Payroll processing, salary structure design, provident fund and statutory
compliance, payslip generation and delivery, tax filing. The regulatory surface
is the expensive part, not the software.

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

Bulk administration, interactive analytics, document libraries, org charts as
charts, and browsing years of payslips all stay better on a screen. The end
state is not the deletion of the portal but its reduction to what only a screen
can do.

---

## 14. Operating notes

### Deployment

- A push to `main` deploys the gateway to Vercel automatically.
- An active scheduled job **blocks Apex deploys**. Abort the digest's cron
  trigger, deploy, reschedule.
- Permission set metadata requires same-type elements to be contiguous.
  Appending field permissions after `classAccesses` gives a misleading
  "element is duplicated" error when nothing is duplicated.
- Deleting an employee is blocked by `Employee_Salary_Structure__c`,
  `Tax_Declaration__c` and `Payslip__c` children. Delete those, then leave
  requests and balances, then the employee.

### Traps already hit

- Next.js 16 renamed `middleware` to `proxy`. A stale `middleware.ts` still
  compiles and still appears in the build output, but never runs, silently
  disabling every auth check in it.
- Serverless freezes the invocation once a response is sent. Background work
  must use `after()`, not a floating promise.
- A Named Credential needs `allowMergeFieldsInHeader` enabled, or a
  `$Credential` merge field in a header resolves to an empty token and every
  call returns `not_authed`.
- `expr0` is a reserved SOQL alias and fails if supplied explicitly.
- An Enterprise Grid org-wide app install needs explicit per-workspace access,
  and channel-scoped API calls need `team_id`, or they return
  `team_access_not_granted`.
- `/leave` is reserved by Slack and cannot be registered as a command.
- Salesforce evaluates cron in the org's time zone, not the business's.

### Open decisions

- Whether HR may approve on a manager's behalf. The switch exists and is off.
- Which biometric device, which decides push against poll.
- Whether to change the org default time zone to `Asia/Kolkata`.
- Whether the remaining twenty-six employees get real email addresses, without
  which they cannot use Slack at all.
- Departments, designations and reporting managers for the six new joiners, none
  of which the website provides.
