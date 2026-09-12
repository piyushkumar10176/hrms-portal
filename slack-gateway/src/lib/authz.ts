/**
 * Who may do what.
 *
 * Every permission decision in the application comes from this module. It exists
 * because the rules were previously scattered across route handlers, where a
 * single missed check silently exposed data: the employee detail route once
 * returned anyone's bank account, PAN and Aadhaar to any signed-in employee.
 *
 * Roles are held on Employee__c.Role__c rather than inferred from department, so
 * moving team does not change what someone can do.
 */

export type Role = "employee" | "hr" | "admin";

export interface Actor {
  /** Employee__c record id of the signed-in person. */
  id: string;
  role: Role;
}

/** Normalises whatever the session carries into a known role. */
export function toRole(raw: string | null | undefined): Role {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "admin") return "admin";
  if (value === "hr") return "hr";
  return "employee";
}

export function isAdmin(actor: Actor): boolean {
  return actor.role === "admin";
}

/** HR and admin both act on behalf of the company rather than themselves. */
export function isHrOrAdmin(actor: Actor): boolean {
  return actor.role === "hr" || actor.role === "admin";
}

/**
 * Whether the actor may see personal identifiers: bank account, IFSC, PAN,
 * Aadhaar, date of birth.
 *
 * The employee themselves, HR, and admins. A manager may see their reports'
 * employment details but not their bank or government identifiers, because
 * nothing in the approval flow needs them.
 */
export function canSeeSensitiveFields(actor: Actor, subjectEmployeeId: string): boolean {
  return actor.id === subjectEmployeeId || isHrOrAdmin(actor);
}

/** Whether the actor may read another employee's employment history. */
export function canSeeEmploymentHistory(
  actor: Actor,
  subjectEmployeeId: string,
  subjectReportingManagerId: string | null
): boolean {
  if (actor.id === subjectEmployeeId) return true;
  if (isHrOrAdmin(actor)) return true;
  return subjectReportingManagerId === actor.id;
}

/**
 * Whether the actor may decide a request.
 *
 * The named approver may. HR and admin may decide anything, so cover is never
 * blocked by a manager being away. Nobody may decide their own request, and that
 * holds for HR and admin too: self-approval is the one rule with no exception.
 */
export function canDecideRequest(
  actor: Actor,
  requestApproverId: string | null,
  requestOwnerId: string | null
): { allowed: boolean; asOverride: boolean; reason?: string } {
  if (requestOwnerId && requestOwnerId === actor.id) {
    return { allowed: false, asOverride: false, reason: "You cannot decide your own request." };
  }
  if (requestApproverId && requestApproverId === actor.id) {
    return { allowed: true, asOverride: false };
  }
  if (isHrOrAdmin(actor)) {
    return { allowed: true, asOverride: true };
  }
  return {
    allowed: false,
    asOverride: false,
    reason: "You are not the approver for that request.",
  };
}

/** Whether the actor may see company-wide HR data rather than only their own. */
export function canSeeCompanyWideData(actor: Actor): boolean {
  return isHrOrAdmin(actor);
}

/** Whether the actor may create or edit employee records and configuration. */
export function canManageEmployees(actor: Actor): boolean {
  return isAdmin(actor);
}

/** Whether the actor may cancel a leave request. Only its owner, ever. */
export function canCancelRequest(actor: Actor, requestOwnerId: string | null): boolean {
  return Boolean(requestOwnerId) && requestOwnerId === actor.id;
}
