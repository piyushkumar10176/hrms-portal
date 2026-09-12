/**
 * Transactional email bodies.
 *
 * Plain, legible HTML with a text alternative. No external images or fonts:
 * corporate mail clients block them, and a broken layout on a password reset
 * looks like a phishing attempt.
 */

const BRAND = process.env.NEXT_PUBLIC_COMPANY_NAME ?? "CloudSheer";
const PRODUCT = process.env.NEXT_PUBLIC_APP_NAME ?? "CloudSheer HRMS";

export interface Email {
  subject: string;
  html: string;
  text: string;
}

function layout(heading: string, bodyHtml: string, footerNote: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f6f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dfe4ea;border-radius:6px;">
        <tr><td style="padding:28px 32px 8px;">
          <p style="margin:0 0 4px;font:600 13px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#6b7688;">${escapeHtml(PRODUCT)}</p>
          <h1 style="margin:0;font:600 21px/1.3 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#161c26;">${escapeHtml(heading)}</h1>
        </td></tr>
        <tr><td style="padding:8px 32px 24px;font:400 15px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#414c5c;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 32px 28px;border-top:1px solid #eef1f5;font:400 13px/1.55 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#6b7688;">
          ${escapeHtml(footerNote)}<br>
          This is an automated message from ${escapeHtml(BRAND)}. Please do not reply.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0;">
    <a href="${escapeHtml(href)}" style="display:inline-block;background:#1f5d8c;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:4px;font:600 15px/1 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">${escapeHtml(label)}</a>
  </p>
  <p style="margin:0 0 4px;font-size:13px;color:#6b7688;">If the button does not work, paste this into your browser:</p>
  <p style="margin:0;font-size:13px;word-break:break-all;"><a href="${escapeHtml(href)}" style="color:#1f5d8c;">${escapeHtml(href)}</a></p>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Sent when an admin creates an employee. */
export function inviteEmail(firstName: string, link: string, expiresInHours: number): Email {
  const name = firstName?.trim() || "there";
  return {
    subject: `Set up your ${PRODUCT} account`,
    html: layout(
      `Welcome, ${name}`,
      `<p style="margin:0 0 12px;">Your ${escapeHtml(PRODUCT)} account is ready. Choose a password to finish setting it up, then you can apply for leave, mark attendance and see your payslips.</p>
       ${button(link, "Set your password")}
       <p style="margin:20px 0 0;">This link works once and expires in ${expiresInHours} hours.</p>`,
      "If you were not expecting this, you can ignore it and no account will be created."
    ),
    text: `Welcome, ${name}

Your ${PRODUCT} account is ready. Set your password here:

${link}

This link works once and expires in ${expiresInHours} hours.

If you were not expecting this, ignore this message.`,
  };
}

/** Sent when someone asks to reset a forgotten password. */
export function passwordResetEmail(firstName: string, link: string, expiresInMinutes: number): Email {
  const name = firstName?.trim() || "there";
  return {
    subject: `Reset your ${PRODUCT} password`,
    html: layout(
      "Reset your password",
      `<p style="margin:0 0 12px;">Hello ${escapeHtml(name)}, we received a request to reset your ${escapeHtml(PRODUCT)} password.</p>
       ${button(link, "Choose a new password")}
       <p style="margin:20px 0 0;">This link works once and expires in ${expiresInMinutes} minutes. Your current password keeps working until you set a new one.</p>`,
      "If you did not ask for this, no action is needed and your password stays as it is."
    ),
    text: `Hello ${name}

We received a request to reset your ${PRODUCT} password. Use this link:

${link}

It works once and expires in ${expiresInMinutes} minutes. Your current password keeps working until you set a new one.

If you did not ask for this, no action is needed.`,
  };
}

/** Sent after a password actually changes, so an unexpected change is noticed. */
export function passwordChangedEmail(firstName: string, whenLabel: string): Email {
  const name = firstName?.trim() || "there";
  return {
    subject: `Your ${PRODUCT} password was changed`,
    html: layout(
      "Your password was changed",
      `<p style="margin:0 0 12px;">Hello ${escapeHtml(name)}, your ${escapeHtml(PRODUCT)} password was changed on ${escapeHtml(whenLabel)}. You have been signed out everywhere and will need to sign in again.</p>
       <p style="margin:0;"><strong>If this was not you</strong>, contact HR straight away.</p>`,
      "We send this whenever a password changes, so an unexpected change gets noticed."
    ),
    text: `Hello ${name}

Your ${PRODUCT} password was changed on ${whenLabel}. You have been signed out everywhere.

If this was not you, contact HR straight away.`,
  };
}
