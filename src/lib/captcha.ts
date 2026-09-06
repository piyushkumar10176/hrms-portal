/**
 * Cloudflare Turnstile verification.
 *
 * Turnstile rather than reCAPTCHA: no cookies, no puzzle for the user in the
 * common case, and no Google dependency on a page that handles credentials.
 *
 * Like email, this is inert until configured. An unconfigured deployment does
 * not block logins, because failing closed on a missing key would lock everyone
 * out of the portal for a setting that is not a security boundary on its own:
 * account lockout is. Whether it is enforced is reported so the caller can log it.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface CaptchaResult {
  ok: boolean;
  enforced: boolean;
  reason?: string;
}

export function captchaConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

/**
 * @param token the value the widget put in cf-turnstile-response
 * @param remoteIp caller address, when known, to tighten the check
 */
export async function verifyCaptcha(
  token: string | null | undefined,
  remoteIp?: string | null
): Promise<CaptchaResult> {
  if (!captchaConfigured()) {
    return { ok: true, enforced: false, reason: "not_configured" };
  }
  if (!token) {
    return { ok: false, enforced: true, reason: "missing_token" };
  }

  try {
    const body = new URLSearchParams({
      secret: process.env.TURNSTILE_SECRET_KEY as string,
      response: token,
    });
    if (remoteIp) body.set("remoteip", remoteIp);

    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const outcome = (await response.json()) as { success?: boolean; "error-codes"?: string[] };

    return outcome.success === true
      ? { ok: true, enforced: true }
      : { ok: false, enforced: true, reason: (outcome["error-codes"] ?? ["rejected"]).join(",") };
  } catch (err) {
    // A Turnstile outage must not become an outage of the portal.
    console.error("[captcha] verification unavailable, allowing:", err);
    return { ok: true, enforced: true, reason: "verifier_unreachable" };
  }
}
