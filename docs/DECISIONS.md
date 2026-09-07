# Decisions

Choices that shaped the system, with the reasoning, so nobody re-opens a settled
question without knowing why it was settled.

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
