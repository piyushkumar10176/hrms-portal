/**
 * Rebuilds daily Attendance__c rows from raw Attendance_Punch__c records.
 *
 * Punches are the source of truth. For each affected (Employee, business date)
 * this service derives the first check-in, the last check-out, break minutes,
 * gross and effective hours, lateness against the assigned shift, and a day
 * status, then upserts the matching Attendance__c row.
 *
 * Breaks are the gaps between punches: every time an employee checks out and
 * checks back in on the same business day, the interval between those two
 * punches is unpaid break. Clocking in at 10:00, out at 10:30 and back in at
 * 11:15 is 45 minutes of break. The shift spans nine hours of which eight are
 * effective and one is break, so Total_Hours__c holds gross minus break and it
 * is that effective figure the attendance policy judges.
 *
 * Dates are bucketed in the HRMS business time zone (Custom Label
 * HRMS_Business_Time_Zone), not the running user's. The integration user runs in
 * America/Los_Angeles while the business runs in Asia/Kolkata, so using
 * DateTime.date() here would file evening punches against the wrong day.
 */
public with sharing class AttendanceRollupService {
    private static final String CHECK_IN = 'Check-In';
    private static final String CHECK_OUT = 'Check-Out';
    private static final String STATUS_PRESENT = 'Present';
    private static final String STATUS_HALF_DAY = 'Half Day';
    private static final String STATUS_ABSENT = 'Absent';
    private static final String STATUS_HOLIDAY = 'Holiday';
    private static final String STATUS_WEEK_OFF = 'Week Off';

    /** Punch type values are free text; treat these as a check-in. */
    private static final Set<String> CHECK_IN_ALIASES = new Set<String>{
        'check-in', 'check in', 'checkin', 'in'
    };

    @TestVisible
    private static String businessTimeZone() {
        return String.isBlank(Label.HRMS_Business_Time_Zone)
            ? 'Asia/Kolkata'
            : Label.HRMS_Business_Time_Zone.trim();
    }

    private static Decimal labelAsDecimal(String raw, Decimal fallback) {
        try {
            return String.isBlank(raw) ? fallback : Decimal.valueOf(raw.trim());
        } catch (Exception e) {
            return fallback;
        }
    }

    // ---- Public façade -----------------------------------------------------
    // Attendance policy lives here, so anything that reports on a day (the Slack
    // punch notifier, the daily digest) reads its constants through these rather
    // than re-deriving them and drifting.

    /** The time zone attendance days are bucketed and rendered in. */
    public static String businessTimeZoneName() {
        return businessTimeZone();
    }

    /** The calendar date an instant falls on in the business time zone. */
    public static Date businessDateOf(DateTime instant) {
        return instant == null ? null : toBusinessDate(instant);
    }

    /** True when a free-text punch type means a check-in. */
    public static Boolean isCheckInType(String punchType) {
        return isCheckIn(punchType);
    }

    /** Effective hours a full working day must reach before it is flagged. */
    public static Decimal minimumEffectiveHours() {
        return labelAsDecimal(Label.HRMS_Penalty_Minimum_Hours, 8);
    }

    /** Break an employee may take inside the shift without eating into the day. */
    public static Decimal breakAllowanceMinutes() {
        return labelAsDecimal(Label.HRMS_Break_Allowance_Minutes, 60);
    }

    /** Renders a minute count as "1h 15m", "45m" or "0m". */
    public static String minutesText(Decimal minutes) {
        return formatMinutes(minutes);
    }

    /**
     * Entry point used by AttendancePunchTrigger.
     *
     * @param changedPunches punches from Trigger.new and/or Trigger.old
     */
    public static void rebuild(List<Attendance_Punch__c> changedPunches) {
        if (changedPunches == null || changedPunches.isEmpty()) {
            return;
        }

        Set<Id> employeeIds = new Set<Id>();
        Set<Date> businessDates = new Set<Date>();
        for (Attendance_Punch__c punch : changedPunches) {
            if (punch.Employee__c == null || punch.Punch_DateTime__c == null) {
                continue;
            }
            employeeIds.add(punch.Employee__c);
            businessDates.add(toBusinessDate(punch.Punch_DateTime__c));
        }
        if (employeeIds.isEmpty() || businessDates.isEmpty()) {
            return;
        }

        Date windowStart = null;
        Date windowEnd = null;
        for (Date businessDate : businessDates) {
            if (windowStart == null || businessDate < windowStart) {
                windowStart = businessDate;
            }
            if (windowEnd == null || businessDate > windowEnd) {
                windowEnd = businessDate;
            }
        }

        // Widen by a day on each side so punches near midnight in the business
        // time zone are still captured by a UTC-bounded query.
        DateTime rangeStart = DateTime.newInstanceGmt(windowStart.addDays(-1), Time.newInstance(0, 0, 0, 0));
        DateTime rangeEnd = DateTime.newInstanceGmt(windowEnd.addDays(2), Time.newInstance(0, 0, 0, 0));

        Map<String, DayTotals> totalsByKey = new Map<String, DayTotals>();
        for (Attendance_Punch__c punch : [
            SELECT Id, Employee__c, Punch_DateTime__c, Punch_Type__c
            FROM Attendance_Punch__c
            WHERE Employee__c IN :employeeIds
              AND Punch_DateTime__c >= :rangeStart
              AND Punch_DateTime__c < :rangeEnd
            ORDER BY Punch_DateTime__c ASC
        ]) {
            if (punch.Punch_DateTime__c == null) {
                continue;
            }
            Date businessDate = toBusinessDate(punch.Punch_DateTime__c);
            if (!businessDates.contains(businessDate)) {
                continue;
            }
            String key = buildKey(punch.Employee__c, businessDate);
            DayTotals totals = totalsByKey.get(key);
            if (totals == null) {
                totals = new DayTotals(punch.Employee__c, businessDate);
                totalsByKey.put(key, totals);
            }
            totals.apply(punch);
        }

        // Every affected (employee, date) needs a row even when all its punches
        // were deleted, so the stale Attendance__c row is corrected rather than left.
        for (Id employeeId : employeeIds) {
            for (Date businessDate : businessDates) {
                String key = buildKey(employeeId, businessDate);
                if (!totalsByKey.containsKey(key)) {
                    totalsByKey.put(key, new DayTotals(employeeId, businessDate));
                }
            }
        }

        applyTotals(totalsByKey, employeeIds, windowStart, windowEnd);
    }

    private static void applyTotals(
        Map<String, DayTotals> totalsByKey,
        Set<Id> employeeIds,
        Date windowStart,
        Date windowEnd
    ) {
        Map<Id, Shift__c> shiftByEmployee = loadShifts(employeeIds, windowStart, windowEnd);
        Set<Date> holidayDates = loadHolidays(windowStart, windowEnd);

        Map<String, Attendance__c> existingByKey = new Map<String, Attendance__c>();
        for (Attendance__c attendance : [
            SELECT Id, Employee__c, Date__c, Check_In__c, Check_Out__c,
                   Total_Hours__c, Gross_Hours__c, Break_Minutes__c,
                   Late_By_Minutes__c, Status__c, Penalty__c, Penalty_Reason__c
            FROM Attendance__c
            WHERE Employee__c IN :employeeIds
              AND Date__c >= :windowStart
              AND Date__c <= :windowEnd
        ]) {
            existingByKey.put(buildKey(attendance.Employee__c, attendance.Date__c), attendance);
        }

        List<Attendance__c> toUpsert = new List<Attendance__c>();
        List<Attendance__c> toDelete = new List<Attendance__c>();

        for (String key : totalsByKey.keySet()) {
            DayTotals totals = totalsByKey.get(key);
            Attendance__c existing = existingByKey.get(key);

            if (!totals.hasAnyPunch()) {
                // No punches left for that day. Remove a row this rollup created
                // rather than leaving a phantom Present record behind.
                if (existing != null) {
                    toDelete.add(new Attendance__c(Id = existing.Id));
                }
                continue;
            }

            Shift__c shift = shiftByEmployee.get(totals.employeeId);
            Attendance__c row = existing == null
                ? new Attendance__c(Employee__c = totals.employeeId, Date__c = totals.businessDate)
                : new Attendance__c(Id = existing.Id);

            row.Check_In__c = totals.firstCheckIn;
            row.Check_Out__c = totals.lastCheckOut;
            row.Gross_Hours__c = totals.grossHours();
            row.Break_Minutes__c = totals.breakMinutes();
            row.Total_Hours__c = totals.hoursWorked();
            row.Late_By_Minutes__c = totals.lateMinutes(shift, businessTimeZone());
            row.Status__c = deriveStatus(totals, shift, holidayDates);

            // Penalties are derived, never sticky: if the punches change so the
            // day no longer breaches, the flag clears itself.
            String penaltyReason = derivePenaltyReason(totals, row.Status__c);
            row.Penalty__c = penaltyReason != null;
            row.Penalty_Reason__c = penaltyReason;

            if (existing == null || isChanged(existing, row)) {
                toUpsert.add(row);
            }
        }

        if (!toUpsert.isEmpty()) {
            upsert toUpsert;
        }
        if (!toDelete.isEmpty()) {
            delete toDelete;
        }
    }

    /**
     * Every field compared here must appear in the query above. The comparison
     * short-circuits, so a missing field stays invisible until the day is
     * rebuilt with nothing else changed, and only then throws.
     */
    private static Boolean isChanged(Attendance__c existing, Attendance__c candidate) {
        return existing.Check_In__c != candidate.Check_In__c
            || existing.Check_Out__c != candidate.Check_Out__c
            || existing.Total_Hours__c != candidate.Total_Hours__c
            || existing.Gross_Hours__c != candidate.Gross_Hours__c
            || existing.Break_Minutes__c != candidate.Break_Minutes__c
            || existing.Late_By_Minutes__c != candidate.Late_By_Minutes__c
            || existing.Status__c != candidate.Status__c
            || existing.Penalty__c != candidate.Penalty__c
            || existing.Penalty_Reason__c != candidate.Penalty_Reason__c;
    }

    /**
     * Attendance policy. Returns the reason the day is penalised, or null.
     *
     * Two breaches, both configurable by Custom Label:
     *   arriving at or after HRMS_Penalty_Arrival_Time, and
     *   working less than HRMS_Penalty_Minimum_Hours of effective time.
     *
     * The hours test reads effective hours, not time on premises, so a long
     * lunch shortens the day exactly as leaving early does. Overrunning
     * HRMS_Break_Allowance_Minutes is reported inside the reason rather than
     * penalised on its own: an employee who breaks for ninety minutes and stays
     * ninety minutes later has still done the work.
     *
     * Days that are not working days are never penalised, and a day still open
     * because there is no check-out is left alone rather than judged early.
     */
    @TestVisible
    private static String derivePenaltyReason(DayTotals totals, String status) {
        if (status == STATUS_WEEK_OFF || status == STATUS_HOLIDAY) {
            return null;
        }
        if (totals.firstCheckIn == null) {
            return null;
        }

        List<String> reasons = new List<String>();

        Integer cutoff = parseHoursMinutes(Label.HRMS_Penalty_Arrival_Time);
        if (cutoff != null) {
            Integer arrival = parseHoursMinutes(totals.firstCheckIn.format('HH:mm', businessTimeZone()));
            if (arrival != null && arrival >= cutoff) {
                reasons.add('arrived at ' + totals.firstCheckIn.format('HH:mm', businessTimeZone()) +
                            ', at or after ' + Label.HRMS_Penalty_Arrival_Time);
            }
        }

        Decimal hours = totals.hoursWorked();
        Decimal minimumHours = labelAsDecimal(Label.HRMS_Penalty_Minimum_Hours, 8);
        if (hours != null && hours < minimumHours) {
            String reason = 'worked ' + String.valueOf(hours) + ' of ' +
                            String.valueOf(minimumHours) + ' effective hours';
            Decimal breakTaken = totals.breakMinutes();
            Decimal allowance = labelAsDecimal(Label.HRMS_Break_Allowance_Minutes, 60);
            if (breakTaken != null && breakTaken > 0) {
                reason += ' (' + formatMinutes(breakTaken) + ' break';
                if (breakTaken > allowance) {
                    reason += ', over the ' + formatMinutes(allowance) + ' allowance';
                }
                reason += ')';
            }
            reasons.add(reason);
        }

        return reasons.isEmpty() ? null : String.join(reasons, '; ');
    }

    private static String deriveStatus(DayTotals totals, Shift__c shift, Set<Date> holidayDates) {
        Integer dayOfWeek = dayOfWeekIso(totals.businessDate);
        if (dayOfWeek == 6 || dayOfWeek == 7) {
            return STATUS_WEEK_OFF;
        }
        if (holidayDates.contains(totals.businessDate)) {
            return STATUS_HOLIDAY;
        }

        Decimal fullDay = shift != null && shift.Full_Day_Hours__c != null
            ? shift.Full_Day_Hours__c
            : labelAsDecimal(Label.HRMS_Default_Full_Day_Hours, 8);
        Decimal halfDay = shift != null && shift.Half_Day_Hours__c != null
            ? shift.Half_Day_Hours__c
            : labelAsDecimal(Label.HRMS_Default_Half_Day_Hours, 4);

        Decimal hours = totals.hoursWorked();
        if (hours == null) {
            // Checked in but never out: treat the day as present rather than absent,
            // and leave the missing check-out visible in the record.
            return STATUS_PRESENT;
        }
        if (hours >= fullDay) {
            return STATUS_PRESENT;
        }
        if (hours >= halfDay) {
            return STATUS_HALF_DAY;
        }
        return STATUS_ABSENT;
    }

    private static Map<Id, Shift__c> loadShifts(Set<Id> employeeIds, Date windowStart, Date windowEnd) {
        Map<Id, Shift__c> shiftByEmployee = new Map<Id, Shift__c>();
        for (Shift_Assignment__c assignment : [
            SELECT Employee__c, Shift__r.Full_Day_Hours__c, Shift__r.Half_Day_Hours__c,
                   Shift__r.Start_Time__c, Shift__r.Grace_Period_Minutes__c
            FROM Shift_Assignment__c
            WHERE Employee__c IN :employeeIds
              AND Shift__c != NULL
              AND (Effective_From__c = NULL OR Effective_From__c <= :windowEnd)
              AND (Effective_To__c = NULL OR Effective_To__c >= :windowStart)
            ORDER BY Effective_From__c ASC NULLS FIRST
        ]) {
            shiftByEmployee.put(assignment.Employee__c, assignment.Shift__r);
        }
        return shiftByEmployee;
    }

    private static Set<Date> loadHolidays(Date windowStart, Date windowEnd) {
        Set<Date> holidayDates = new Set<Date>();
        for (Holiday__c holiday : [
            SELECT Date__c FROM Holiday__c
            WHERE Date__c >= :windowStart AND Date__c <= :windowEnd
        ]) {
            if (holiday.Date__c != null) {
                holidayDates.add(holiday.Date__c);
            }
        }
        return holidayDates;
    }

    /** Converts an instant to the calendar date it falls on in the business time zone. */
    @TestVisible
    private static Date toBusinessDate(DateTime instant) {
        return Date.valueOf(instant.format('yyyy-MM-dd', businessTimeZone()));
    }

    /** ISO day of week: Monday is 1, Sunday is 7. */
    @TestVisible
    private static Integer dayOfWeekIso(Date value) {
        // 1900-01-01 was a Monday, so the day count modulo 7 gives the ISO weekday.
        Integer offset = Math.mod(Date.newInstance(1900, 1, 1).daysBetween(value), 7);
        return offset + 1;
    }

    private static String buildKey(Id employeeId, Date businessDate) {
        return String.valueOf(employeeId) + '|' + String.valueOf(businessDate);
    }

    @TestVisible
    private static Boolean isCheckIn(String punchType) {
        return punchType != null && CHECK_IN_ALIASES.contains(punchType.toLowerCase().trim());
    }

    /**
     * Accumulates the punches for a single employee-day.
     *
     * Punches arrive in chronological order, which is what lets breaks be
     * derived by a single pass: an out-then-in pair bounds a break, and any
     * punch that repeats the previous one (a double check-in from a device that
     * fired twice) is ignored for break purposes rather than treated as a gap.
     */
    private class DayTotals {
        private Id employeeId;
        private Date businessDate;
        private DateTime firstCheckIn;
        private DateTime lastCheckOut;

        /** Set when the last punch seen was a check-out and a break may be open. */
        private DateTime openBreakStart;
        /** Set when the last punch seen was a check-in and work is in progress. */
        private DateTime openWorkStart;
        private DateTime lastPunch;
        private Integer accumulatedBreakSeconds = 0;
        private Integer accumulatedWorkSeconds = 0;

        private DayTotals(Id employeeId, Date businessDate) {
            this.employeeId = employeeId;
            this.businessDate = businessDate;
        }

        private void apply(Attendance_Punch__c punch) {
            DateTime stamp = punch.Punch_DateTime__c;
            if (lastPunch == null || stamp > lastPunch) {
                lastPunch = stamp;
            }

            if (isCheckIn(punch.Punch_Type__c)) {
                if (firstCheckIn == null || stamp < firstCheckIn) {
                    firstCheckIn = stamp;
                }
                // A check-in that closes an open check-out is the far edge of a
                // break. Breaks only exist between the day's first check-in and
                // its last check-out, so a leading check-out is not one.
                if (openBreakStart != null && stamp > openBreakStart) {
                    accumulatedBreakSeconds +=
                        (Integer) ((stamp.getTime() - openBreakStart.getTime()) / 1000);
                }
                openBreakStart = null;
                // Only the first check-in of a run opens the working stretch, so a
                // device firing twice cannot shorten the time it credits.
                if (openWorkStart == null) {
                    openWorkStart = stamp;
                }
            } else {
                if (lastCheckOut == null || stamp > lastCheckOut) {
                    lastCheckOut = stamp;
                }
                // A check-out closes the working stretch it was opened by.
                if (openWorkStart != null && stamp > openWorkStart) {
                    accumulatedWorkSeconds +=
                        (Integer) ((stamp.getTime() - openWorkStart.getTime()) / 1000);
                }
                openWorkStart = null;
                if (openBreakStart == null && firstCheckIn != null) {
                    openBreakStart = stamp;
                }
            }
        }

        private Boolean hasAnyPunch() {
            return firstCheckIn != null || lastCheckOut != null;
        }

        /** Break taken during the day, in whole minutes. Never null once punched. */
        private Decimal breakMinutes() {
            if (!hasAnyPunch()) {
                return null;
            }
            return Math.round(Decimal.valueOf(accumulatedBreakSeconds) / 60);
        }

        /**
         * Elapsed time from the first check-in to the last punch of the day,
         * breaks included. For a finished day that last punch is the check-out,
         * so this is time on premises; while a day is still open it is time
         * elapsed since arriving.
         */
        private Decimal grossHours() {
            if (firstCheckIn == null || lastPunch == null || lastPunch < firstCheckIn) {
                return null;
            }
            Long millis = lastPunch.getTime() - firstCheckIn.getTime();
            return (Decimal.valueOf(millis) / 3600000).setScale(2);
        }

        /**
         * Hours actually worked: the sum of each check-in to check-out stretch.
         *
         * Summing the stretches is deliberate rather than subtracting break from
         * the span. The two agree on a finished day, but partway through one they
         * do not: an employee who has clocked back in from lunch but not yet left
         * has a break longer than the span between their first check-in and their
         * last check-out, and subtracting would report a negative day as zero.
         */
        private Decimal hoursWorked() {
            if (accumulatedWorkSeconds == 0) {
                // Checked in and not yet out: no stretch has closed, so there is
                // nothing to count and the day is left open rather than judged.
                return null;
            }
            return (Decimal.valueOf(accumulatedWorkSeconds) / 3600).setScale(2);
        }

        private Decimal lateMinutes(Shift__c shift, String timeZoneName) {
            if (firstCheckIn == null) {
                return null;
            }
            String startText = shift != null && String.isNotBlank(shift.Start_Time__c)
                ? shift.Start_Time__c
                : Label.HRMS_Default_Shift_Start;
            Decimal grace = shift != null && shift.Grace_Period_Minutes__c != null
                ? shift.Grace_Period_Minutes__c
                : labelAsDecimal(Label.HRMS_Default_Grace_Minutes, 15);

            Integer startMinutes = parseHoursMinutes(startText);
            if (startMinutes == null) {
                return null;
            }

            String arrival = firstCheckIn.format('HH:mm', timeZoneName);
            Integer arrivalMinutes = parseHoursMinutes(arrival);
            if (arrivalMinutes == null) {
                return null;
            }

            Decimal late = arrivalMinutes - startMinutes - grace;
            return late > 0 ? late : 0;
        }
    }

    /** Renders a minute count as "1h 15m", "45m" or "0m". */
    @TestVisible
    private static String formatMinutes(Decimal minutes) {
        if (minutes == null) {
            return '0m';
        }
        Integer total = Integer.valueOf(minutes.setScale(0, System.RoundingMode.HALF_UP));
        Integer hours = total / 60;
        Integer remainder = Math.mod(total, 60);
        if (hours == 0) {
            return remainder + 'm';
        }
        return remainder == 0 ? hours + 'h' : hours + 'h ' + remainder + 'm';
    }

    /** Parses "HH:mm" into minutes past midnight, or null when unparseable. */
    @TestVisible
    private static Integer parseHoursMinutes(String value) {
        if (String.isBlank(value)) {
            return null;
        }
        List<String> parts = value.trim().split(':');
        if (parts.size() < 2) {
            return null;
        }
        try {
            Integer hours = Integer.valueOf(parts[0].trim());
            Integer minutes = Integer.valueOf(parts[1].trim());
            if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
                return null;
            }
            return hours * 60 + minutes;
        } catch (Exception e) {
            return null;
        }
    }
}
