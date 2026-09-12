/**
 * The attendance commands.
 *
 * Punches are the record; the day is derived from them by
 * AttendanceRollupService, which also works out break time from the gaps
 * between them. Nothing here calculates anything itself, so Slack and every
 * other surface always agree.
 */
public with sharing class SlackAttendanceCommand {

    private static final String CHECK_IN = 'Check-In';
    private static final String CHECK_OUT = 'Check-Out';

    /** `/attendance in`, `out`, or nothing for today's log. */
    public static String run(Employee__c employee, String argument) {
        String verb = String.isBlank(argument) ? 'today' : argument.trim().toLowerCase();

        if (verb == 'in' || verb == 'out') {
            return punch(employee, verb);
        }
        if (verb == 'today' || verb == '') {
            return today(employee);
        }
        return SlackBlocks.ephemeral(
            'Try `/attendance in`, `/attendance out` or `/attendance` for today\'s log.'
        );
    }

    /**
     * Records a punch, after checking it makes sense.
     *
     * Without the ordering check somebody could clock in twice, or out having
     * never clocked in, and the rollup would derive nonsense hours from the pair.
     */
    private static String punch(Employee__c employee, String direction) {
        List<Attendance_Punch__c> punches = todaysPunches(employee.Id);
        Boolean lastWasIn = !punches.isEmpty()
            && AttendanceRollupService.isCheckInType(punches[punches.size() - 1].Punch_Type__c);

        if (direction == 'in' && lastWasIn) {
            return SlackBlocks.ephemeral('You are already clocked in.');
        }
        if (direction == 'out' && !lastWasIn) {
            return SlackBlocks.ephemeral(
                punches.isEmpty() ? 'You have not clocked in today.' : 'You are already clocked out.'
            );
        }

        insert new Attendance_Punch__c(
            Employee__c = employee.Id,
            Punch_DateTime__c = System.now(),
            Punch_Type__c = direction == 'in' ? CHECK_IN : CHECK_OUT,
            // Marked Slack so the Apex punch notifier stays quiet: this reply is
            // already the confirmation, and a direct message would repeat it.
            Source__c = 'Slack'
        );

        Day day = summarise(todaysPunches(employee.Id));
        String at = System.now().format('HH:mm', AttendanceRollupService.businessTimeZoneName());

        if (direction == 'in') {
            return SlackBlocks.ephemeral(
                day.lastBreakMinutes > 0
                    ? 'Clocked in at ' + at + ' after a ' +
                      AttendanceRollupService.minutesText(day.lastBreakMinutes) + ' break.'
                    : 'Clocked in at ' + at + '.'
            );
        }
        return SlackBlocks.ephemeral(
            'Clocked out at ' + at + '. ' + hours(day.workedMinutes) + ' worked' +
            (day.breakMinutes > 0
                ? ', ' + AttendanceRollupService.minutesText(day.breakMinutes) + ' break.'
                : '.')
        );
    }

    /** The whole day: every punch, the break before each return, and the totals. */
    private static String today(Employee__c employee) {
        List<Attendance_Punch__c> punches = todaysPunches(employee.Id);
        if (punches.isEmpty()) {
            return SlackBlocks.ephemeral('No punches recorded today.');
        }

        Day day = summarise(punches);
        String zone = AttendanceRollupService.businessTimeZoneName();

        List<List<String>> rows = new List<List<String>>();
        for (Integer i = 0; i < punches.size(); i++) {
            Attendance_Punch__c punch = punches[i];
            Boolean isIn = AttendanceRollupService.isCheckInType(punch.Punch_Type__c);
            rows.add(new List<String>{
                punch.Punch_DateTime__c.format('HH:mm', zone),
                isIn ? 'Clock in' : 'Clock out',
                day.breakBefore.containsKey(i)
                    ? 'after ' + AttendanceRollupService.minutesText(day.breakBefore.get(i))
                    : '',
                punch.Source__c == null ? '' : punch.Source__c
            });
        }

        List<Object> blocks = new List<Object>{
            SlackBlocks.header('Today\'s attendance'),
            SlackBlocks.table(
                new List<String>{ 'Time', 'What', 'Break', 'Via' }, rows, 20
            ),
            SlackBlocks.fields(
                new List<String>{ 'Worked', 'Break', 'Status' },
                new List<String>{
                    hours(day.workedMinutes) + ' of ' +
                        AttendanceRollupService.minimumEffectiveHours() + 'h',
                    AttendanceRollupService.minutesText(day.breakMinutes) + ' of ' +
                        AttendanceRollupService.minutesText(AttendanceRollupService.breakAllowanceMinutes()),
                    day.onTheClock ? 'On the clock' : 'Clocked out'
                }
            ),
            SlackBlocks.context(
                'Break is the time between a clock-out and your next clock-in.'
            )
        };
        return SlackBlocks.ephemeral('Today\'s attendance', blocks);
    }

    private static List<Attendance_Punch__c> todaysPunches(Id employeeId) {
        Date today = AttendanceRollupService.businessDateOf(System.now());
        return [
            SELECT Id, Punch_DateTime__c, Punch_Type__c, Source__c
            FROM Attendance_Punch__c
            WHERE Employee__c = :employeeId
              AND DAY_ONLY(convertTimezone(Punch_DateTime__c)) = :today
            ORDER BY Punch_DateTime__c ASC
            LIMIT 100
        ];
    }

    /** What a day adds up to. */
    private class Day {
        Integer workedMinutes = 0;
        Integer breakMinutes = 0;
        Integer lastBreakMinutes = 0;
        Boolean onTheClock = false;
        Map<Integer, Integer> breakBefore = new Map<Integer, Integer>();
    }

    /**
     * Walks the punches in order, summing worked stretches and the gaps between
     * them. Summing the stretches rather than subtracting break from the span is
     * deliberate: partway through a day the two disagree, because a break can run
     * past the last clock-out.
     */
    private static Day summarise(List<Attendance_Punch__c> punches) {
        Day day = new Day();
        DateTime openWork;
        DateTime openBreak;
        Boolean seenCheckIn = false;

        for (Integer i = 0; i < punches.size(); i++) {
            Attendance_Punch__c punch = punches[i];
            DateTime stamp = punch.Punch_DateTime__c;

            if (AttendanceRollupService.isCheckInType(punch.Punch_Type__c)) {
                seenCheckIn = true;
                if (openBreak != null && stamp > openBreak) {
                    Integer gap = minutesBetween(openBreak, stamp);
                    day.breakMinutes += gap;
                    day.lastBreakMinutes = gap;
                    day.breakBefore.put(i, gap);
                }
                openBreak = null;
                // Only the first check-in of a run opens the stretch, so a device
                // firing twice cannot shorten the time it credits.
                if (openWork == null) {
                    openWork = stamp;
                }
                day.onTheClock = true;
            } else {
                if (openWork != null && stamp > openWork) {
                    day.workedMinutes += minutesBetween(openWork, stamp);
                }
                openWork = null;
                // A stray clock-out before the first clock-in is not a break.
                if (openBreak == null && seenCheckIn) {
                    openBreak = stamp;
                }
                day.onTheClock = false;
            }
        }
        return day;
    }

    private static Integer minutesBetween(DateTime startedAt, DateTime endedAt) {
        // "from" and "to" are both reserved in Apex, from the SOQL clauses.
        return (Integer) ((endedAt.getTime() - startedAt.getTime()) / 60000);
    }

    /** Renders whole minutes as "8h 15m". */
    private static String hours(Integer minutes) {
        return AttendanceRollupService.minutesText(minutes);
    }
}
