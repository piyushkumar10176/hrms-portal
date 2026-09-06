/**
 * Business calendar helpers.
 *
 * The HRMS runs on Asia/Kolkata. Several places previously derived "today" from
 * `new Date().toISOString()`, which is the UTC date and rolls over at 05:30 IST,
 * so early-morning activity was filed against the previous day.
 */

export const BUSINESS_TIME_ZONE = "Asia/Kolkata";

/** Today's date in the business time zone, as yyyy-mm-dd. */
export function businessToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: BUSINESS_TIME_ZONE });
}

/** A given instant's date in the business time zone, as yyyy-mm-dd. */
export function toBusinessDate(instant: Date | string): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  return date.toLocaleDateString("en-CA", { timeZone: BUSINESS_TIME_ZONE });
}

/** Current wall-clock time in the business time zone, as HH:mm. */
export function businessTimeNow(): string {
  return new Date().toLocaleTimeString("en-IN", {
    timeZone: BUSINESS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
