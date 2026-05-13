# CloudSheer HRMS — Keka-Style Rebuild Plan

**Status:** Authoritative spec. Execute in order. Gate each phase.
**Org:** `hrms-org` → CloudSheer Consulting (`00DgK00000MShF3UAL`)
**Stack:** Salesforce (source of truth) + Next.js 14+ App Router headless portal
**Auth:** NextAuth v5 (JWT) — Salesforce holds HR data, NextAuth holds session
**Owner:** CloudSheer Consulting

---

## 0. Mission

Rebuild current HRMS into Keka-feature-parity product. Salesforce is sole source of truth. Next.js is read/write-through UI. No local mirror. Bi-directional means SF native UI + portal can both write; portal does NOT cache state.

Drop scope: Performance Reviews, Helpdesk (out of v1).

---

## 1. Current State (audited 2026-05-13)

### Custom Objects in Org (16)
Employee__c, Department-less yet (text field), Designation-less yet (text field), Attendance__c (0 records), Attendance_Punch__c, Holiday__c, Leave_Balance__c, Leave_Request__c, Leave_Type__c, Shift__c (dead in code), Payslip__c (84 records, flat fields), HistoryRecord__c (0 records — dead), Notification__c (6 records), Payroll_Cycle__c (orphan, no relationships), Employee_Salary_Structure__c (new, unused by code), Salary_Component__c (new, unused), Tax_Declaration__c (new, unused), Location__c (off-app).

### App Tabs (13)
Employees, Attendances, Attendance Punches, Holidays, Leave Balances, Leave Requests, Leave Types, Shifts, Payslips, Payroll Cycles, Employee Salary Structures, Salary Components, Tax Declarations.

**Missing tabs:** Notification__c, HistoryRecord__c.

### Automation
- Trigger: `LeaveRequestTrigger` (active) on Leave_Request__c.
- Validation Rules: **ZERO** on all HR objects.
- Approval Processes: **ZERO**. Status fields flipped via direct DML.

### Permission Sets
HRMS_Employee, HRMS_Payslip_Access, HRMS_Payroll_Full_Access.

### Critical issues found
1. Plaintext passwords in `lib/mock-data.ts` seed (incl. real-looking `Piyush@1606`).
2. Two payroll models (flat Payslip__c + componentized Salary_Component__c) running parallel — disconnected.
3. `Payroll_Cycle__c` orphan — no children, totals manual.
4. `Attendance__c` empty — code never writes.
5. `HistoryRecord__c` empty — code never writes.
6. `lib/mock-data.ts` + `lib/store.ts` file-backed JSON store — race condition risk on concurrent writes, dies on serverless.
7. No invite-token expiry on `/api/setup-password`.
8. Webhook secret check exists but middleware redirects unauth webhook reqs to `/login` instead of letting webhook's own auth handle.
9. Implementation guide drift (says `Email__c` real is `Official_Email__c`; says `Start_Date__c`/`End_Date__c` real is `From_Date__c`/`To_Date__c`).
10. Field history tracking not enabled on any object.

### Already fixed (don't redo)
- bcrypt hashing on `db.authenticate` + auto-upgrade legacy plaintext on login.
- `AUTH_SECRET` fallback removed (uses env only).
- Empty `token.sub` rejected in session callback.
- ESI threshold `<=`.
- UUID for IDs via Web Crypto.
- Hour cycle `h23` formatting.
- Cross-midnight clock-out math.
- Leave date order + overlap validation in `applyLeave`.
- `approveLeave` rejects when balance insufficient.
- Birthday date-only compare.
- Crypto-random invite tokens in `/api/employees` POST.
- PUT `/api/employees/[id]` field whitelist.
- Min 8-char invite password.
- Biometric webhook returns 503 if secret unset; validates header otherwise.

---

## 2. Target Architecture

### Decoupled headless model

```
Browser  →  Next.js App Router  →  jsforce (server-only)  →  Salesforce REST API
              ↑                                                      │
              │                                                      ↓
              │                                          [Triggers / Flows / Apex Batch]
              │                                                      │
              └────── poll /api/notifications  ←────  Notification__c records
```

### Source of truth rules

- Every write hits Salesforce synchronously.
- No local DB. No mirror table. No file store.
- Reads come from SF live. Cache only at API helper (≤ 60 sec, employee-ID resolution).
- SF native UI users + portal users can both edit same records. Last write wins (SF native record-level locking applies).
- Triggers/flows in SF write `Notification__c`, `Audit_Log__c` — portal pulls these.
- Approval Processes run in SF — portal submits via `Approval.ProcessSubmitRequest`.

### Auth boundary

- NextAuth v5 JWT for session.
- Credentials provider — email/password.
- Password storage: bcrypt hash in `Employee__c.Password_Hash__c` (new field, Text(255)). Migrate from mock-data on Phase 0.
- Session contains: `id` (SF Employee Id), `email`, `role`, `employeeId` (Employee_Code__c), `department`.
- All API routes validate session via `withAuth` helper.

---

## 3. Object Model (Final State)

### Core HR

#### Employee__c (existing, enhance)
Keep all existing fields. Add:
- `Employment_Type__c` Picklist: Full_Time / Contract / Intern / Consultant
- `Work_Location__c` Lookup → Location__c
- `Probation_End_Date__c` Date
- `Confirmation_Date__c` Date
- `Resignation_Date__c` Date
- `LWD__c` Date
- `Password_Hash__c` Text(255) (encrypted, hidden in layouts)
- `Invite_Token__c` Text(64)
- `Invite_Token_Expires_At__c` DateTime
- Revise `Employee_Status__c` picklist: Active / On_Notice / Inactive / Terminated
- Convert `Department__c` Text → Lookup(Department__c)
- Convert `Designation__c` Text → Lookup(Designation__c)
- Encrypted Text on PII: PAN__c, Aadhaar__c, Bank_Account_Number__c (Classic Encryption — no Shield)

#### Department__c (new)
- Name, Code__c Text, Head__c Lookup→Employee, Parent_Department__c self-Lookup, Status__c Active/Inactive.

#### Designation__c (new)
- Name, Code__c, Grade__c Number(2,0), Department__c Lookup, Status__c.

#### Location__c (existing — verify, augment)
- Name, Address__c, City__c, State__c, Country__c, Pincode__c, Timezone__c (default Asia/Kolkata), Active__c.

### Time & Attendance

#### Shift__c (existing — enhance)
- Name, Start_Time__c Time, End_Time__c Time, Grace_Period_Minutes__c Number, Half_Day_Hours__c, Full_Day_Hours__c, Is_Night_Shift__c.

#### Shift_Assignment__c (new)
- Employee__c (M-D), Shift__c (Lookup), Effective_From__c, Effective_To__c, Is_Current__c.

#### Roster__c (new — daily override)
- Employee__c, Date__c, Shift__c (Lookup), Is_Week_Off__c. Composite uniqueness (Employee, Date).

#### Attendance__c (existing — keep, enhance)
- One row per (Employee, Date). Created by `AttendanceFromPunchTrigger`.
- Add: Shift__c (Lookup, denorm), Is_Late__c (formula), Is_Half_Day__c (formula).

#### Attendance_Punch__c (existing — enhance)
- Add: Adjustment_Reason__c LongText, Adjusted_By__c Lookup→Employee, Approved__c Checkbox.

#### Regularization_Request__c (new)
- Employee__c (M-D), Date__c, Requested_Clock_In__c Time, Requested_Clock_Out__c Time, Reason__c LongText, Status__c picklist (Submitted/Approved/Rejected), Approver__c Lookup→Employee.

### Leave

#### Leave_Type__c (existing — enhance)
- Existing: Name, Code__c, Annual_Quota__c, Carry_Forward_Allowed__c.
- Add: Max_Carry_Forward__c Number, Encashable__c Checkbox, Half_Day_Allowed__c Checkbox, Min_Notice_Days__c Number, Max_Consecutive_Days__c Number, Applicable_Gender__c picklist (All/Male/Female), Color__c Text(7), Active__c Checkbox.

#### Leave_Policy__c (new)
- Bundles leave-type quotas by Department/Designation/Employment_Type. Lookup-driven.

#### Leave_Balance__c (existing — keep, normalized)
- One row per (Employee, Leave_Type, Year). Do NOT denormalize.
- Add: Locked__c Checkbox, Utilization_Pct__c Formula (Percent), Days_Remaining__c Formula (alias for Closing_Balance__c).
- Convert Year__c Text → Number(4).

#### Leave_Request__c (existing — enhance)
- Existing: Employee, From/To/Days, Status, Approver, Half_Day, Reason, Leave_Type.
- Add: Cc_Employees__c LongText, Cancellation_Reason__c LongText, Working_Days__c Number (formula), Attachment_Required__c Checkbox (formula by Days), Submitted_For_Approval__c Checkbox.

#### Holiday__c (existing — enhance)
- Add: Location__c Lookup (optional, state-specific), Year__c Number formula.

### Payroll (full restructure)

#### Salary_Component__c (existing — fix)
- Fix Default_Percentage__c → Percent(5,2). (Currently Percent(3,2), max 9.99%.)
- Add Statutory_Type__c picklist (None/PF/ESI/PT/TDS).
- Verify Calculation_Type__c picklist values: Flat / Percent_of_Basic / Percent_of_CTC / Percent_of_Gross / Formula.
- Verify Component_Type__c values: Earning / Deduction / Reimbursement_Allowance.
- Add Formula__c LongText (used when Calculation_Type=Formula).
- Add Active__c Checkbox.

#### Salary_Structure__c (new — replaces Employee_Salary_Structure__c)
- Employee__c (M-D), Name, Effective_From__c Date, Effective_To__c Date, Total_CTC__c Roll-Up SUM, Status__c picklist (Draft/Active/Superseded), Approved_By__c Lookup→Employee, Approved_On__c Date.

#### Salary_Structure_Line__c (new — M-D Salary_Structure__c)
- Component__c (Lookup→Salary_Component__c), Amount_Monthly__c Currency, Amount_Annual__c Currency (formula = ×12), Percentage__c Percent(5,2).

#### Employee_Compensation__c (new — current pointer)
- 1 row per Active Employee. Salary_Structure__c (Lookup current). Maintained by trigger on Salary_Structure activation.

#### Payroll_Cycle__c (existing — fix)
- Add Cut_Off_Date__c, Pay_Date__c, Locked__c Checkbox, Processed_By__c Lookup→Employee.
- Status__c picklist: Draft / In_Progress / Processed / Paid / Locked.
- Add field Payslip child relationship (created when Payslip__c gets M-D below).
- Convert Total_* fields to Roll-Up Summary on Payslip__c (SUM Gross/Net, COUNT employees).

#### Payslip__c (existing — restructure)
- Migrate flat columns to lines (see §10).
- Add Payroll_Cycle__c **Master-Detail** (enables rollup).
- Add Salary_Structure_Snapshot__c LongText JSON (audit if structure changes after payslip).
- Add Status__c picklist (Draft/Generated/Approved/Paid).
- Keep: Month__c, Paid_On__c, Employee__c.
- Aggregate fields: Gross_Earnings__c, Total_Deductions__c, Net_Pay__c (formula sum of lines OR roll-up).

#### Payslip_Line__c (new — M-D Payslip__c)
- Component__c Lookup→Salary_Component__c, Component_Type__c picklist (Earning/Deduction), Amount__c Currency.

#### Tax_Declaration__c (existing — fix)
- Add Section_80CCD__c (NPS), Section_80E__c (Edu loan), Section_80EEA__c (First-time home).
- Add Payroll_Cycle__c Lookup (optional override).
- Tax_Regime__c picklist: Old / New_2023.
- Status__c picklist: Draft / Submitted / Verified / Final_Locked.

#### Loan__c (new)
- Employee__c (M-D), Type__c picklist (Salary_Advance/Personal/Education), Principal__c Currency, Interest_Rate__c Percent, Tenure_Months__c Number, EMI__c Currency formula, Start_Date__c, End_Date__c, Outstanding__c Currency, Status__c picklist.

#### Loan_Repayment__c (new — M-D Loan__c)
- Payroll_Cycle__c Lookup, Amount__c Currency, Date__c.

#### Reimbursement__c (new)
- Employee__c, Component__c Lookup→Salary_Component__c, Amount_Claimed__c, Amount_Approved__c, Cycle__c Lookup→Payroll_Cycle__c, Status__c picklist, Receipt_Document__c Lookup→ContentDocument.

### Expense

#### Expense_Category__c
Name, Max_Per_Claim__c, Receipt_Required__c, Approval_Required__c, Active__c.

#### Expense_Report__c
Employee__c, Title, Total_Amount__c (rollup), Status__c (Draft/Submitted/Approved/Rejected/Reimbursed), Submitted_On__c, Approver__c.

#### Expense_Line__c (M-D Expense_Report__c)
Category__c Lookup, Amount__c, Date__c, Description__c, Receipt_Document__c Lookup→ContentDocument.

### Onboarding

#### Onboarding_Template__c
Name, Department__c (Lookup), Designation__c (Lookup), Active__c.

#### Onboarding_Template_Task__c (M-D Onboarding_Template__c)
Task_Name__c, Assignee_Role__c picklist (HR/IT/Manager/Self), Due_Days_After_Joining__c Number.

#### Onboarding_Task__c (instance, M-D Employee__c)
Template_Task__c Lookup, Assignee__c Lookup→Employee, Status__c (Pending/In_Progress/Completed/Skipped), Due_Date__c, Completed_On__c, Notes__c LongText.

#### Employee_Document__c (M-D Employee__c)
Document_Type__c picklist (Offer_Letter/PAN_Card/Aadhaar/Bank_Proof/Education/Experience/Other), Document_Name__c, Content_Document_Id__c Lookup→ContentDocument, Verified__c Checkbox, Verified_By__c Lookup→Employee, Expiry_Date__c.

### Offboarding

#### Resignation__c (M-D Employee__c)
Submitted_On__c, Reason__c picklist + Comments LongText, Last_Working_Day__c, Notice_Period_Days__c (formula), Status__c (Pending/Accepted/Withdrawn/Completed).

#### Exit_Checklist__c (M-D Employee__c)
Item__c picklist (Asset_Return/Knowledge_Transfer/Final_Settlement/...), Status__c, Owner__c Lookup→Employee.

#### FNF_Settlement__c
Employee__c, Resignation__c (Lookup), Unpaid_Salary__c, Leave_Encashment__c, Bonus__c, Recoveries__c (Loans), Tax_Adjustment__c, Net_FNF__c (formula), Paid_On__c.

### Assets

#### Asset_Category__c
Name, Depreciation_Rate__c.

#### Asset__c
Tag__c (unique external ID), Category__c Lookup, Make__c, Model__c, Serial_Number__c, Purchase_Date__c, Cost__c Currency, Status__c (Available/Assigned/Repair/Retired), Current_Holder__c Lookup→Employee.

#### Asset_Assignment__c (M-D Asset__c)
Employee__c Lookup, Assigned_Date__c, Returned_Date__c, Condition_On_Return__c LongText.

### Cross-cutting

#### Audit_Log__c (rename HistoryRecord__c)
- Flip M-D → Lookup on Employee__c.
- Resize Description__c Text(255) → LongText(32k).
- Add: Object_Name__c Text, Record_Id__c Text(18), Field__c Text(100), Old_Value__c LongText, New_Value__c LongText, Changed_By__c Lookup→User, Changed_On__c DateTime.
- Existing fields: Employee__c (now Lookup), Date__c, Type__c, Description__c — keep.

#### Notification__c (existing — enhance)
Add: Expires_At__c Date, Read_On__c DateTime, Category__c picklist (Leave/Expense/Payroll/Task/Approval/System/Birthday/Asset).

---

## 4. Relationship Diagram (Final State)

```
Department__c ─< Designation__c ─< Employee__c ─── Reporting_Manager__c (self-Lookup)
Location__c ──────────────────────┘
                                  │
Employee__c ──< Salary_Structure__c (M-D) ──< Salary_Structure_Line__c
            │                                    └─> Salary_Component__c
            │
            ├──< Employee_Compensation__c (1:1 current)
            │
            ├──< Payslip__c (M-D Payroll_Cycle__c) ──< Payslip_Line__c
            │                                              └─> Salary_Component__c
            │
            ├──< Tax_Declaration__c
            ├──< Loan__c ──< Loan_Repayment__c (M-D Payroll_Cycle__c)
            ├──< Reimbursement__c
            ├──< Leave_Request__c (Approver self-Lookup)
            ├──< Leave_Balance__c (Year × Leave_Type)
            ├──< Shift_Assignment__c
            ├──< Roster__c
            ├──< Attendance__c ──< Attendance_Punch__c
            ├──< Regularization_Request__c
            ├──< Expense_Report__c ──< Expense_Line__c
            ├──< Onboarding_Task__c
            ├──< Employee_Document__c
            ├──< Resignation__c ──< FNF_Settlement__c
            │                  └─ Exit_Checklist__c
            ├──< Asset_Assignment__c (Asset__c on other side)
            ├──< Notification__c
            └──< Audit_Log__c (Lookup)

Payroll_Cycle__c ─< Payslip__c (M-D)
                 ─< Loan_Repayment__c
                 ─< Reimbursement__c

Holiday__c ── Location__c (opt)
```

---

## 5. Field History Tracking (FHT) Matrix

Enable native SF FHT on these fields. Adds row to `<Object>__History` system table on each change. Up to 20 fields per object.

| Object | Fields to track |
|--------|----------------|
| Employee__c | Designation__c, Department__c, Reporting_Manager__c, Employee_Status__c, Employment_Type__c, Work_Location__c, Role__c, Probation_End_Date__c, Confirmation_Date__c, Resignation_Date__c, LWD__c, Official_Email__c, Mobile__c |
| Salary_Structure__c | Status__c, Effective_From__c, Effective_To__c, Total_CTC__c, Approved_By__c, Approved_On__c |
| Salary_Structure_Line__c | Amount_Monthly__c, Component__c, Percentage__c |
| Employee_Compensation__c | Salary_Structure__c |
| Leave_Request__c | Status__c, Approver__c, From_Date__c, To_Date__c, Days__c |
| Leave_Balance__c | Availed__c, Closing_Balance__c, Opening_Balance__c, Accrued__c |
| Attendance__c | Check_In__c, Check_Out__c, Total_Hours__c, Status__c, Late_By_Minutes__c |
| Attendance_Punch__c | Punch_DateTime__c, Punch_Type__c, Adjusted_By__c, Approved__c |
| Payslip__c | Status__c, Net_Pay__c, Gross_Earnings__c, Total_Deductions__c, Paid_On__c |
| Payroll_Cycle__c | Status__c, Locked__c, Processed_By__c, Pay_Date__c |
| Tax_Declaration__c | Status__c, Tax_Regime__c, all Section_* amounts |
| Loan__c | Status__c, Outstanding__c, EMI__c |
| Regularization_Request__c | Status__c, Approver__c |
| Shift_Assignment__c | Shift__c, Effective_From__c, Effective_To__c, Is_Current__c |
| Resignation__c | Status__c, Last_Working_Day__c, Notice_Period_Days__c |
| Holiday__c | Date__c, Type__c |

**Metadata syntax:**
```xml
<!-- object -->
<enableHistory>true</enableHistory>
<!-- per field -->
<trackHistory>true</trackHistory>
```

**Augment with `Audit_Log__c`** for business events (status transitions, position changes, salary revisions, approvals) — see triggers list §7.

---

## 6. Validation Rules

| Object | Rule Name | Logic |
|--------|-----------|-------|
| Employee__c | Email_Required | `ISBLANK(Official_Email__c)` |
| Employee__c | Email_Format | `NOT(REGEX(Official_Email__c, "^[^@]+@[^@]+\\.[^@]+$"))` |
| Employee__c | PAN_Format | `AND(NOT(ISBLANK(PAN__c)), NOT(REGEX(PAN__c, "[A-Z]{5}[0-9]{4}[A-Z]")))` |
| Employee__c | Aadhaar_12_Digits | `AND(NOT(ISBLANK(Aadhaar__c)), LEN(Aadhaar__c) != 12)` |
| Employee__c | No_Self_Manage | `Reporting_Manager__c = Id` |
| Leave_Request__c | Date_Order | `From_Date__c > To_Date__c` |
| Leave_Request__c | Days_Positive | `Days__c <= 0` |
| Leave_Request__c | No_Edit_After_Approval | `AND(ISCHANGED(Status__c), PRIORVALUE(Status__c) = "Approved", ISCHANGED(From_Date__c))` — allow Cancel only |
| Leave_Balance__c | Closing_Non_Negative | `Closing_Balance__c < 0` |
| Salary_Structure__c | One_Active_Per_Employee | Apex trigger (formula can't enforce uniqueness) |
| Salary_Structure_Line__c | Amount_Non_Negative | `Amount_Monthly__c < 0` |
| Payroll_Cycle__c | Date_Order | `Start_Date__c > End_Date__c` |
| Payroll_Cycle__c | No_Edit_When_Locked | `AND(Locked__c, NOT(ISCHANGED(Locked__c)))` |
| Payslip__c | Net_Pay_Math | `ABS(Net_Pay__c - (Gross_Earnings__c - Total_Deductions__c)) > 1` |
| Tax_Declaration__c | One_Per_FY | Duplicate rule on (Employee__c + Financial_Year__c) |
| Loan__c | Outstanding_LE_Principal | `Outstanding__c > Principal__c` |
| Shift_Assignment__c | Date_Order | `Effective_From__c > Effective_To__c` |
| Regularization_Request__c | Past_Date_Only | `Date__c > TODAY()` |
| Roster__c | Unique_Day | Duplicate rule on (Employee__c + Date__c) |
| Attendance__c | Unique_Day | Duplicate rule on (Employee__c + Date__c) |

---

## 7. Apex Triggers / Flows

| # | Name | On | Type | Purpose |
|---|------|-----|------|---------|
| 1 | LeaveRequestTrigger | Leave_Request__c | Existing | Notification + balance update on approve |
| 2 | AttendanceFromPunchTrigger | Attendance_Punch__c (after insert) | New | Aggregate punches → daily Attendance__c row |
| 3 | SalaryStructureTrigger | Salary_Structure__c | New | On Active insert, supersede prior; sync Employee_Compensation pointer; write Audit_Log |
| 4 | PayslipGenerationBatch | Apex Batch | New | Triggered when Payroll_Cycle__c.Status → In_Progress: per Active Employee, snapshot Salary_Structure → create Payslip + Lines |
| 5 | LoanRepaymentTrigger | Payroll_Cycle__c (after update to Processed) | New | Create Loan_Repayment__c rows for active loans; reduce Outstanding |
| 6 | EmployeeOnboardFlow | Record-Triggered Flow on Employee__c (insert Active) | New | Generate Onboarding_Task__c from template; create Leave_Balance for current year per Active Leave_Type |
| 7 | ResignationFlow | Record-Triggered Flow on Resignation__c | New | Set Employee.Status → On_Notice; create Exit_Checklist rows |
| 8 | RegularizationApprovalFlow | Approval Process | New | On Approve, adjust Attendance_Punch or Attendance__c |
| 9 | NotificationCleanupSchedule | Scheduled Apex (daily 2am IST) | New | Delete Notification__c where Read_On__c < NOW() - 30d OR Expires_At__c < TODAY() |
| 10 | AuditLogTrigger | Generic helper invoked from triggers above | New | Write Audit_Log__c entries for status transitions, position changes, salary revisions |
| 11 | DailyNotificationsSchedule | Scheduled Apex (daily 6am IST) | New | Birthdays, anniversaries, probation due, document expiry, asset overdue → Notification__c |
| 12 | NotificationFactory | Apex helper class (not trigger) | New | Static methods `create(recipientId, type, title, body, actionUrl)` used by all triggers |

---

## 8. Approval Processes

Use Standard SF Approval Process for each. Submit via `Approval.ProcessSubmitRequest` REST from Next.js routes (replaces direct Status__c writes).

| Object | Approver chain |
|--------|----------------|
| Leave_Request__c | Reporting Manager → HR if Days > 5 |
| Expense_Report__c | Manager → Finance |
| Regularization_Request__c | Manager |
| Reimbursement__c | Manager → Payroll Admin |
| Salary_Structure__c (Draft → Active) | HR Head → CFO |
| Resignation__c | Manager → HR |
| Loan__c | Manager → CFO |

---

## 9. Permission Sets (revise)

| Perm Set | Audience | Access |
|----------|----------|--------|
| HRMS_Employee_Base | All employees | Read own Employee/Attendance/Leave_Balance/Payslip/Notification/Audit_Log. CRUD own Leave_Request/Expense/Tax_Declaration/Regularization/Ticket. |
| HRMS_Manager | Managers | Above + Read direct reports' Employee/Attendance/Leave. Approve LRs/Expenses/Regs of reports. |
| HRMS_HR_Ops | HR team | Full CRUD: Employee/Onboarding/Document/Resignation/Asset/Holiday. Read Payroll. |
| HRMS_Payroll_Admin | Payroll team | Full CRUD: Payroll_Cycle/Salary_Structure/Salary_Component/Payslip/Loan/Reimbursement/Tax_Declaration. |
| HRMS_System_Admin | Sys admin | All above + setup/config. |

Drop existing `HRMS_Payslip_Access` — merged into Base/Manager.

---

## 10. App Tabs (reorder)

Group order in Lightning App Builder for `Cloudsheer_HRMS` app:

1. Home
2. **Core HR**: Employees, Departments, Designations, Locations
3. **Time**: Attendances, Attendance Punches, Shifts, Shift Assignments, Roster, Regularization Requests
4. **Leave**: Leave Requests, Leave Balances, Leave Types, Leave Policies, Holidays
5. **Payroll**: Payroll Cycles, Salary Structures, Salary Components, Payslips, Tax Declarations, Loans, Reimbursements
6. **Expense**: Expense Reports, Expense Categories
7. **Onboarding/Offboarding**: Onboarding Tasks, Templates, Resignations, FNF Settlements, Exit Checklists
8. **Assets**: Assets, Asset Assignments, Asset Categories
9. **Admin**: Notifications, Audit Log

Remove from app: `Shift__c` (if unused at end), `Employee_Salary_Structure__c` (deprecated post-migration).

---

## 11. Notifications — Events Matrix

`NotificationFactory.cls` is the single creator. Triggers/Flows call it.

| Event | Trigger | Recipient | Notification Category |
|-------|---------|-----------|-----------------------|
| Leave request submitted | LeaveRequestTrigger | Manager | Leave |
| Leave approved/rejected | LeaveRequestTrigger | Employee | Leave |
| Leave starts tomorrow | DailyNotificationsSchedule | Employee | Leave |
| Expense submitted | Expense_Report__c approval | Manager | Expense |
| Expense approved/rejected | approval | Employee | Expense |
| Salary revised | SalaryStructureTrigger | Employee | Payroll |
| Payslip generated | PayslipGenerationBatch | Employee | Payroll |
| Document expiring in 30d | DailyNotificationsSchedule | Employee | System |
| Onboarding task assigned | EmployeeOnboardFlow | Assignee | Task |
| Probation ends in 7d | DailyNotificationsSchedule | Manager + HR | System |
| Birthday today | DailyNotificationsSchedule | Team (Reporting_Manager's reports + manager) | Birthday |
| Work anniversary | DailyNotificationsSchedule | Team | Birthday |
| Asset return overdue | DailyNotificationsSchedule | Employee | Asset |
| Regularization submitted | Regularization_Request__c trigger | Manager | Approval |
| Resignation submitted | ResignationFlow | Manager + HR | Approval |
| Loan EMI deducted | LoanRepaymentTrigger | Employee | Payroll |
| Approval action required | each approval process | Approver | Approval |

### Real-time delivery

**Phase 0:** Portal polls `GET /api/notifications` every 30s, bell shows unread count + dropdown.

**Phase 7 enhancement (optional):** SF Platform Event `Notification_Event__e` → Next.js subscribes via CometD/Pub-Sub API → SSE to browser → live updates without poll. Don't break current poll while adding.

### UI in portal

- Existing bell stays.
- Dropdown groups by Category.
- Inline action buttons (Approve/Reject) where applicable.
- "Mark all read" button.
- `/profile/notifications` settings — mute by category.

---

## 12. Bi-directional Matrix

| Object | Read (Next.js) | Write (Next.js) | Write (SF native — trigger/UI/flow) |
|--------|---------------|-----------------|-------------------------------------|
| Employee__c | Yes | Yes (admin add/edit; self-edit limited fields) | Yes (HR Ops via SF UI) |
| Department__c | Yes | Yes (admin) | Yes |
| Designation__c | Yes | Yes (admin) | Yes |
| Salary_Structure__c | Yes (employee, admin) | Yes (Payroll admin) | Yes (SF UI + approval) |
| Salary_Structure_Line__c | Yes | Yes (via structure) | Yes |
| Payroll_Cycle__c | Yes (admin) | Yes (admin generates) | Apex batch |
| Payslip__c | Yes (employee, admin) | No (batch creates) | Apex generation |
| Payslip_Line__c | Yes | No | Apex |
| Leave_Request__c | Yes | Yes (create + cancel) | Yes (trigger updates) |
| Leave_Balance__c | Yes | No (trigger maintains) | Trigger |
| Attendance__c | Yes | No (trigger creates) | Trigger |
| Attendance_Punch__c | Yes | Yes (clock in/out) | Yes (biometric webhook) |
| Regularization_Request__c | Yes | Yes (employee) | Approval flow |
| Tax_Declaration__c | Yes | Yes (employee CRUD) | Yes (HR finalize) |
| Loan__c | Yes (employee view) | No | Yes (Payroll Admin) |
| Reimbursement__c | Yes | Yes (employee submit) | Approval |
| Expense_Report__c | Yes | Yes (employee) | Approval |
| Expense_Line__c | Yes | Yes (via report) | — |
| Onboarding_Task__c | Yes | Yes (mark complete) | Flow generates |
| Employee_Document__c | Yes | Yes (upload) | Yes (HR verify) |
| Resignation__c | Yes | Yes (employee submit) | Flow |
| Asset_Assignment__c | Yes | No | Yes (HR/Admin) |
| Notification__c | Yes (poll) | Yes (mark read) | Trigger creates |
| Audit_Log__c | Yes (readonly) | No | Trigger creates |
| Holiday__c | Yes | No | Yes (HR Ops) |
| Leave_Type__c / Policy / Shift__c | Yes | No | Yes (HR config) |

**Rule:** Config objects (Leave_Type, Shift, Component, Policy) = SF UI only. Transactional/personal records = bi-dir.

---

## 13. Non-Breakage Rules (current UI keeps working)

Mandatory for every PR in every phase:

1. **No removed routes.** Existing routes (`/dashboard`, `/leave`, `/attendance`, `/payroll`, `/profile`, `/admin/employees`, `/admin/employees/[id]`, `/approvals`, `/organisation`, `/login`, `/setup-password/[token]`) keep working at every commit.
2. **No removed API response fields.** Existing `/api/employees/me` returns `{ employee: {...}, history: [] }` — keep envelope. Add fields, never remove.
3. **Feature flag new modules.** Onboarding/Expense/Assets/Offboarding routes behind `NEXT_PUBLIC_FEATURE_<MODULE>` env var. Default off until UAT.
4. **Per-PR smoke checklist** (must pass before merge):
   - [ ] Login flow works (test user)
   - [ ] `/dashboard` renders cards
   - [ ] `/leave` shows balances + can apply
   - [ ] `/attendance` clock in/out works
   - [ ] `/payroll` shows latest payslip
   - [ ] `/profile` loads with history tab
   - [ ] Bell notification shows unread count
   - [ ] `/admin/employees` lists + can edit
5. **Data migration backwards-compat:** When restructuring Payslip__c, keep flat fields as formula fields during transition (see §15). Drop only after frontend cutover.
6. **API versioning:** New fields = additive only. If signature must change, version route at `/api/v2/...`.
7. **Tests:** Add Jest/Playwright smoke for top 8 flows. Run on every PR.

---

## 14. Build Phases

### Phase 0 — Cleanup + Cutover (2 days)

**Day 1 (cleanup planning):**
- Inventory: list every API route, every file in `src/`, every SF object referenced. Output as `MIGRATION_INVENTORY.md`.
- Rotate `Piyush@1606` (user-driven, not agent). Confirm before code changes.
- Identify all reads/writes to `mock-data.ts` / `store.ts`. Map to SF equivalents.
- Output: `MIGRATION_PLAN.md` per-route action.

**Day 2 (cutover):**
- Add `Employee__c.Password_Hash__c`, `Invite_Token__c`, `Invite_Token_Expires_At__c` fields.
- Migrate existing hashed passwords from `data/hrms-data.json` (if any) → Salesforce via Apex anonymous script.
- Rewrite `auth.ts` to read `Password_Hash__c` from SF (not mock-data).
- Replace each `db.*` call across `src/app/api/**/route.ts` with SF call.
- Delete `lib/mock-data.ts`, `lib/store.ts`, `data/`.
- Add tabs for `Notification__c`, `Audit_Log__c` in Lightning app.
- Rename `HistoryRecord__c` → `Audit_Log__c`. Flip M-D to Lookup. Resize Description__c.
- Enable Field History Tracking on Employee__c (top 13 fields), Leave_Request__c (5 fields), Salary_Structure__c (sample).
- Fix middleware: move `/api/webhook` from admin gate to public routes.
- Add invite token expiry validation in `/api/setup-password`.
- Bump `/api/password` min length from 4 → 8.

**Acceptance gate:**
- `grep -r "from.*mock-data" src/` returns nothing.
- All 8 smoke flows pass.
- No fallback paths anywhere.
- Field History visible in SF UI on Employee__c records.
- Plaintext `Piyush@1606` is gone from source + replaced in SF.

### Phase 1 — Core HR (1 week)

- Create `Department__c`, `Designation__c`.
- Data migration: backfill from existing text values (Apex anonymous: query distinct Department__c values, insert as rows, then UPDATE Employee.Department_Lookup__c).
- Convert Employee__c.Department__c / Designation__c text → Lookup. Two-step: add new lookup field, backfill, deprecate text, rename lookup.
- Add Employee__c new fields: Employment_Type, Work_Location, Probation/Confirmation/Resignation/LWD dates.
- All Validation Rules for Employee__c.
- Update permission sets v1: HRMS_Employee_Base, HRMS_Manager, HRMS_HR_Ops.
- Frontend: `/admin/employees`, new `/admin/departments`, `/admin/designations` CRUD via Next.js. Existing `/admin/employees` UI continues working — just FK is enforced.
- Org tree page `/organisation` updates to use lookup relationships.

**Acceptance:**
- Add/edit employee enforces Department/Designation lookups.
- Org tree renders via Reporting_Manager__c.
- Field History on Employee shows Designation/Department changes when edited.

### Phase 2 — Onboarding + Documents (1 week)

- Create Onboarding_Template__c, Onboarding_Template_Task__c, Onboarding_Task__c, Employee_Document__c.
- Build `EmployeeOnboardFlow` (auto-generate tasks on new active employee).
- Frontend: `/onboarding` admin (create templates), employee document upload to SF Files API.
- Acceptance: New employee → tasks auto-spawn from template. Upload doc → stored in SF + listed on profile.

### Phase 3 — Time & Leave Restructure (2 weeks)

- Enhance Shift__c. Create Shift_Assignment__c, Roster__c, Regularization_Request__c.
- Build `AttendanceFromPunchTrigger` (daily aggregation).
- All Validation Rules for Leave_Request__c, Leave_Balance__c, Shift_Assignment__c.
- Leave approval process (Standard SF AP).
- Update `lib/salesforce-queries.ts` `getLeaveBalances` → returns single keyed-object response (see §15 API shape).
- Frontend: rebuild `/attendance` page to read live SF Attendance__c. `/leave` with policy enforcement.
- Acceptance: Punch in/out → Attendance__c row created via trigger. Leave req → SF Approval Process → balance decrements only on approval. Field History shows status transitions.

### Phase 4 — Payroll Restructure (3 weeks) — largest

- **Migration first** (see §15).
- Build Salary_Component config CRUD (admin UI in SF).
- Seed standard components: Basic, HRA, Conveyance, Medical, Special, PF, ESI, PT, TDS.
- Build Salary_Structure__c + Lines. Implement `SalaryStructureTrigger` for versioning.
- Loan + Loan_Repayment + Reimbursement objects.
- Tax_Declaration enhancements (80CCD/80E/80EEA + payroll cycle link).
- `PayslipGenerationBatch` Apex.
- Approval Process for Salary_Structure__c (Draft → Active).
- Lock Payroll_Cycle on Processed.
- Frontend: `/payroll` admin (generate cycle, lock, export), `/profile/salary` employee view.
- Acceptance: Generate cycle → all active employees get Payslip + Lines. Total_* rolls up on Payroll_Cycle. Structure changes after cycle don't alter old payslip. Field History on Payslip status, Salary_Structure changes.

### Phase 5 — Expense (1 week)

- 3 objects + Approval Process.
- Frontend: `/expense/new`, `/expense/reports`, approval inbox merged into `/approvals`.
- Acceptance: Submit expense report with line items + receipts → approval → reimbursement linked to next cycle.

### Phase 6 — Offboarding + Assets (1 week)

- Resignation, Exit_Checklist, FNF_Settlement.
- Asset, Asset_Assignment, Asset_Category.
- `ResignationFlow`.
- Frontend: `/offboarding` employee submit, `/admin/assets`.
- Acceptance: Submit resignation → checklist auto-spawn → FNF calc on completion. Asset assignment tracked. Field History on Resignation status.

### Phase 7 — Audit + Notifications + Reports (1 week)

- `AuditLogTrigger` wired on top 8 objects (Employee, Salary_Structure, Salary_Structure_Line, Leave_Request, Payslip, Tax_Declaration, Resignation, Regularization_Request).
- `NotificationCleanupSchedule` deployed.
- `DailyNotificationsSchedule` deployed.
- Real-time notifications (Platform Event option) — optional.
- Reports + Dashboards (see §16).
- Acceptance: 15+ reports built. 4 dashboards visible. Audit_Log entries written for status changes.

**Total: 9 weeks** (was 10).

---

## 15. Migration Plan

### M1 — Password migration (Phase 0)
1. Add `Employee__c.Password_Hash__c` Encrypted Text(255).
2. Apex anonymous script: for each Employee in `hrms-data.json` with hashed password starting `$2`, upsert `Password_Hash__c` via External ID (Official_Email__c).
3. Rewrite `lib/auth.ts` `authorize()` to query SF + bcrypt-compare.
4. Verify Piyush + 2 test users can log in.
5. Delete `hrms-data.json`.

### M2 — Department/Designation backfill (Phase 1)
1. Apex anonymous:
   ```apex
   Set<String> deptNames = new Set<String>();
   for (Employee__c e : [SELECT Department__c FROM Employee__c WHERE Department__c != null]) deptNames.add(e.Department__c);
   List<Department__c> depts = new List<Department__c>();
   for (String n : deptNames) depts.add(new Department__c(Name=n, Status__c='Active'));
   insert depts;
   Map<String,Id> nameToId = new Map<String,Id>();
   for (Department__c d : depts) nameToId.put(d.Name, d.Id);
   List<Employee__c> updates = new List<Employee__c>();
   for (Employee__c e : [SELECT Id, Department__c FROM Employee__c]) {
     if (e.Department__c != null && nameToId.containsKey(e.Department__c))
       updates.add(new Employee__c(Id=e.Id, Department_New__c=nameToId.get(e.Department__c)));
   }
   update updates;
   ```
2. Same pattern for Designation__c.
3. Rename Department__c → Department_Legacy__c, Department_New__c → Department__c. Verify FLS.

### M3 — Payslip flat → lines (Phase 4)

Backward-compat hack so frontend keeps reading existing flat field names:

```
Step 1: Add Payslip_Line__c (M-D Payslip__c).
Step 2: Backfill — for each of 84 existing Payslip__c rows, create 9 lines mirroring (Basic, HRA, Conveyance, Medical, Special, PF, ESI, Professional_Tax, TDS) values.
Step 3: Rename flat fields → Basic_Legacy__c, HRA_Legacy__c, ...
Step 4: Create new Basic__c, HRA__c etc. as FORMULA fields summing matching Payslip_Line__c rows.
        SF doesn't allow direct Currency → Formula type change. Hence rename + recreate.
Step 5: Frontend continues reading `Basic__c` — now derived from lines. No frontend change needed.
Step 6: 2-week soak. Verify reports match historical.
Step 7: Drop Basic_Legacy__c, etc.
```

### M4 — Employee_Salary_Structure → Salary_Structure_Line (Phase 4)
1. Create Salary_Structure__c headers grouped by (Employee, Effective_Date).
2. Migrate Employee_Salary_Structure__c rows → Salary_Structure_Line__c referencing new header.
3. Delete old object.

### M5 — HistoryRecord → Audit_Log (Phase 0)
1. Add new fields (Object_Name__c, Record_Id__c, Field__c, Old_Value__c, New_Value__c, Changed_By__c, Changed_On__c).
2. Flip Employee__c relationship M-D → Lookup (requires data deletion if M-D — backup first).
3. Resize Description__c.
4. Rename object via metadata.
5. Update all code references from `HistoryRecord__c` → `Audit_Log__c`.

### M6 — Leave Balance API shape change (Phase 3)
Backend stays normalized. API response shape changes:
```ts
// /api/leave/summary or modified /api/leave/balances/[employeeId]
GET → {
  year: 2026,
  balances: {
    CL: { total: 12, used: 4, available: 8, color: "#3b82f6" },
    SL: { total: 6, used: 1, available: 5, color: "#f59e0b" },
    EL: { total: 15, used: 3, available: 12, color: "#10b981" },
    CO: { total: 2, used: 1, available: 1, color: "#8b5cf6" }
  }
}
```
Frontend reduces 1 transform, no array mapping.

---

## 16. Reports + Dashboards

### Reports (15 starter)
1. Headcount Trend (monthly by Department)
2. Attrition (resignations / total, monthly)
3. Pending Approvals by Type & Manager
4. Leave Balance Summary
5. Attendance Compliance %
6. Late Comers (current month, top 20)
7. Payroll Summary (cycle Δ)
8. Loan Outstanding (by Employee)
9. Asset Inventory by Holder
10. Document Expiry in next 30d
11. Probation Confirmations Due
12. Birthdays/Anniversaries this Month
13. Tax Declaration Status (per FY)
14. Reimbursement Pending
15. Audit Trail by Employee (last 90 days)

### Dashboards (Lightning, 4)
- **Exec:** Headcount, Attrition, Payroll spend trend, Open positions
- **HR Ops:** Pending doc verification, Onboarding in progress, Resignations active, Probations due
- **Payroll Admin:** Cycles by status, Total disbursed, Tax declarations pending, Loans active
- **Manager View:** Team attendance %, Team leave today, Pending approvals, Team birthdays

Optional: expose dashboard summary cards on Next.js `/dashboard` via SF Analytics REST API.

---

## 17. Frontend Changes (Next.js)

### Remove
- `lib/mock-data.ts`
- `lib/store.ts`
- `data/hrms-data.json`
- `data/` directory

### Restructure
- Split `lib/salesforce-queries.ts` into module files: `queries/employee.ts`, `queries/leave.ts`, `queries/payroll.ts`, `queries/attendance.ts`, `queries/notification.ts`, `queries/audit.ts`, `queries/expense.ts`, `queries/onboarding.ts`, `queries/offboarding.ts`, `queries/asset.ts`.
- Add `lib/mappers.ts` — single source for SF → frontend object mapping (consolidate 3× duplicated mappers in `/api/employees/me`, `/api/employees/[id]`, `/api/employees`).
- Add `lib/approvals.ts` — wrapper for `Approval.ProcessSubmitRequest` via SF REST.
- Add `lib/audit.ts` — server-side audit-log writer wired into mutation routes.

### New routes (feature-flagged)
- `/admin/departments`, `/admin/designations` (Phase 1)
- `/onboarding`, `/profile/documents` (Phase 2)
- `/regularization` (Phase 3)
- `/payroll/cycle/[id]`, `/admin/payroll/run`, `/profile/salary` (Phase 4)
- `/expense/new`, `/expense/reports/[id]` (Phase 5)
- `/offboarding/resign`, `/admin/offboarding` (Phase 6)
- `/admin/assets`, `/profile/assets` (Phase 6)
- `/api/audit/[objectName]/[recordId]`, `/api/audit/employee/[id]/timeline` (Phase 7)

### Auth changes
Stay with NextAuth + SF backend. No external auth DB. `Employee__c.Password_Hash__c` is store of record.

### Infra
- Vercel env vars: `SF_REFRESH_TOKEN`, `SF_INSTANCE_URL`, `SF_CLIENT_ID`, `SF_CLIENT_SECRET` (optional), `AUTH_SECRET`, `NEXTAUTH_URL`, plus `NEXT_PUBLIC_FEATURE_*` flags.
- CI on PR: lint + typecheck + smoke `npm run build`.
- Sentry or Vercel log drain for runtime errors.

---

## 18. Open Decisions (final answers)

| # | Decision | Final |
|---|----------|-------|
| 1 | Auth direction | NextAuth + SF data (Option B). Stay current. |
| 2 | Tax regime default | New_2023 for new joiners |
| 3 | Encryption | Classic Encrypted Text on PAN/Aadhaar/Bank_Account (no Shield) |
| 4 | Approval routing | Standard SF Approval Process + Apex wrapper |
| 5 | Reimbursement claim limit | per-Component |
| 6 | Payslip generation | Manual: Payroll Admin clicks Generate Cycle button (triggers Apex batch) |
| 7 | Mobile | PWA only (Next.js manifest + sw.js, already in place) |
| 8 | Location__c | Keep as Work Location |
| 9 | Multi-currency | INR only |
| 10 | Data residency | SF org as-is |

---

## 19. What Agent Must NOT Do

- Skip migration steps.
- Drop columns/objects before backup.
- Hardcode picklist values in code — read from SF describe via MCP.
- Mix mock-data fallback with SF in any new code. Delete on sight.
- Write business logic in routes (e.g. payslip calc). Belongs in Apex.
- Skip Standard Approval Process swap. Direct Status__c writes = ban.
- Add fields without `description` + `inlineHelpText` metadata.
- Deploy to production without sandbox refresh + UAT.
- Break Phase smoke checklist.
- Progress phases autonomously. Each phase = explicit user gate.

---

## 20. Deliverables per Phase

Each phase produces:

1. **SFDX metadata diff** under `force-app/main/default/` — objects, fields, triggers, permsets, flows, approvalProcesses, layouts.
2. **Apex test classes** (≥75% coverage on new triggers).
3. **Migration scripts** — `.apex` anonymous or DataLoader CSVs.
4. **Frontend PR** — route + UI changes.
5. **Updated `HRMS_Implementation_Guide.md`** — reflect new fields, endpoints.
6. **Reports/dashboards** as metadata exports.
7. **Smoke-test passing checklist** (§13.4).
8. **Phase report** — what shipped, what tests passed, what's deferred.

---

## 21. Acceptance Gates (per phase, must pass before next)

- [ ] All objects + fields deployed via SFDX.
- [ ] Validation rules active.
- [ ] Field History Tracking enabled on phase's objects.
- [ ] Permission sets assigned to test users.
- [ ] Approval processes (if applicable) tested end-to-end.
- [ ] Frontend routes consume SF (no mock fallback).
- [ ] Audit_Log__c entries written for mutations (Phase 7+).
- [ ] Apex test coverage ≥75% on new triggers.
- [ ] Reports/dashboards for module created.
- [ ] Docs updated (implementation guide + this plan).
- [ ] Smoke checklist passes.
- [ ] User signs off.

---

## 22. File Paths Reference

- Plan doc: `c:\Users\user\Downloads\Headless App\hrms\HRMS_KEKA_REBUILD_PLAN.md` (this file)
- Implementation guide: `C:\Users\user\.gemini\antigravity\brain\8bac057f-0ac8-4a11-9821-16ca73b43906\artifacts\HRMS_Implementation_Guide.md.resolved`
- Next.js code: `c:\Users\user\Downloads\Headless App\hrms\src\`
- SFDX project: `c:\Users\user\Downloads\Headless App\hrms\sf-hrms\force-app\main\default\`
- MCP config (Claude Code): `c:\Users\user\Downloads\Headless App\hrms\.mcp.json`
- MCP config (VSCode): `c:\Users\user\Downloads\Headless App\hrms\.vscode\mcp.json`
- Org alias: `hrms-org`

---

## 23. Glossary

| Term | Meaning |
|------|---------|
| SoT | Source of Truth |
| FHT | Field History Tracking (SF native) |
| FNF | Full and Final Settlement |
| M-D | Master-Detail relationship |
| LR | Leave Request |
| PWA | Progressive Web App |
| AP | Approval Process |
| jsforce | Node.js Salesforce REST client |
| MCP | Model Context Protocol (used by Claude Code to talk to SF) |
| CTC | Cost to Company |
| LWD | Last Working Day |
| FY | Financial Year (Apr 1 – Mar 31, India) |

---

## 24. Kickoff Command for Agent

```
You are executing HRMS_KEKA_REBUILD_PLAN.md.

START AT: Phase 0.

DELIVER FIRST: MIGRATION_INVENTORY.md and MIGRATION_PLAN.md per §14 Phase 0 Day 1.

DO NOT proceed to code changes until:
1. User confirms Piyush@1606 has been rotated in Salesforce.
2. MIGRATION_INVENTORY.md and MIGRATION_PLAN.md are reviewed and approved.

STOP at end of each phase. Report acceptance checklist results. Wait for user sign-off before next phase.

RULES:
- Read this entire plan before any action.
- Read CLAUDE.md and AGENTS.md in the project root.
- Use the salesforce MCP server (alias `hrms-org`) for all SF reads/writes during development.
- Never modify Salesforce metadata without first dumping current state.
- Every PR must pass the §13.4 smoke checklist.
- Never delete the mock-data files until SF write paths are verified working.
- All field additions must include description + inlineHelpText.
- All new triggers must have a corresponding Apex test class.

GO.
```

---

End of plan. Hand to agent verbatim.
