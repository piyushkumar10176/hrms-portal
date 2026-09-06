/**
 * Sending transactional email.
 *
 * Two drivers. `resend` is the real one; `salesforce` reuses the org's own
 * deliverability through the existing connection and needs no new vendor.
 *
 * The important behaviour is the default: **with nothing configured, nothing is
 * sent.** The message is logged and the caller is told it was not delivered.
 * That keeps a half-configured environment from silently swallowing invites, and
 * keeps a development run from mailing real people.
 */

import { getSalesforceConnection } from "./salesforce";
import type { Email } from "./email-templates";

export type EmailDriver = "resend" | "salesforce" | "disabled";

export interface SendResult {
  sent: boolean;
  driver: EmailDriver;
  error?: string;
}

export function activeDriver(): EmailDriver {
  const configured = (process.env.EMAIL_DRIVER ?? "").trim().toLowerCase();
  if (configured === "resend" && process.env.RESEND_API_KEY) return "resend";
  if (configured === "salesforce") return "salesforce";
  return "disabled";
}

function fromAddress(): string {
  return process.env.EMAIL_FROM ?? "no-reply@cloudsheer.com";
}

/**
 * @param to recipient address
 * @param email subject and bodies from lib/email-templates
 * @returns whether it was actually delivered; never throws
 */
export async function sendEmail(to: string, email: Email): Promise<SendResult> {
  const driver = activeDriver();

  if (driver === "disabled") {
    // Deliberate: no configuration means no delivery, and the caller can say so
    // rather than pretending a message went out.
    console.warn(
      `[email] not configured, nothing sent. to=${to} subject="${email.subject}"`
    );
    return { sent: false, driver, error: "email_not_configured" };
  }

  try {
    if (driver === "resend") return await sendViaResend(to, email);
    return await sendViaSalesforce(to, email);
  } catch (err) {
    console.error("[email] send failed:", err);
    return { sent: false, driver, error: (err as Error).message };
  }
}

async function sendViaResend(to: string, email: Email): Promise<SendResult> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [to],
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return { sent: false, driver: "resend", error: `http_${response.status}: ${detail.slice(0, 200)}` };
  }
  return { sent: true, driver: "resend" };
}

/**
 * Sends through the org's own deliverability using the standard emailSimple
 * action. Requires a verified Organization-Wide Email Address matching
 * EMAIL_FROM, otherwise Salesforce refuses the send.
 */
async function sendViaSalesforce(to: string, email: Email): Promise<SendResult> {
  const connection = await getSalesforceConnection();
  const result = await connection.request<unknown>({
    method: "POST",
    url: "/services/data/v62.0/actions/standard/emailSimple",
    body: JSON.stringify({
      inputs: [
        {
          emailAddresses: to,
          emailSubject: email.subject,
          emailBody: email.html,
          senderType: "OrgWideEmailAddress",
          senderAddress: fromAddress(),
        },
      ],
    }),
    headers: { "Content-Type": "application/json" },
  });

  const outcome = Array.isArray(result) ? result[0] : result;
  const ok = (outcome as { isSuccess?: boolean })?.isSuccess !== false;
  return ok
    ? { sent: true, driver: "salesforce" }
    : { sent: false, driver: "salesforce", error: JSON.stringify(outcome).slice(0, 300) };
}
