# HRMS Migration Inventory (Phase 0 — Day 1)

**Date:** 2026-05-13
**Source:** Audited from live codebase + Salesforce org `hrms-org`

---

## 1. API Routes (18 routes)

| Route | Methods | Data Source | mock-data? | SF? | Action Required |
|-------|---------|------------|------------|-----|-----------------|
| `/api/auth/[...nextauth]` | GET/POST | `lib/auth.ts` → `db.authenticate()` | ✅ Yes | ❌ No | **Rewrite** — read `Password_Hash__c` from SF |
| `/api/employees` | GET/POST | SF (`getAllEmployees`, `createRecord`) | ❌ No | ✅ Yes | Keep |
| `/api/employees/me` | GET/PUT | SF (`getEmployeeByEmail`, `updateRecord`) | ❌ No | ✅ Yes | Keep |
| `/api/employees/[id]` | GET/PUT | SF (`getEmployeeById`, `updateRecord`) | ❌ No | ✅ Yes | Keep |
| `/api/dashboard` | GET | SF (`getEmployeeByEmail`, etc.) | ❌ No | ✅ Yes | Keep |
| `/api/attendance/punch` | POST | SF (`createPunch`) | ❌ No | ✅ Yes | Keep |
| `/api/attendance/monthly` | GET | SF (`getMonthlyAttendance`) | ❌ No | ✅ Yes | Keep |
| `/api/leave/apply` | POST | SF (`createLeaveRequest`) | ❌ No | ✅ Yes | Keep |
| `/api/leave/balances` | GET | SF (`getLeaveBalances`) | ❌ No | ✅ Yes | Keep |
| `/api/holidays` | GET | SF (`getHolidays`) | ❌ No | ✅ Yes | Keep |
| `/api/approvals` | GET/POST | SF (`getPendingApprovals`, `updateRecord`) | ❌ No | ✅ Yes | Keep |
| `/api/payroll` | GET | SF (`getPayslips`, etc.) | ❌ No | ✅ Yes | Keep |
| `/api/salary` | GET | Unknown | ? | ? | Audit |
| `/api/salary-structure` | GET | SF (`getSalaryStructure`) | ❌ No | ✅ Yes | Keep |
| `/api/tax-declaration` | GET | SF (`getTaxDeclaration`) | ❌ No | ✅ Yes | Keep |
| `/api/notifications` | GET/PUT | SF (`getEmployeeByEmail` + direct SOQL) | ❌ No | ✅ Yes | Keep |
| `/api/password` | POST | `db.changePassword()` | ✅ Yes | ❌ No | **Rewrite** — bcrypt against SF `Password_Hash__c` |
| `/api/setup-password` | POST | `db.setEmployeePasswordByToken()` | ✅ Yes | ❌ No | **Rewrite** — token lookup + hash write to SF |
| `/api/sf-test` | GET | SF (diagnostic) | ❌ No | ✅ Yes | Keep (dev only) |
| `/api/webhook/biometric/punch` | POST | SF (`createPunch`) | ❌ No | ✅ Yes | Keep — fix middleware gate |
| `/api/org` | GET | SF (`getAllEmployees`) | ❌ No | ✅ Yes | Keep |

### Summary: **3 routes use mock-data** → must rewrite:
1. `auth.ts` (authorize callback)
2. `/api/password` (change password)
3. `/api/setup-password` (invite token)

---

## 2. Frontend Pages (14 pages)

| Page | Route | Status |
|------|-------|--------|
| Login | `/login` | Working — calls auth.ts |
| Setup Password | `/setup-password/[token]` | Working — calls mock-data via API |
| Dashboard | `/dashboard` | Working — SF data |
| Profile | `/profile` | Working — SF data |
| Profile (by ID) | `/profile/[id]` | Working — SF data |
| Attendance | `/attendance` | Working — SF data |
| Clock In/Out | `/attendance/clock` | Working — SF data |
| Leave | `/leave` | Working — SF data |
| Payroll | `/payroll` | Working — SF data (+ new salary/tax tabs) |
| Approvals | `/approvals` | Working — SF data |
| Organisation | `/organisation` | Working — SF data |
| Admin Employees | `/admin/employees` | Working — SF data |
| Admin Salary | `/admin/salary` | Working — needs audit |
| Root `/` | Redirects to dashboard | Working |

---

## 3. Library Files

| File | Purpose | mock-data? | Action |
|------|---------|------------|--------|
| `lib/auth.ts` | NextAuth config | ✅ imports `db` | **Rewrite** — SF query |
| `lib/mock-data.ts` | DataStore class + seed data | ✅ IS mock-data | **Delete** after rewrite |
| `lib/store.ts` | File-backed JSON persistence | ✅ Used by mock-data | **Delete** after rewrite |
| `lib/salesforce.ts` | jsforce connection helper | ❌ | Keep |
| `lib/salesforce-queries.ts` | SOQL query functions | ❌ | Keep + extend |
| `lib/api-helpers.ts` | Shared API utilities | ❌ | Keep |
| `lib/notifications.ts` | Notification helpers | ❌ | Keep |
| `lib/utils.ts` | Utility functions (cn) | ❌ | Keep |

---

## 4. Component Files

| File | Purpose | Notes |
|------|---------|-------|
| `components/layout/sidebar.tsx` | Navigation sidebar | Keep |
| `components/layout/header.tsx` | Top header bar | Keep |
| `components/layout/app-shell.tsx` | Main layout wrapper | Keep |
| `components/layout/index.ts` | Re-exports | Keep |
| `components/ui/*.tsx` | UI primitives (7 files) | Keep |

---

## 5. Salesforce Objects (SFDX metadata, 15 objects)

| Object | Records | Used by Code | Status |
|--------|---------|--------------|--------|
| `Employee__c` | 28 | ✅ All routes | Keep — enhance per plan |
| `Attendance__c` | 0 | ❌ Not written by code | Dead — needs trigger |
| `Attendance_Punch__c` | ~200+ | ✅ Clock in/out | Keep — enhance |
| `Holiday__c` | 6 | ✅ Dashboard + holidays | Keep — enhance |
| `Leave_Balance__c` | ~112 | ✅ Leave page | Keep |
| `Leave_Request__c` | ~10 | ✅ Leave + approvals | Keep — enhance |
| `Leave_Type__c` | 4 | ✅ Leave apply | Keep — enhance |
| `Shift__c` | 0 | ❌ Not used | Dead — enhance per plan |
| `Payslip__c` | 84 | ✅ Payroll page | Keep — restructure (Phase 4) |
| `Notification__c` | 6 | ✅ Bell notifications | Keep — enhance |
| `HistoryRecord__c` | 0 | ✅ Code writes but 0 records | Rename → `Audit_Log__c` |
| `Payroll_Cycle__c` | 1 | ✅ New payroll page | Fix orphan relationships |
| `Employee_Salary_Structure__c` | 196 | ✅ New payroll page | Deprecated (Phase 4) |
| `Salary_Component__c` | 10 | ✅ New payroll page | Keep — fix constraints |
| `Tax_Declaration__c` | 28 | ✅ New payroll page | Keep — enhance |

---

## 6. Permission Sets (3)

| Name | Status |
|------|--------|
| `HRMS_Employee` | Existing — needs revision |
| `HRMS_Payslip_Access` | Existing — drop (merge into Base) |
| `HRMS_Payroll_Full_Access` | Existing — merge into Payroll_Admin |

---

## 7. Triggers / Automation

| Name | Object | Status |
|------|--------|--------|
| `LeaveRequestTrigger` | `Leave_Request__c` | Active |
| Approval Processes | All objects | **ZERO** |
| Validation Rules | All objects | **ZERO** |

---

## 8. Critical Security Issues

| # | Issue | Location | Severity |
|---|-------|----------|----------|
| 1 | Plaintext `Piyush@1606` in source | `lib/mock-data.ts:105` | 🔴 Critical |
| 2 | Plaintext passwords for all 27 seed employees | `lib/mock-data.ts:87-115` | 🔴 Critical |
| 3 | No invite token expiry check | `/api/setup-password` | 🟡 Medium |
| 4 | Password min length = 4 chars | `/api/password:10` | 🟡 Medium |
| 5 | Webhook blocked by admin gate | `middleware.ts:23` | 🟡 Medium |
| 6 | `AUTH_SECRET` fallback in auth.ts | `lib/auth.ts:95` | 🟡 Medium |

---

## 9. Missing Employee__c Fields (for Phase 0)

| Field | Type | Purpose |
|-------|------|---------|
| `Password_Hash__c` | Text(255) | bcrypt hash storage |
| `Invite_Token__c` | Text(64) | Setup-password token |
| `Invite_Token_Expires_At__c` | DateTime | Token expiry |

---

## 10. Middleware Issues

`/api/webhook` is blocked behind admin gate (`middleware.ts:23`). Needs to be added to public routes.
