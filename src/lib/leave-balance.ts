/**
 * Canonical leave balance maths.
 *
 * Salesforce is the source of truth: LeaveRequestTriggerHandler maintains
 * Availed__c and Closing_Balance__c on every Leave_Balance__c row as
 * Closing_Balance__c = Opening_Balance__c + Accrued__c - Availed__c.
 *
 * This module exists so the formula lives in exactly one place. Previously the
 * dashboard and the leave page each computed it inline and both double-counted
 * the entitlement, because Opening_Balance__c and Accrued__c had each been
 * seeded with the full annual quota by two different scripts.
 */

export interface SFLeaveBalanceRow {
  Id?: string;
  Opening_Balance__c?: number | null;
  Accrued__c?: number | null;
  Availed__c?: number | null;
  Closing_Balance__c?: number | null;
  Leave_Type__r?: { Name?: string; Code__c?: string } | null;
}

export interface LeaveBalanceView {
  id?: string;
  leaveType: string;
  code: string;
  total: number;
  used: number;
  available: number;
  color?: string;
}

const PALETTE = ["#4F46E5", "#10B981", "#F59E0B", "#EF4444"];

function num(value: number | null | undefined): number {
  return typeof value === "number" ? value : 0;
}

/**
 * Entitlement for the year: anything carried forward plus anything accrued.
 */
export function totalEntitlement(row: SFLeaveBalanceRow): number {
  return num(row.Opening_Balance__c) + num(row.Accrued__c);
}

/**
 * Days still available. Prefers the stored Closing_Balance__c maintained by the
 * Salesforce trigger, and falls back to computing it for rows written before
 * that trigger existed. May be negative when leave was over-availed; callers
 * that need a floor should clamp explicitly rather than hiding the overdraft.
 */
export function availableDays(row: SFLeaveBalanceRow): number {
  if (typeof row.Closing_Balance__c === "number") {
    return row.Closing_Balance__c;
  }
  return totalEntitlement(row) - num(row.Availed__c);
}

/**
 * Maps a Salesforce balance row to the shape the UI consumes.
 */
export function toLeaveBalanceView(
  row: SFLeaveBalanceRow,
  index = 0
): LeaveBalanceView {
  const name = row.Leave_Type__r?.Name || "Leave";
  return {
    id: row.Id,
    leaveType: name,
    code: row.Leave_Type__r?.Code__c || name.substring(0, 2).toUpperCase(),
    total: totalEntitlement(row),
    used: num(row.Availed__c),
    available: availableDays(row),
    color: PALETTE[index % PALETTE.length],
  };
}
