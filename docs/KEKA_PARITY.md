# Keka Parity

**As at 6 September 2026.** A module-by-module comparison between what Keka does
for Cloudsheer today and what this system does, so the decision about what to
build next is made against the real gap rather than an impression of it.

Companion document: [BUILD_STATUS.md](BUILD_STATUS.md) has the detailed inventory.

> **One caveat before the tables.** The Keka column reflects Keka's standard
> published module set. Plans differ and tenants are configured differently, so
> please check the rows marked with a question against your own Keka account
> before presenting them. Anything I could not verify is marked rather than
> guessed.

---

## 1. The headline

| | Modules |
|---|---|
| At parity on the daily process | 3 of 14 |
| Not built | 9 of 14 |
| Out of scope, already in Salesforce | 1 of 14 |
| Deliberately different approach | 1 of 14 |

The three at parity, **Leave**, **Time & Attendance** and **Core HR**, are what
employees touch every day. The nine not built are mostly used monthly, annually,
or by HR alone. That distribution is the important thing: the daily-use half of
Keka is covered, the periodic half is not.

Each of the three still has gaps inside it, listed in section 3. "At parity"
means the process an employee performs is covered, not that every Keka setting
has an equivalent.

---

## 2. Module by module

| Keka module | Keka | This system | Verdict |
|---|---|---|---|
| Leave management | Yes | Yes | **At parity** |
| Time & attendance | Yes | Yes, minus biometric | **At parity on process** |
| Core HR / employee database | Yes | Yes | **At parity** |
| Payroll | Yes | Data only, no process | **Not built** |
| Expenses & reimbursement | Yes | Screens only | **Not built** |
| Loans & advances | Yes | Screens only | **Not built** |
| Asset management | Yes | Screens only | **Not built** |
| Documents | Yes | Screen only, no file handling | **Not built** |
| Onboarding & offboarding | Yes | Objects only | **Not built** |
| Performance management | Yes | Nothing | **Not built** |
| Engagement & surveys | Yes | Nothing | **Not built** |
| HR helpdesk | Yes | Nothing | **Not built** |
| Hiring / ATS | Yes | In Salesforce already | **Out of scope** |
| Mobile app | Yes | Slack instead | **Different approach** |

---

## 3. Where this system matches Keka

### Leave

| Capability | Keka | Here |
|---|---|---|
| Multiple leave types | Yes | Yes, 5 |
| Apply with reason and dates | Yes | Yes |
| Half day | Yes | Yes, first or second session |
| Working-day calculation excluding holidays | Yes | Yes |
| Balance validation before submission | Yes | Yes |
| Manager approval | Yes | Yes |
| HR override | Yes | Yes |
| Cancel before approval | Yes | Yes |
| Cancel after approval with balance return | Yes | Yes |
| Holiday calendar | Yes | Yes, 2026 loaded |
| Team leave visibility | Yes | Yes, daily digest and `/whosout` |
| Leave accrual over time | Yes | **No**, balances are set not accrued |
| Carry-forward and encashment | Yes | **No** |
| Comp-off earning rules | Yes | **No**, the type exists but nothing grants it |

### Time & attendance

| Capability | Keka | Here |
|---|---|---|
| Web clock in and out | Yes | Yes |
| Mobile clock in | Yes | Via Slack on a phone |
| Biometric | Yes | **Endpoint only, no device** |
| GPS capture | Yes | **No.** The clock page says GPS will be captured; nothing captures it |
| Break tracking | Yes | Yes, derived from punch gaps |
| Effective vs gross hours | Yes | Yes |
| Late arrival flags | Yes | Yes |
| Short-day flags | Yes | Yes |
| Attendance regularization with a cap | Yes | Yes, 3 per month |
| Daily punch log | Yes | Yes, Slack and portal |
| Monthly attendance view | Yes | Yes |
| Shifts and rosters | Yes | **No**, everyone is on one default shift |
| Overtime | Yes | **No** |

### Core HR

| Capability | Keka | Here |
|---|---|---|
| Employee database | Yes | Yes |
| Departments and designations | Yes | Yes |
| Reporting structure | Yes | Yes |
| Org chart | Yes | Yes |
| Employee directory | Yes | Yes |
| Self-service profile edit | Yes | Yes |
| Role-based field visibility | Yes | Yes |
| Document storage | Yes | **No file handling at all** |
| Onboarding checklists | Yes | **No** |
| Exit and full-and-final | Yes | **No** |

---

## 4. Where the gap is

Ordered by how hard Cloudsheer would feel losing it if Keka were switched off
tomorrow.

### Blocking. Cannot leave Keka without these.

**Payroll.** Salary processing, payslips, statutory deductions, Form 16. This is
the single largest gap and the reason the system cannot replace Keka yet. You
scoped it out deliberately, so it is not a surprise, but it is the deciding
factor.

**Documents.** Offer letters, ID proofs, contracts. There is no file handling
anywhere in the system. Salesforce Files can carry this, but nothing is wired.

### Painful but survivable with a manual process.

**Expenses and reimbursements.** Claims exist as screens with no approval route
and no payout.

**Onboarding and offboarding.** New joiners currently arrive with no checklist,
which is visible in the data: six people have no department, designation or
manager.

**Asset management.** Who has which laptop.

### Would not be missed immediately.

**Performance management.** Goals, reviews, feedback.

**Engagement and surveys.**

**HR helpdesk.** Slack arguably already covers this informally.

**Loans and advances.** Low volume at this size.

---

## 5. Where this system is better than Keka

Worth saying, because the comparison is not one-directional.

**It lives where people already are.** Applying for leave is a Slack command, not
a login. Approving it is a button in a direct message. Keka needs an app or a
browser tab and a password nobody remembers.

**Break time is derived, not declared.** Nobody presses a break button. The gaps
between punches are the break. There is nothing to forget to do.

**Penalties correct themselves.** Fix a punch and the flag clears. There is no
stale flag to argue about.

**The manager is told, not expected to check.** Requests land in a DM, and the
daily digest says who is out before anyone asks.

**Hiring is already in the same platform.** ATS, interviews and offers are in
Salesforce, so a candidate becoming an employee is a data move rather than an
export and an import between two vendors.

**It is yours.** No per-seat licence, no vendor roadmap, no waiting for a feature.

---

## 6. The honest read

**Replacing Keka's employee-facing half is close.** Leave and attendance are the
two things every employee touches every day, and both are done and tested. Adding
real email addresses and Slack links would put the whole company on it this week.

**Replacing Keka entirely is not close.** Payroll alone is a project in its own
right, and documents, onboarding and expenses are all needed before HR could stop
opening Keka.

**The realistic position is running both.** This system for daily leave and
attendance, Keka for payroll and the annual processes, until payroll is built.
That is a real decision with a real cost: two systems holding overlapping
employee data, and someone keeping them in step.

---

## 7. What the decision actually is

Three options, no recommendation attached, because the trade-off is a business one.

**A. Stop here and run both.** Use this for leave and attendance, keep Keka for
payroll. Cheapest. Cost is the duplication and the reconciliation.

**B. Close the survivable gaps.** Build documents, onboarding, expenses and
assets. Gets HR most of the way off Keka. Payroll stays in Keka.

**C. Build payroll and leave Keka entirely.** Largest scope by a wide margin, and
carries statutory compliance risk that the rest of this system does not.

Whichever way this goes, the same small piece of work comes first and is worth
doing regardless: **real email addresses and Slack links for all 28 employees.**
Until that happens the system reaches two people, and none of the three options
can be evaluated honestly.
