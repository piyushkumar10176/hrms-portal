/**
 * Attendance arithmetic shared by the portal, the API and the Slack gateway.
 *
 * A shift spans nine hours of which eight are effective and one is break. Break
 * is not declared by the employee: it is the gap between punches. Every time
 * someone clocks out and clocks back in on the same business day, the interval
 * between those two punches is break. Clocking in at 10:00, out at 10:30 and
 * back in at 11:15 is forty-five minutes, whether it is taken in one stretch or
 * in several short ones.
 *
 * This mirrors AttendanceRollupService in Apex, which is the system of record.
 * The two exist because Salesforce derives the day after the fact while the
 * portal has to answer "how am I doing right now" from raw punches. Change one
 * and change the other.
 */

import { BUSINESS_TIME_ZONE } from "./business-time";

/** Effective hours a working day must reach before it is flagged. */
export const MINIMUM_EFFECTIVE_HOURS = 8;

/** Break allowed inside the shift without eating into the working day. */
export const BREAK_ALLOWANCE_MINUTES = 60;

export interface PunchLike {
  Punch_DateTime__c: string;
  Punch_Type__c?: string | null;
  Source__c?: string | null;
}

export interface PunchLogEntry {
  type: "Check-In" | "Check-Out";
  time: string;
  at: string;
  source: string | null;
  /** Minutes of break that ended at this check-in, when it closed one. */
  breakBeforeMinutes?: number;
}

export interface DaySummary {
  clockIn: string | null;
  clockOut: string | null;
  /** First check-in to the last punch of the day, breaks included. */
  grossHours: number | null;
  /** The sum of each check-in to check-out stretch: what the policy measures. */
  effectiveHours: number | null;
  breakMinutes: number;
  /** True while the employee is clocked in with no matching clock-out. */
  onTheClock: boolean;
  /**
   * The clock-out that has not yet been followed by a clock-in.
   *
   * Deliberately NOT called "on a break". Nothing in the data distinguishes
   * stepping out for coffee from going home for the day; the difference only
   * appears if a later clock-in arrives. Callers must therefore describe this
   * as "clocked out", never as an open break, or someone who has finished at
   * 19:00 is told they are on a break and invited to come back from it.
   */
  awaySince: string | null;
  breakOverAllowance: boolean;
  log: PunchLogEntry[];
}

/** Punch types are free text; these all mean a check-in. */
const CHECK_IN_ALIASES = new Set(["check-in", "check in", "checkin", "in"]);

export function isCheckIn(punchType: string | null | undefined): boolean {
  return CHECK_IN_ALIASES.has((punchType || "").toLowerCase().trim());
}

/** Renders a punch instant as HH:mm in the business time zone. */
export function punchTime(instant: string | Date): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  return date.toLocaleTimeString("en-GB", {
    timeZone: BUSINESS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Renders a minute count as "1h 15m", "45m" or "0m". */
export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return "0m";
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const remainder = total % 60;
  if (hours === 0) return `${remainder}m`;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

/** Renders decimal hours as "8h 15m". */
export function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return "—";
  return formatMinutes(Math.round(hours * 60));
}

/**
 * Derives the day from an employee's punches.
 *
 * Punches are sorted here rather than trusted, because the biometric import and
 * the portal write through different paths and a device replaying a batch can
 * arrive out of order.
 */
export function summarizeDay(punches: PunchLike[]): DaySummary {
  const empty: DaySummary = {
    clockIn: null,
    clockOut: null,
    grossHours: null,
    effectiveHours: null,
    breakMinutes: 0,
    onTheClock: false,
    awaySince: null,
    breakOverAllowance: false,
    log: [],
  };
  if (!punches || punches.length === 0) return empty;

  const ordered = [...punches]
    .filter((p) => p.Punch_DateTime__c)
    .sort(
      (a, b) =>
        new Date(a.Punch_DateTime__c).getTime() - new Date(b.Punch_DateTime__c).getTime()
    );
  if (ordered.length === 0) return empty;

  let firstCheckIn: Date | null = null;
  let lastCheckOut: Date | null = null;
  let lastPunch: Date | null = null;
  let openBreakStart: Date | null = null;
  let openWorkStart: Date | null = null;
  let breakSeconds = 0;
  let workSeconds = 0;
  let lastWasCheckIn = false;
  const log: PunchLogEntry[] = [];

  for (const punch of ordered) {
    const stamp = new Date(punch.Punch_DateTime__c);
    const entry: PunchLogEntry = {
      type: isCheckIn(punch.Punch_Type__c) ? "Check-In" : "Check-Out",
      time: punchTime(stamp),
      at: stamp.toISOString(),
      source: punch.Source__c ?? null,
    };

    if (!lastPunch || stamp > lastPunch) lastPunch = stamp;

    if (entry.type === "Check-In") {
      if (!firstCheckIn || stamp < firstCheckIn) firstCheckIn = stamp;
      // A check-in that closes an open check-out is the far edge of a break.
      // Breaks only exist between the first check-in and the last check-out, so
      // a stray leading check-out never opens one.
      if (openBreakStart && stamp > openBreakStart) {
        const gap = Math.round((stamp.getTime() - openBreakStart.getTime()) / 1000);
        breakSeconds += gap;
        entry.breakBeforeMinutes = Math.round(gap / 60);
      }
      openBreakStart = null;
      // Only the first check-in of a run opens the working stretch, so a device
      // firing twice cannot shorten the time it credits.
      if (!openWorkStart) openWorkStart = stamp;
      lastWasCheckIn = true;
    } else {
      if (!lastCheckOut || stamp > lastCheckOut) lastCheckOut = stamp;
      // A check-out closes the working stretch it was opened by.
      if (openWorkStart && stamp > openWorkStart) {
        workSeconds += Math.round((stamp.getTime() - openWorkStart.getTime()) / 1000);
      }
      openWorkStart = null;
      // Only the first check-out of a run opens the break; a device firing twice
      // would otherwise shorten it.
      if (!openBreakStart && firstCheckIn) openBreakStart = stamp;
      lastWasCheckIn = false;
    }

    log.push(entry);
  }

  const breakMinutes = Math.round(breakSeconds / 60);
  const grossHours =
    firstCheckIn && lastPunch && lastPunch >= firstCheckIn
      ? round2((lastPunch.getTime() - firstCheckIn.getTime()) / 3600000)
      : null;
  // Summing the worked stretches is deliberate rather than subtracting break
  // from the span. The two agree on a finished day, but partway through one they
  // do not: someone back from lunch but not yet gone for the evening has a break
  // longer than the span between their first check-in and their last check-out.
  const effectiveHours = workSeconds === 0 ? null : round2(workSeconds / 3600);

  return {
    clockIn: firstCheckIn ? punchTime(firstCheckIn) : null,
    clockOut: lastCheckOut ? punchTime(lastCheckOut) : null,
    grossHours,
    effectiveHours,
    breakMinutes,
    onTheClock: lastWasCheckIn,
    awaySince: openBreakStart ? punchTime(openBreakStart) : null,
    breakOverAllowance: breakMinutes > BREAK_ALLOWANCE_MINUTES,
    log,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
