/**
 * Slack request signature verification.
 *
 * Slack signs every request to this app. Verifying that signature is the only
 * thing standing between the endpoint and anyone on the internet posting
 * forged leave approvals, so it runs before any payload is parsed.
 *
 * Base string is `v0:{timestamp}:{raw body}`, HMAC SHA256 with the signing
 * secret, hex, prefixed `v0=`. Requests older than five minutes are rejected to
 * blunt replay attacks.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const VERSION = "v0";
const MAX_AGE_SECONDS = 60 * 5;

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "missing_headers" | "stale" | "bad_signature" };

/**
 * @param rawBody the exact bytes Slack sent; re-serialising JSON breaks the signature
 * @param signature value of the x-slack-signature header
 * @param timestamp value of the x-slack-request-timestamp header
 * @param signingSecret the app's signing secret
 * @param nowSeconds current unix time, injectable for testing
 */
export function verifySlackRequest(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  signingSecret: string | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): VerifyResult {
  if (!signingSecret) return { ok: false, reason: "not_configured" };
  if (!signature || !timestamp) return { ok: false, reason: "missing_headers" };

  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) return { ok: false, reason: "missing_headers" };
  if (Math.abs(nowSeconds - sent) > MAX_AGE_SECONDS) return { ok: false, reason: "stale" };

  const expected =
    `${VERSION}=` +
    createHmac("sha256", signingSecret)
      .update(`${VERSION}:${timestamp}:${rawBody}`)
      .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return { ok: false, reason: "bad_signature" };
  }
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: "bad_signature" };
}
