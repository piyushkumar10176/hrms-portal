# HRMS Migration Plan (Phase 0 — Day 1)

**Date:** 2026-05-13
**Depends on:** `MIGRATION_INVENTORY.md`
**Phase:** 0 — Cleanup + Cutover

---

## Pre-Conditions (MUST complete before any code changes)

> [!CAUTION]
> **User must confirm:** Has the `Piyush@1606` password been rotated in Salesforce? This plan does NOT proceed until confirmed.

---

## Step 1: Add Auth Fields to Employee__c

### 1.1 Create `Password_Hash__c`
- **Type:** Text(255)
- **Description:** bcrypt password hash for portal login
- **inlineHelpText:** Encrypted password hash — do not edit manually
- **FLS:** Hidden from all layouts. Readable by System Admin only.

### 1.2 Create `Invite_Token__c`
- **Type:** Text(64)
- **Description:** One-time token for password setup invitation
- **inlineHelpText:** Auto-generated token for employee onboarding

### 1.3 Create `Invite_Token_Expires_At__c`
- **Type:** DateTime
- **Description:** Expiry timestamp for invite token
- **inlineHelpText:** Token becomes invalid after this date/time

### Deploy
```bash
sf project deploy start -d force-app/main/default/objects/Employee__c/fields/ --target-org hrms-org --wait 5
```

---

## Step 2: Migrate Passwords to Salesforce

### 2.1 Apex Anonymous Script
For each active employee, set a default bcrypt hash of `emp123` (or whatever the current plaintext is). For Piyush, use the **new rotated password** hash.

```apex
// Run AFTER user confirms password rotation
List<Employee__c> emps = [SELECT Id, Official_Email__c FROM Employee__c WHERE Employee_Status__c = 'Active'];
for (Employee__c emp : emps) {
    // Default hash for 'emp123' — generated via bcryptjs
    emp.Password_Hash__c = '$2a$10$PLACEHOLDER_HASH_FOR_emp123';
}
update emps;
```

> Actual bcrypt hashes will be generated in Node.js and inserted via the script. Cannot bcrypt in Apex natively.

### 2.2 Node.js hash generation script
Create `scripts/migrate-passwords.ts`:
1. Read `SEED_EMPLOYEES` from mock-data.ts (the source passwords).
2. For each employee, `bcryptjs.hashSync(password, 10)`.
3. Match to SF employee by `Official_Email__c`.
4. Update `Password_Hash__c` in SF via jsforce.

---

## Step 3: Rewrite `lib/auth.ts`

### Current (mock-data)
```ts
import { db } from "./mock-data";
// ...
const employee = db.authenticate(email, password);
```

### Target (Salesforce)
```ts
import { queryOneOrNull } from "./salesforce";
import { compareSync } from "bcryptjs";

async authorize(credentials) {
    const email = credentials?.email as string;
    const password = credentials?.password as string;
    if (!email || !password) return null;

    const emp = await queryOneOrNull<{
        Id: string; Official_Email__c: string; Password_Hash__c: string;
        First_Name__c: string; Last_Name__c: string; Employee_Code__c: string;
        Role__c: string; Department__c: string; Employee_Status__c: string;
    }>(`
        SELECT Id, Official_Email__c, Password_Hash__c, First_Name__c, Last_Name__c,
               Employee_Code__c, Role__c, Department__c, Employee_Status__c
        FROM Employee__c
        WHERE Official_Email__c = '${email}' AND Employee_Status__c = 'Active'
        LIMIT 1
    `);

    if (!emp || !emp.Password_Hash__c) return null;
    if (!compareSync(password, emp.Password_Hash__c)) return null;

    return {
        id: emp.Id,
        email: emp.Official_Email__c,
        name: `${emp.First_Name__c} ${emp.Last_Name__c}`,
        employeeId: emp.Employee_Code__c,
        role: emp.Role__c?.toLowerCase() || "employee",
        department: emp.Department__c || "",
    };
}
```

**Remove:** `import { db } from "./mock-data";`

---

## Step 4: Rewrite `/api/password/route.ts`

### Current
```ts
import { db } from "@/lib/mock-data";
const ok = db.changePassword(session.user.id, oldPassword, newPassword);
```

### Target
```ts
import { queryOneOrNull, updateRecord } from "@/lib/salesforce";
import { compareSync, hashSync } from "bcryptjs";

// 1. Query Employee by session.user.id
// 2. compareSync(oldPassword, emp.Password_Hash__c)
// 3. hashSync(newPassword, 10) → updateRecord Employee__c.Password_Hash__c
```

**Fix:** Change minimum password length from 4 → 8 characters.

---

## Step 5: Rewrite `/api/setup-password/route.ts`

### Current
```ts
import { db } from "@/lib/mock-data";
const success = db.setEmployeePasswordByToken(token, password);
```

### Target
```ts
import { queryOneOrNull, updateRecord } from "@/lib/salesforce";
import { hashSync } from "bcryptjs";

// 1. Query: SELECT Id FROM Employee__c WHERE Invite_Token__c = :token AND Invite_Token_Expires_At__c > NOW()
// 2. If not found → invalid/expired
// 3. hashSync(password, 10) → update Password_Hash__c
// 4. Clear Invite_Token__c + Invite_Token_Expires_At__c
```

**Add:** Token expiry validation (reject expired tokens).

---

## Step 6: Fix Middleware

### Current issue
`/api/webhook` is gated behind admin role check (line 23).

### Fix
Add to public routes:
```ts
if (pathname.startsWith("/login") || pathname.startsWith("/api/auth") || 
    pathname.startsWith("/api/webhook") || pathname.startsWith("/setup-password") ||
    ...
```

Also add `/setup-password` to public routes (it's currently not — tokens can't be used without login).

---

## Step 7: Delete Mock Data Files

**Only after Steps 1-5 are verified working:**

```bash
rm src/lib/mock-data.ts
rm src/lib/store.ts
rm -rf data/  # if exists
```

### Verification gate
```bash
grep -r "from.*mock-data" src/  # must return nothing
grep -r "from.*store" src/      # must return nothing (except salesforce store patterns)
```

---

## Step 8: HistoryRecord__c → Audit_Log__c Preparation

### 8.1 Add new fields to HistoryRecord__c
- `Object_Name__c` Text(100)
- `Record_Id__c` Text(18)
- `Field__c` Text(100)
- `Old_Value__c` LongTextArea(32768)
- `New_Value__c` LongTextArea(32768)
- `Changed_By__c` Lookup(User)
- `Changed_On__c` DateTime

### 8.2 Change relationship
- Employee__c relationship: M-D → Lookup (requires backup + data delete + re-create)

### 8.3 Resize Description__c
- Text(255) → LongTextArea(32768)

### 8.4 Rename object
- Via SFDX metadata: rename API name

### 8.5 Update code references
```bash
grep -r "HistoryRecord__c" src/  # find all references → replace with Audit_Log__c
```

---

## Step 9: Enable Field History Tracking

### Employee__c (13 fields)
Enable FHT on: `Designation__c`, `Department__c`, `Reporting_Manager__c`, `Employee_Status__c`, `Role__c`, `Official_Email__c`, `Mobile__c`

### Leave_Request__c (5 fields)
Enable FHT on: `Status__c`, `Approver__c`, `From_Date__c`, `To_Date__c`, `Days__c`

### Object-level
```xml
<enableHistory>true</enableHistory>
```

---

## Step 10: Verify `/api/salary` Route

Audit the `/api/salary` route — may be a duplicate or leftover. Remove if not used.

---

## Step 11: Add Tabs for Missing Objects

In the Lightning App `Cloudsheer_HRMS`, add tabs for:
- `Notification__c`
- `Audit_Log__c` (after rename)

---

## Execution Order

```
1. User confirms Piyush@1606 rotated ← GATE
2. Deploy Password_Hash__c, Invite_Token__c, Invite_Token_Expires_At__c
3. Run password migration script (Node.js → SF)
4. Rewrite auth.ts
5. Rewrite /api/password
6. Rewrite /api/setup-password
7. Fix middleware
8. Smoke test all 8 flows
9. Delete mock-data.ts + store.ts
10. Verify: grep returns no mock-data imports
11. HistoryRecord → Audit_Log rename + enhance
12. Enable Field History Tracking
13. Add missing tabs
14. Final smoke test
```

---

## Smoke Test Checklist (must pass before Phase 0 sign-off)

- [ ] Login flow works (test user)
- [ ] `/dashboard` renders cards
- [ ] `/leave` shows balances + can apply
- [ ] `/attendance` clock in/out works
- [ ] `/payroll` shows latest payslip
- [ ] `/profile` loads with history tab
- [ ] Bell notification shows unread count
- [ ] `/admin/employees` lists + can edit
- [ ] `grep -r "from.*mock-data" src/` returns nothing
- [ ] Field History visible in SF UI on Employee__c records

---

## Files Changed (Phase 0)

| Action | File |
|--------|------|
| **New** | `sf-hrms/.../Employee__c/fields/Password_Hash__c.field-meta.xml` |
| **New** | `sf-hrms/.../Employee__c/fields/Invite_Token__c.field-meta.xml` |
| **New** | `sf-hrms/.../Employee__c/fields/Invite_Token_Expires_At__c.field-meta.xml` |
| **New** | `scripts/migrate-passwords.ts` |
| **Rewrite** | `src/lib/auth.ts` |
| **Rewrite** | `src/app/api/password/route.ts` |
| **Rewrite** | `src/app/api/setup-password/route.ts` |
| **Fix** | `src/middleware.ts` |
| **Delete** | `src/lib/mock-data.ts` |
| **Delete** | `src/lib/store.ts` |
| **Enhance** | `sf-hrms/.../HistoryRecord__c/` (rename + new fields) |
| **Enable** | FHT on Employee__c, Leave_Request__c |
