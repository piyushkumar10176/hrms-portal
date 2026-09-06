/**
 * Working-day calculation for leave requests.
 *
 * The number of days a request consumes is derived on the server from the date
 * range. It is never taken from the client: the browser previously supplied
 * `days` directly, which let a request consume a different number of days than
 * the dates it covered.
 */

/** Parses a yyyy-mm-dd string as a UTC date, avoiding local timezone drift. */
export function parseISODate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Counts working days between two dates inclusive, excluding Saturdays,
 * Sundays and any date present in `holidayDates` (yyyy-mm-dd strings).
 *
 * A half-day request over a single date counts as 0.5.
 */
export function countWorkingDays(
  fromDate: string,
  toDate: string,
  holidayDates: Set<string>,
  halfDay = false
): number {
  const start = parseISODate(fromDate);
  const end = parseISODate(toDate);
  if (!start || !end || start > end) return 0;

  let days = 0;
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const weekday = cursor.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    if (holidayDates.has(toISODate(cursor))) continue;
    days += 1;
  }

  if (halfDay && days === 1) return 0.5;
  return days;
}
