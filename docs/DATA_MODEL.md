# HRMS data model

Every relationship in the schema, generated from the object metadata in
`sf-hrms/force-app/main/default/objects`.

`Employee__c` is the hub. It is **not** a Salesforce `User`: employees
authenticate against `Password_Hash__c` on their own record, which is why the
org needs no per-employee licence.

---

## In scope and in use

### Organisation

| Object | Field | Type | Points at |
|---|---|---|---|
| `Employee__c` | `Reporting_Manager__c` | Lookup | `Employee__c` |
| `Employee__c` | `Department_Ref__c` | Lookup | `Department__c` |
| `Employee__c` | `Designation_Ref__c` | Lookup | `Designation__c` |
| `Employee__c` | `Work_Location__c` | Lookup | `Location__c` |
| `Department__c` | `Head__c` | Lookup | `Employee__c` |
| `Department__c` | `Parent_Department__c` | Lookup | `Department__c` |
| `Designation__c` | `Department__c` | Lookup | `Department__c` |

`Reporting_Manager__c` is a self-lookup and is the entire org chart. Approval
routing reads it; nothing is hardcoded. `Department__c.Parent_Department__c`
allows a department tree, currently flat.

### Leave

| Object | Field | Type | Points at |
|---|---|---|---|
| `Leave_Request__c` | `Employee__c` | Lookup | `Employee__c` |
| `Leave_Request__c` | `Approver__c` | Lookup | `Employee__c` |
| `Leave_Request__c` | `Leave_Type__c` | Lookup | `Leave_Type__c` |
| `Leave_Balance__c` | `Employee__c` | Lookup | `Employee__c` |
| `Leave_Balance__c` | `Leave_Type__c` | Lookup | `Leave_Type__c` |

`Holiday__c` has no relationship to anything. It is a flat calendar read when
counting working days and when deriving attendance status.

One `Leave_Balance__c` row exists per employee, per leave type, per year.
`Availed__c` and `Closing_Balance__c` are maintained by the trigger and must not
be edited by hand.

### Attendance

| Object | Field | Type | Points at |
|---|---|---|---|
| `Attendance_Punch__c` | `Employee__c` | Lookup | `Employee__c` |
| `Attendance_Punch__c` | `Adjusted_By__c` | Lookup | `Employee__c` |
| `Attendance__c` | `Employee__c` | Lookup | `Employee__c` |
| `Attendance__c` | `Shift__c` | Lookup | `Shift__c` |
| `Regularization_Request__c` | `Employee__c` | Lookup | `Employee__c` |
| `Regularization_Request__c` | `Approver__c` | Lookup | `Employee__c` |
| `Shift_Assignment__c` | `Employee__c` | Lookup | `Employee__c` |
| `Shift_Assignment__c` | `Shift__c` | Lookup | `Shift__c` |

`Attendance__c` is **derived**, never entered. It is rebuilt from
`Attendance_Punch__c` whenever punches for that day change. `Shift__c` and
`Shift_Assignment__c` are empty, so the rollup falls back to default hours.

The three hour fields on `Attendance__c` are easy to confuse:

| Field | Means |
|---|---|
| `Total_Hours__c` (**Effective Hours**) | Sum of each clock-in to clock-out stretch, breaks excluded. This is what the penalty rules measure. |
| `Gross_Hours__c` | First clock-in to the last punch of the day, breaks included. |
| `Break_Minutes__c` | Sum of every gap between a clock-out and the next clock-in. |

On a finished day, gross equals effective plus break.

`Attendance_Punch__c.External_Punch_ID__c` is a unique external id holding the
punch's identity on the device that recorded it (`device:employee:timestamp`). It
is what stops a biometric terminal replaying its buffer from recording the same
punch twice, which would invent break time nobody took. It is blank for punches
made in the portal or in Slack.

### Notifications and history

| Object | Field | Type | Points at |
|---|---|---|---|
| `Notification__c` | `Employee__c` | Lookup | `Employee__c` |
| `HistoryRecord__c` | `Employee__c` | **Master-detail** | `Employee__c` |
| `Audit_Log__c` | `Employee__c` | Lookup | `Employee__c` |

`HistoryRecord__c` is master-detail, so it is deleted with the employee.
`Audit_Log__c` is deployed but nothing writes to it yet.

---

## Deployed but out of scope

These block employee deletion. Remove them first when off-boarding.

| Object | Field | Type | Points at |
|---|---|---|---|
| `Payslip__c` | `Employee__c` | Lookup | `Employee__c` |
| `Payslip_Line__c` | `Payslip__c` | **Master-detail** | `Payslip__c` |
| `Payslip_Line__c` | `Component__c` | Lookup | `Salary_Component__c` |
| `Employee_Salary_Structure__c` | `Employee__c` | Lookup | `Employee__c` |
| `Employee_Salary_Structure__c` | `Salary_Component__c` | Lookup | `Salary_Component__c` |
| `Salary_Structure__c` | `Employee__c` | Lookup | `Employee__c` |
| `Salary_Structure__c` | `Approved_By__c` | Lookup | `Employee__c` |
| `Salary_Structure_Line__c` | `Salary_Structure__c` | **Master-detail** | `Salary_Structure__c` |
| `Salary_Structure_Line__c` | `Component__c` | Lookup | `Salary_Component__c` |
| `Tax_Declaration__c` | `Employee__c` | Lookup | `Employee__c` |
| `Payroll_Cycle__c` | `Processed_By__c` | Lookup | `Employee__c` |
| `Loan__c` | `Employee__c` | Lookup | `Employee__c` |
| `Loan_Repayment__c` | `Loan__c` | **Master-detail** | `Loan__c` |
| `Loan_Repayment__c` | `Payroll_Cycle__c` | Lookup | `Payroll_Cycle__c` |
| `Reimbursement__c` | `Employee__c` | Lookup | `Employee__c` |
| `Reimbursement__c` | `Approver__c` | Lookup | `Employee__c` |
| `Reimbursement__c` | `Component__c` | Lookup | `Salary_Component__c` |
| `Reimbursement__c` | `Cycle__c` | Lookup | `Payroll_Cycle__c` |

---

## Schema present, feature not built

| Object | Field | Type | Points at |
|---|---|---|---|
| `Expense_Report__c` | `Employee__c` | Lookup | `Employee__c` |
| `Expense_Report__c` | `Approver__c` | Lookup | `Employee__c` |
| `Expense_Line__c` | `Expense_Report__c` | **Master-detail** | `Expense_Report__c` |
| `Employee_Document__c` | `Employee__c` | **Master-detail** | `Employee__c` |
| `Employee_Document__c` | `Verified_By__c` | Lookup | `Employee__c` |
| `Onboarding_Task__c` | `Employee__c` | **Master-detail** | `Employee__c` |
| `Onboarding_Task__c` | `Assignee__c` | Lookup | `Employee__c` |
| `Onboarding_Task__c` | `Template_Task__c` | Lookup | `Onboarding_Template_Task__c` |
| `Onboarding_Template_Task__c` | `Onboarding_Template__c` | **Master-detail** | `Onboarding_Template__c` |
| `Onboarding_Template__c` | `Department__c` | Lookup | `Department__c` |
| `Onboarding_Template__c` | `Designation__c` | Lookup | `Designation__c` |
| `Asset__c` | `Assigned_To__c` | Lookup | `Employee__c` |
| `Separation__c` | `Employee__c` | Lookup | `Employee__c` |

---

## Notes that matter in practice

**Master-detail cascades.** `Employee_Document__c`, `HistoryRecord__c` and
`Onboarding_Task__c` are deleted with their employee. Everything else is a
lookup, so it survives and either blocks the delete or is left orphaned.

**Deleting an employee** is refused while salary structures, tax declarations or
payslips exist. The order that works: payroll children, then leave requests and
balances, then the employee.

**Two employee fields are duplicated by design.** `Department__c` and
`Designation__c` exist as free text *and* as `Department_Ref__c` and
`Designation_Ref__c` lookups. The text fields are what most code reads today.
Worth consolidating, not yet done.

**`Employee_Code__c` is unique and an external id.** Two employees once shared
EMP001; the constraint now prevents a repeat and allows upserts by code, which
matters for the biometric feed where the device sends an employee code.
