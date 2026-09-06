/**
 * Resolves the Employee__c record behind the current session, and rejects
 * sessions that were issued before the employee's password last changed.
 *
 * Sessions are stateless JWTs, so changing a password does not by itself revoke
 * tokens already in circulation. Every route already needs the employee record,
 * so the staleness check rides along on that existing query rather than adding
 * one of its own.
 */

import type { Session } from "next-auth";
import { getEmployeeByEmail, type SFEmployee } from "./salesforce-queries";

export class StaleSessionError extends Error {
  constructor() {
    super("This session is no longer valid. Please sign in again.");
    this.name = "StaleSessionError";
  }
}

export async function getSessionEmployee(
  session: Session & { user: { email: string; passwordChangedAt?: string } }
): Promise<SFEmployee> {
  const employee = await getEmployeeByEmail(session.user.email);

  const changedAt = employee.Password_Changed_At__c;
  if (changedAt) {
    const issuedFor = session.user.passwordChangedAt;
    // A token minted before the password changed, or one carrying no stamp at
    // all because it predates this check, is refused.
    if (!issuedFor || new Date(issuedFor).getTime() < new Date(changedAt).getTime()) {
      throw new StaleSessionError();
    }
  }

  return employee;
}
