/**
 * Single-use tokens for invites and password resets.
 *
 * The raw token exists only in the link that reaches the person. What is stored
 * is its SHA-256, so reading the database gives an attacker nothing they can
 * replay. Comparison is constant-time, and lookup is by hash rather than by a
 * scan, so a token cannot be probed character by character.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Invite links are long-lived: a new joiner may not open it the same day. */
export const INVITE_TTL_HOURS = 72;
/** Reset links are short-lived, because the account already exists. */
export const RESET_TTL_MINUTES = 60;
/** How long before the same account may request another reset email. */
export const RESET_THROTTLE_MINUTES = 2;

/** A 256-bit URL-safe token. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 hex of a token, which is what gets stored. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Constant-time hash comparison. */
export function hashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function expiryFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

/** True when an ISO instant is absent or already past. */
export function isExpired(isoInstant: string | null | undefined): boolean {
  if (!isoInstant) return true;
  const at = new Date(isoInstant).getTime();
  return Number.isNaN(at) || at <= Date.now();
}

/**
 * Password strength. Deliberately modest and explicit rather than a score:
 * people work around rules they cannot predict.
 */
export function validatePassword(password: string): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 200) return "That password is too long.";
  if (!/[a-z]/.test(password)) return "Include a lower case letter.";
  if (!/[A-Z]/.test(password)) return "Include an upper case letter.";
  if (!/[0-9]/.test(password)) return "Include a number.";
  const tooCommon = ["password", "12345678", "qwerty", "welcome", "letmein", "cloudsheer"];
  if (tooCommon.some((c) => password.toLowerCase().includes(c))) {
    return "That password is too easy to guess.";
  }
  return null;
}
