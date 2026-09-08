# Decisions

Choices that shaped the system, with the reasoning, so nobody re-opens a settled
question without knowing why it was settled.

---

## 2026-09-08 — Punches stay one record each, parented to the day

Raised as: a single employee generating ten punch records in one day makes no
sense, and the punches should live inside the attendance record instead.

**Kept: one record per punch. Added: a lookup to the day it rolls into.**

The record count is a direct consequence of break tracking. Break time is
derived from the gaps between punches, so someone taking four short breaks *is*
ten events, and those ten records are the input to the calculation rather than
noise around it. The complaint was really about presentation: the Attendance
Punch tab showed an undifferentiated pile with no parent. A relationship fixes
that; restructuring the data would have paid for it in the wrong currency.

Collapsing punches into the day record was costed and rejected. It would have
broken seven things:

- **Concurrent writes would silently lose punches.** A web clock-out arriving
  while a biometric batch imports: both read the day, both append, last write
  wins, one punch disappears with no error.
- **Biometric deduplication becomes impossible.** External_Punch_ID__c is a
  unique external id, and uniqueness cannot be enforced on a value inside a JSON
  blob. Replayed device buffers would invent break time nobody took.
- **The self-correcting rollup dies.** Penalties clear themselves because the day
  is recomputed from the punches. Put the punches inside the day and the source
  and the derived value become the same record.
- Per-punch audit (Adjusted_By__c, Adjustment_Reason__c, Approved__c) loses its
  meaning, the Slack punch notice has no insert to fire on, reporting by source
  or device becomes impossible, and a long text area caps out at 32,768
  characters.

**Lookup, not master-detail.** Master-detail cascade-deletes children, and the
rollup deletes Attendance rows when a day empties. That would have destroyed the
punches the day was derived from. Master-detail also demands the parent at
insert time, and the day does not exist until after the punch is written.

**The recursion hazard this created.** Stamping the parent updates the punches,
which re-fires AttendancePunchTrigger. A static guard on AttendanceRollupService
short-circuits the re-entry, and only punches whose parent is actually wrong are
written, so a rebuild that changes nothing performs no DML at all.

### The scaling question underneath it

Measured while costing this: the Developer Edition org has **5 MB of data
storage, 2 MB used**, roughly 1,536 records of headroom. One month of attendance
for 28 people at four punches a day is 3,080 records, so the org fills in about
two weeks. One row per day with no punch records at all only reaches 2.5 months.

The schema was never the scaling constraint; the platform was. Confirmed with
the business that Developer Edition is for building and testing only, and the
system moves to an Enterprise Edition org before go-live, where storage is a
non-issue. **No retention or archival job was built**, on that basis. If the move
slips, a purge of punches older than 90 days keeping a frozen snapshot on the
day is the mitigation, and it is roughly a day of work.

---

## 2026-09-07 — No onboarding LWC in Salesforce

**Decided: the portal keeps the employee onboarding form. No Lightning Web
Component will be built in Salesforce for it.**

An LWC form was considered, where HR would click a button in Salesforce, fill in
a new employee's details, and have the record, the portal invitation and a Slack
account all created from there.

It was rejected for four reasons, in order of weight.

**1. It costs a Salesforce licence per HR user.** The org has four full
Salesforce licences and three are in use. Every HR person who opened that LWC
would consume one, at a per-seat cost, forever. The architecture deliberately
keeps employees out of Salesforce: they authenticate against `Employee__c`
through the portal instead. An onboarding LWC would reverse that for HR.

**2. The form already exists.** `/admin/employees` has an Add Employee form and
`POST /api/employees` already creates the record and issues the invitation.
Building it again in Salesforce would mean two front doors creating employees,
and two places for the rules to drift apart.

**3. Salesforce cannot do the two things that made the LWC attractive.** It
cannot send the invitation email, because no Organization-Wide Email Address is
verified, so Apex could only send from the integration user. And it cannot
create a Slack account: Slack's `admin.*` APIs answer a bot token with
`not_allowed_token_type`, and only accept an Org Owner's user token. Both jobs
would have had to call back out to the portal anyway.

**4. The argument that would have justified it does not apply here.** Converting
a hired candidate into an employee without retyping is worth an LWC. But this
org holds no recruitment objects at all: no candidate, job, application or
interview. The ATS is in a different Salesforce org, so there is no record here
to convert from.

**Instead:** the portal's existing form was fixed. See below.

**Revisit if:** the ATS moves into this org, or HR ends up with Salesforce
licences for another reason. Then a component on the candidate record that hands
off to the portal API becomes worthwhile, and it is a small piece of work.

---

## 2026-09-07 — Invitation email fixed, and the token hashed

`POST /api/employees` generated an invitation link and then wrote it to the
server log, only outside production. In production the link was built and
silently discarded, so an employee created by an admin had no way to learn how
to set their password. The invitation flow existed on paper and did nothing.

Three things were wrong and all three are fixed:

- **The email was never sent.** `sendEmail` was not called at all. Both the
  create and resend paths now go through `lib/invite.ts`, which issues the token
  and emails it through the existing template.
- **The token was stored in plain text** in `Invite_Token__c`, while
  `Invite_Token_Hash__c` sat unused and the password-reset path hashed properly.
  Anyone able to read employee records could have claimed an un-activated
  account. Only the hash is stored now; the token exists solely in the email.
- **A missing expiry meant "never expires".** The old check was
  `if (expiry) { compare }`, so a record with a token and no expiry accepted it
  forever. It now uses `isExpired()`, which treats an absent or unparseable
  expiry as expired.

**Still required, and outside the code:** an email provider. Until one is
configured the system deliberately sends nothing, reports that plainly, and
shows the admin the link to pass on by hand. It does not pretend to have sent
anything.

---

## 2026-09-07 — Slack accounts are linked on join, not created

Automatic Slack account creation was investigated and is not available to this
app. `admin.users.invite` and the SCIM API both require an Org Owner's user
token and a Business+ or Enterprise Grid plan; a bot token is refused outright.
Storing an owner's personal token in Salesforce would also tie provisioning to
one person's employment.

There is a second problem even where it works: a Slack member id does not exist
until the person accepts their invitation, so it can never be captured during
onboarding.

**Instead:** `/api/slack/events` now handles `team_join`. When somebody accepts
their Slack invitation, their email is matched to an employee and
`Slack_User_Id__c` is filled in automatically. Accounts are still created by hand
in Slack, but the linking, which is the part that was failing, looks after
itself. This requires the `users:read.email` scope on the Slack app; without it
the payload carries no email and the route logs that it cannot match.
