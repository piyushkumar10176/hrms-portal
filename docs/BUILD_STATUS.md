# HRMS Build Status

**As at 6 September 2026.** Everything below was checked against the live org and
the deployed portal on that date, not taken from notes. Counts are real row
counts. Where something is half-built or looks finished but is not, it is listed
that way rather than rounded up.

Companion document: [KEKA_PARITY.md](KEKA_PARITY.md) compares this against Keka
module by module.

---

## 1. The one-paragraph summary

Leave and attendance are built, tested and in daily working order across Slack
and the web portal. Employee records, departments, designations and the org chart
are built. Payroll, expenses, loans, assets, documents, onboarding and offboarding
have database objects and screens but no working process behind them. Nothing can
be emailed to anybody yet, because no mail provider is configured. Twenty-six of
twenty-eight employees still have placeholder addresses, and only two are linked
to Slack, so the system currently reaches two people.

---

## 2. Built and working

Each of these has been exercised end to end.

### Leave

| Capability | Where | Notes |
|---|---|---|
| Check balance by leave type | Slack, portal | Five types: Annual 18, Casual 12, Sick 12, Comp Off 6, WFH 24 |
| Apply for leave | Slack modal, portal | Validates dates, working days, holidays, and balance |
| Half day, first or second session | Slack, portal | Sessions derived from the 10:00–19:00 shift |
| Approve or reject | Slack buttons, portal | Buttons go stale after a decision instead of firing twice |
| Cancel before approval | Slack, portal | |
| Cancel after approval | Slack, portal | Balance is returned |
| Balance recalculation | Apex trigger | Closing = Opening + Accrued − Availed, recomputed on every change |
| Notify HR and the manager | Slack | On submission |
| Notify the employee | Slack | On the decision |
| Daily "who is out" digest | Slack `#hrms` | Scheduled job confirmed WAITING, next fire 09:00 IST |
| Holiday calendar | Salesforce | Five holidays loaded for 2026 |

### Attendance

| Capability | Where | Notes |
|---|---|---|
| Clock in and out | Slack, portal | Sequence-checked; cannot clock in twice or out first |
| Slack confirmation on every punch | Slack DM | Web punches confirm by DM; Slack punches confirm inline |
| Break time from punch gaps | Derived | Gap between a clock-out and the next clock-in |
| Effective vs gross hours | Derived | Effective excludes breaks and is what policy measures |
| Punch log for the day | Slack, portal | Every punch in order, with the break that preceded each return |
| Monthly attendance view | Portal | Break, Effective and On Premises columns per day |
| Late arrival penalty | Derived | At or after 11:00 |
| Short day penalty | Derived | Under 8 effective hours |
| Penalties self-correct | Derived | Fix a punch and the flag clears |
| Regularization request | Slack, portal | 3 per month; rejected requests still consume the allowance |

### People and structure

| Capability | Where | Notes |
|---|---|---|
| Employee records | Portal, Salesforce | 29 records, 28 active |
| Departments | Portal admin | 7, full create/edit/delete |
| Designations | Portal admin | 14, full create/edit/delete |
| Reporting lines | Portal | Manager on each employee; org chart page reads it |
| Employee directory and profiles | Portal | |
| Edit own profile | Portal | |
| Holiday calendar page | Portal | Upcoming and past, with a countdown |
| Upcoming birthdays | Portal | Works; 22 of 28 have a date of birth, all seeded |
| Work anniversaries | Portal | Derived from joining date, which all 28 have |
| Who is on leave and who is remote today | Portal | Read from approved leave, company-wide |

### Security and access

| Capability | Notes |
|---|---|
| Login with email and password | bcrypt hashes in Salesforce, not plain text |
| Route protection | Anonymous access to any authenticated page redirects to login, verified live |
| API protection | Unauthenticated API calls return 401, verified live |
| Permission model | One module decides who may see or decide what |
| Salary and bank details restricted | Only the employee, HR and admin |
| HR can approve anything | Leave, cancellation, regularization |
| Slack request signing | HMAC verified before anything is parsed |
| Password reset without user enumeration | Same reply for a real and a fake address, verified live |
| Session length | 8 hours |

### Engineering

| Item | State |
|---|---|
| Apex tests | 121 passing |
| Org-wide Apex coverage | 88% |
| Attendance rollup coverage | 91% |
| Punch notifier coverage | 92% |
| Static analysis | No high-severity findings introduced |
| Deployment | Push to `main` auto-deploys to Vercel |
| Documentation | Build reference and data model in this folder |

---

## 3. Built but switched off

These are finished in code and will work the moment configuration exists. None of
them are doing anything today.

| Capability | Blocked on | Consequence today |
|---|---|---|
| Email invitations to new employees | No mail provider | Nobody can be invited |
| Password reset emails | No mail provider | The reset flow generates a link that cannot be delivered |
| All email templates | No mail provider | Written, never rendered to a real recipient |
| CAPTCHA on login | No Turnstile keys | Login works, but with no bot protection |
| Biometric punch endpoint | No device chosen | Endpoint is live and secured; nothing sends to it |

**On mail**: the code supports two drivers, a Resend API key or a verified
Salesforce Org-Wide Email Address. Neither exists. `EMAIL_DRIVER` is unset, which
means the system deliberately sends nothing rather than failing loudly. **No
email has been sent to anyone at any point.**

**On the biometric endpoint**: `BIOMETRIC_WEBHOOK_SECRET` already exists in Vercel
and predates this work by several months. The endpoint therefore reports as
configured and will accept punches from anyone holding that secret. No device
points at it. If that secret has ever been shared, rotate it.

---

## 4. Screens that exist but do nothing

These pages are reachable, styled and look finished. They are not. Listing them
plainly because they are the ones most likely to embarrass a demo.

| Screen | What it does | What it does not do |
|---|---|---|
| `/assets` | Lists assets assigned to you | Nothing to list; 0 asset records exist |
| `/admin/assets` | Lists and filters all assets | Cannot assign, return or create an asset |
| `/loans` | Lists your loans and advances | 0 records; no way to request one |
| `/expenses` | Lists claims, has a submit form | 0 records; no approval route, no reimbursement |
| `/payroll` | Renders payslips | Reads inconsistent data, see below |
| `/admin/salary` | Edits salary figures | No structure behind it; see below |
| `/profile/documents` | Lists your documents | **"Upload Document" button does nothing.** 0 records |
| `/admin/onboarding` | Lists onboarding templates | **"New Template" button does nothing.** 0 templates |
| `/organisation` | Org chart | Works, but reads reporting lines that are incomplete |
| `/attendance/clock` | Clocks in and out correctly | **Says "GPS will be captured on punch". It is not.** See below |

Four buttons across the portal have no handler attached at all. They are on
`/profile/documents` and `/admin/onboarding`.

### The GPS claim is false

The clock page displays *"📍 GPS will be captured on punch"* to every employee.
Nothing in the application calls `navigator.geolocation`, the page sends no
coordinates, and **0 of 18 punches in the org carry a location**. The API and the
Salesforce fields both support coordinates, and `NEXT_PUBLIC_OFFICE_LATITUDE`,
`NEXT_PUBLIC_OFFICE_LONGITUDE` and `NEXT_PUBLIC_OFFICE_RADIUS_METERS` are all set
in Vercel, so geo-fencing was clearly intended and never finished.

This matters beyond a missing feature: the system is telling employees it is
recording their location when it is not. Whichever way that is resolved, building
it or removing the line, it should not ship as it stands.

---

## 5. Not built

| Area | State |
|---|---|
| Payroll processing | No run, no calculation, no statutory deductions |
| Salary structures | **0 structure definitions exist**, yet there are 154 assignment records covering 22 employees |
| Payslip generation | 69 payslips across 23 employees, with **0 line items** behind any of them |
| Tax declarations | 22 records; no submission, review or proof-upload process |
| Reimbursements | Object and API exist; no process |
| Expense approval | No approver route |
| Loans and advances | No request, approval or repayment schedule |
| Asset assignment and return | No process |
| Document upload and storage | No file handling anywhere in the system |
| Onboarding checklists | No templates, no task assignment, no tracking |
| Offboarding and exit | `Separation__c` object exists, empty, no process |
| Shifts and rosters | `Shift__c` and `Shift_Assignment__c` are empty; attendance falls back to defaults for everyone |
| Overtime | Not modelled |
| GPS capture and geo-fencing | Fields, API and office coordinates all exist; nothing captures a location |
| Tax declaration submission | The screen shows a declaration; there is no way to create, edit or submit one, and no proof upload |
| New joiner count on the dashboard | Removed rather than left showing a hardcoded zero |
| Comp-off earning | Leave type exists; nothing grants it |
| Leave accrual over time | Balances are set, not accrued monthly |
| Leave carry-forward and encashment | Not modelled |
| Performance management | Nothing |
| Goals and reviews | Nothing |
| Surveys and engagement | Nothing |
| HR helpdesk or ticketing | Nothing |
| Announcements | Nothing |
| Mobile app | Nothing; the portal is responsive but there is no app |
| Reporting beyond the Slack dashboard | Nothing |
| Audit log | Object exists, 0 rows, nothing writes to it |

---

## 6. Data readiness

This is the shortest path between where the system is and where it is usable, and
none of it is a code problem.

| Check | State |
|---|---|
| Active employees | 28 |
| Real email addresses | **2 of 28.** The other 26 are `emp0NN@test.com` |
| Have a password | 22 of 28 |
| No password, never invited | 6: EMP029, EMP030, EMP031, EMP032, EMP033, EMP034 |
| Linked to Slack | **2 of 28.** Everyone else receives no notification of any kind |
| Missing department and designation | 6: EMP029 through EMP034 |
| Missing reporting manager | 5: EMP030 through EMP034 |

The Slack link is done by matching on email address, so real addresses unblock
Slack for everyone in one step. That single fix moves the system from reaching
two people to reaching the whole company.

### Reference data loaded

| Object | Rows |
|---|---|
| Departments | 7 |
| Designations | 14 |
| Leave types | 5 |
| Holidays 2026 | 5 |
| Leave balances | 140 |
| Leave requests | 16, of which 13 approved and 3 rejected |
| Attendance punches | 18 |
| Attendance days | 9 |
| Salary components | 10 |

---

## 7. Known weaknesses

Ordered by how much they would matter in production.

**1. No row-level security in Salesforce.** Everything runs through a single
integration user with broad access. Every rule about who may see whose record is
enforced in the Next.js layer. That layer is correct today and has been tested,
but it means an application bug is a data exposure rather than a permission
error. Fixing it properly means sharing rules and per-user context.

**2. The portal has no automated tests.** Only Apex is covered. Every check on
the TypeScript side has been run by hand and is not repeatable in CI.

**3. Payroll data is internally inconsistent.** Payslips without line items,
salary structure assignments without structures. Anything built on top of it will
inherit the mess unless it is cleaned first.

**4. Org timezone is `America/Los_Angeles` while the business runs on
`Asia/Kolkata`.** Every date calculation compensates explicitly. It works and is
tested, but it is fragile and a new piece of code that forgets to compensate will
be wrong by five and a half hours.

**5. Shifts are unassigned.** Every employee is measured against the default
10:00–19:00 shift because `Shift_Assignment__c` is empty. Anyone on a different
schedule is judged by the wrong one.

**6. No audit trail.** `Audit_Log__c` exists and nothing writes to it. There is
no record of who approved what, beyond the record itself.

---

## 8. What is genuinely ready to demo

- Apply for leave in Slack, have it approved by the manager, see the balance move.
- Cancel approved leave and watch the balance come back.
- Clock in, take a break, clock back in, clock out, and see the break and effective
  hours derived without anyone declaring them.
- Raise a regularization request and hit the three-per-month cap.
- The daily digest arriving in `#hrms`.
- The HR dashboard in Slack.
- The web portal for leave, attendance and the employee directory.

Two caveats worth stating up front in any demo: it currently reaches two people,
and it cannot send email.
