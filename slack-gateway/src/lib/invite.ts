/**
 * Inviting an employee to the portal.
 *
 * One place, so the create-employee route and the resend-invite route cannot
 * drift apart on token strength, expiry or wording. This used to live inline in
 * the create route, where it generated a link and then only wrote it to the
 * server log, and only outside production. In production the link was built and
 * silently discarded, so an employee created by an admin had no way to ever
 * learn it.
 *
 * The token is stored hashed. The plain token exists only in the email. Anyone
 * with read access to Employee records previously saw a working invite token in
 * Invite_Token__c and could have claimed an account before its owner did.
 */

import { updateRecord } from "./salesforce";
import { generateToken, hashToken, expiryFromNow, INVITE_TTL_HOURS } from "./tokens";
import { sendEmail, type SendResult } from "./email";
import { inviteEmail } from "./email-templates";

export interface InviteOutcome {
  /** The link the employee needs. Returned so an admin can pass it on by hand
   *  while no email provider is configured. */
  link: string;
  expiresAt: string;
  email: SendResult;
}

function baseUrl(fallbackOrigin: string): string {
  return (
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    fallbackOrigin
  ).replace(/\/$/, "");
}

/**
 * Issues a fresh invite for an employee and emails it to them.
 *
 * Any previous invite for that employee stops working, because the stored hash
 * is replaced. Never throws: a mail failure is reported in the result so the
 * caller can still show the link rather than losing the whole operation.
 *
 * @param employeeId Employee__c record id
 * @param firstName used to address the message
 * @param emailAddress where to send it
 * @param origin request origin, used only when no app URL is configured
 */
export async function issueInvite(
  employeeId: string,
  firstName: string,
  emailAddress: string,
  origin: string
): Promise<InviteOutcome> {
  const token = generateToken();
  const expiresAt = expiryFromNow(INVITE_TTL_HOURS * 60);

  await updateRecord("Employee__c", employeeId, {
    Invite_Token_Hash__c: hashToken(token),
    Invite_Token_Expires_At__c: expiresAt,
    // Clear the legacy plain-text field so an older invite cannot still be used.
    Invite_Token__c: null,
  });

  const link = `${baseUrl(origin)}/setup-password/${token}`;
  const result = await sendEmail(emailAddress, inviteEmail(firstName, link, INVITE_TTL_HOURS));

  if (!result.sent) {
    // Worth a log line: an invite nobody receives is the failure this module
    // exists to prevent, and the reason belongs in the server log either way.
    console.warn(
      `[invite] not delivered to ${emailAddress} (${result.error ?? "unknown"}). ` +
      `Link must be passed on by hand.`
    );
  }

  return { link, expiresAt, email: result };
}
