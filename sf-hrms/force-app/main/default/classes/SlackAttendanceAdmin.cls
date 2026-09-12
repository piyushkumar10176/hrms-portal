/**
 * Attendance seen and corrected from Slack.
 *
 * Read and correct, not bulk edit. Slack has no data grid, so anything meaning
 * work across many rows at once belongs in the Salesforce console. What is here
 * is what an administrator actually does day to day: look at one person's day,
 * see who is in, and add a punch somebody forgot.
 *
 * Punches are the record and the day is derived from them, so a correction here
 * writes a punch and lets the rollup recalculate the hours, the break and any
 * flag. Nothing writes to Attendance__c directly.
 */
public inherited sharing class SlackAttendanceAdmin {

    public static final String ADD_PUNCH_CALLBACK = 'hrms_add_punch';
    public static final String PICK_CALLBACK = 'hrms_pick_attendance';

    /** Adding a punch by hand is marked so a corrected day can be told apart. */
    private static final String MANUAL_SOURCE = 'Manual';

    // ---- one person, one day ---------------------------------------------

    public static List<Object> personDay(Id employeeId, Date businessDate, Employee__c actor) {
        if (!SlackAuthz.canSeeAttendanceOf(actor, employeeId)) {
            return new List<Object>{
                SlackBlocks.section('You can only look at your own attendance.')
            };
        }
        Employee__c employee = SlackAdminData.employee(employeeId);
        if (employee == null) {
            return new List<Object>{ SlackBlocks.section('That employee no longer exists.') };
        }

        List<Attendance_Punch__c> punches = SlackAdminData.punchesOn(employeeId, businessDate);
        Attendance__c day = SlackAdminData.attendanceOn(employeeId, businessDate);
        String zone = AttendanceRollupService.businessTimeZoneName();

        List<Object> blocks = new List<Object>{
            SlackBlocks.header(employee.Name + ' · ' + SlackBlocks.dateText(businessDate))
        };

        if (punches.isEmpty()) {
            blocks.add(SlackBlocks.section('_No punches recorded on that day._'));
        } else {
            List<List<String>> rows = new List<List<String>>();
            DateTime lastOut = null;
            for (Attendance_Punch__c punch : punches) {
                Boolean checkIn = AttendanceRollupService.isCheckInType(punch.Punch_Type__c);
                String gap = '';
                if (checkIn && lastOut != null) {
                    Decimal minutes =
                        (punch.Punch_DateTime__c.getTime() - lastOut.getTime()) / 60000.0;
                    gap = AttendanceRollupService.minutesText(minutes.setScale(0));
                }
                rows.add(new List<String>{
                    punch.Punch_DateTime__c.format('HH:mm', zone),
                    checkIn ? 'Clock in' : 'Clock out',
                    gap,
                    punch.Source__c ?? ''
                });
                lastOut = checkIn ? null : punch.Punch_DateTime__c;
            }
            blocks.add(SlackBlocks.table(
                new List<String>{ 'Time', 'What', 'After a break of', 'Via' }, rows, 20
            ));

            Boolean onTheClock = AttendanceRollupService.isCheckInType(
                punches[punches.size() - 1].Punch_Type__c
            );
            blocks.add(SlackBlocks.fields(
                new List<String>{ 'Worked', 'Break', 'On premises', 'Status' },
                new List<String>{
                    day == null || day.Total_Hours__c == null
                        ? '—' : day.Total_Hours__c + 'h',
                    day == null ? '—' : AttendanceRollupService.minutesText(day.Break_Minutes__c),
                    day == null || day.Gross_Hours__c == null
                        ? '—' : day.Gross_Hours__c + 'h',
                    onTheClock ? 'Still on the clock' : 'Clocked out'
                }
            ));
            if (day != null && day.Penalty__c == true) {
                blocks.add(SlackBlocks.context(
                    ':warning: ' + SlackBlocks.escape(day.Penalty_Reason__c ?? 'Flagged.')
                ));
            }
        }

        if (SlackAuthz.canManageEmployees(actor)) {
            blocks.add(SlackBlocks.actions(new List<Object>{
                SlackBlocks.button(
                    'Add a missing punch', ADD_PUNCH_CALLBACK,
                    employeeId + '|' + SlackBlocks.dateText(businessDate), null
                )
            }));
        }
        blocks.add(SlackBlocks.context(
            'Punches are the record. The day above is derived from them, so correcting a ' +
            'punch corrects the day and clears any flag on it.'
        ));
        return blocks;
    }

    // ---- one person, this month ------------------------------------------

    public static List<Object> personMonth(Id employeeId, Employee__c actor) {
        if (!SlackAuthz.canSeeAttendanceOf(actor, employeeId)) {
            return new List<Object>{
                SlackBlocks.section('You can only look at your own attendance.')
            };
        }
        Employee__c employee = SlackAdminData.employee(employeeId);
        if (employee == null) {
            return new List<Object>{ SlackBlocks.section('That employee no longer exists.') };
        }

        Date today = AttendanceRollupService.businessDateOf(System.now());
        List<Attendance__c> rows =
            SlackAdminData.attendanceBetween(employeeId, today.toStartOfMonth(), today);
        if (rows.isEmpty()) {
            return new List<Object>{
                SlackBlocks.section(
                    'No attendance recorded for *' + SlackBlocks.escape(employee.Name) +
                    '* this month.'
                )
            };
        }

        String zone = AttendanceRollupService.businessTimeZoneName();
        List<List<String>> table = new List<List<String>>();
        Integer flagged = 0;
        String firstReason = null;
        for (Attendance__c row : rows) {
            if (row.Penalty__c == true) {
                flagged++;
                if (firstReason == null) {
                    firstReason = row.Penalty_Reason__c;
                }
            }
            table.add(new List<String>{
                SlackBlocks.dateText(row.Date__c).substring(5),
                row.Check_In__c == null ? '—' : row.Check_In__c.format('HH:mm', zone),
                row.Check_Out__c == null ? '—' : row.Check_Out__c.format('HH:mm', zone),
                AttendanceRollupService.minutesText(row.Break_Minutes__c),
                row.Total_Hours__c == null ? '—' : row.Total_Hours__c + 'h',
                (row.Penalty__c == true ? '! ' : '') + (row.Status__c ?? '')
            });
        }

        return new List<Object>{
            SlackBlocks.header(employee.Name + ' · this month'),
            SlackBlocks.table(
                new List<String>{ 'Date', 'In', 'Out', 'Break', 'Worked', 'Status' }, table, 25
            ),
            SlackBlocks.context(
                flagged > 0
                    ? ':warning: ' + flagged + ' day' + (flagged == 1 ? '' : 's') +
                      ' flagged. Most recent: ' + SlackBlocks.escape(firstReason ?? '')
                    : ':white_check_mark: No days flagged this month.'
            )
        };
    }

    // ---- the whole company today -----------------------------------------

    public static List<Object> todayAcrossCompany(Employee__c actor) {
        if (!SlackAuthz.canSeeCompanyWideData(actor)) {
            return new List<Object>{
                SlackBlocks.section('Only HR and administrators can see company-wide attendance.')
            };
        }
        Date today = AttendanceRollupService.businessDateOf(System.now());
        List<Attendance__c> rows = SlackAdminData.attendanceAcrossCompany(today);
        if (rows.isEmpty()) {
            return new List<Object>{ SlackBlocks.section('Nobody has clocked in yet today.') };
        }

        String zone = AttendanceRollupService.businessTimeZoneName();
        List<List<String>> table = new List<List<String>>();
        for (Attendance__c row : rows) {
            table.add(new List<String>{
                row.Employee__r == null ? 'Unknown' : row.Employee__r.Name,
                row.Check_In__c == null ? '—' : row.Check_In__c.format('HH:mm', zone),
                row.Check_Out__c == null ? '—' : row.Check_Out__c.format('HH:mm', zone),
                row.Total_Hours__c == null ? '—' : row.Total_Hours__c + 'h',
                (row.Penalty__c == true ? '! ' : '') + (row.Status__c ?? '')
            });
        }
        return new List<Object>{
            SlackBlocks.header('Attendance · ' + SlackBlocks.dateText(today)),
            SlackBlocks.table(
                new List<String>{ 'Name', 'In', 'Out', 'Worked', 'Status' }, table, 30
            ),
            SlackBlocks.context(
                rows.size() + ' people have attendance recorded today.'
            )
        };
    }

    // ---- modals ----------------------------------------------------------

    public static Map<String, Object> addPunchModal(Employee__c employee, Date businessDate) {
        String metadata = employee.Id + '|' + SlackBlocks.dateText(businessDate);
        return SlackViewBuilder.modal(ADD_PUNCH_CALLBACK, 'Add a punch', 'Add', metadata,
            new List<Object>{
                SlackBlocks.section(
                    'Adding a punch for *' + SlackBlocks.escape(employee.Name) + '* on *' +
                    SlackBlocks.dateText(businessDate) + '*.'
                ),
                SlackViewBuilder.input('punch_type', 'Clock in or out',
                    SlackViewBuilder.selectInput(new List<SlackViewBuilder.Choice>{
                        new SlackViewBuilder.Choice('Clock in', 'Check-In'),
                        new SlackViewBuilder.Choice('Clock out', 'Check-Out')
                    }, null)
                ),
                SlackViewBuilder.input('punch_time', 'Time', SlackViewBuilder.timePicker(null)),
                SlackBlocks.context(
                    'The day is recalculated from the punches, so hours, break and any ' +
                    'flag update themselves once this is added.'
                )
            }
        );
    }

    /** Whose attendance, and which day. */
    public static Map<String, Object> pickerModal() {
        List<SlackViewBuilder.Choice> people = SlackAdminData.employeeChoices();
        List<Object> blocks = new List<Object>{
            SlackViewBuilder.input('employee', 'Employee',
                SlackViewBuilder.selectInput(people, null)),
            SlackViewBuilder.input('day', 'Day', SlackViewBuilder.datePicker(null), true,
                'Leave blank for this month\'s summary.')
        };
        if (SlackAdminData.moreEmployeesThanFit()) {
            blocks.add(SlackBlocks.context(
                '_Showing the first ' + SlackAdminData.OPTION_LIMIT +
                ' people. Use Find an employee for anybody else._'
            ));
        }
        return SlackViewBuilder.modal(PICK_CALLBACK, 'Whose attendance?', 'Show', null, blocks);
    }

    // ---- the correction itself -------------------------------------------

    /**
     * Writes a corrective punch.
     *
     * The picker gives wall-clock time in the business zone and Salesforce wants
     * an instant, so the offset is applied rather than the string being parsed as
     * if it were already UTC.
     */
    public static SlackPeopleAdmin.Outcome addPunch(
        Id employeeId, Date businessDate, Map<String, String> values, Employee__c actor
    ) {
        if (!SlackAuthz.canManageEmployees(actor)) {
            return outcome(false, 'Only an administrator can correct attendance.', null);
        }
        Employee__c employee = SlackAdminData.employee(employeeId);
        if (employee == null || businessDate == null) {
            return outcome(false, 'That employee or day could not be identified.', null);
        }

        String clock = values.get('punch_time');
        String punchType = values.get('punch_type');
        if (String.isBlank(clock) || String.isBlank(punchType)) {
            return outcome(false, 'A time and a direction are both needed.', null);
        }
        if (punchType != 'Check-In' && punchType != 'Check-Out') {
            return outcome(false, 'That is not a direction I recognise.', null);
        }
        if (!Pattern.matches('\\d{2}:\\d{2}', clock)) {
            return outcome(false, 'That time could not be read.', null);
        }

        try {
            insert new Attendance_Punch__c(
                Employee__c = employeeId,
                Punch_DateTime__c = instantOf(businessDate, clock),
                Punch_Type__c = punchType,
                Source__c = MANUAL_SOURCE,
                Adjusted_By__c = actor.Id,
                Adjustment_Reason__c = 'Added from Slack by ' + actor.Name
            );
        } catch (DmlException e) {
            return outcome(false, 'Salesforce refused that punch: ' + e.getDmlMessage(0), null);
        }

        return outcome(true,
            ':white_check_mark: ' + (punchType == 'Check-In' ? 'Clock in' : 'Clock out') +
            ' added at ' + clock + ' on ' + SlackBlocks.dateText(businessDate) +
            ' for ' + SlackBlocks.escape(employee.Name) + '. The day has been recalculated.',
            employeeId
        );
    }

    // ---- clocking in and out from the Home tab ---------------------------

    /**
     * Punches for the reader themselves.
     *
     * The sequence rules are applied here rather than left to the database,
     * because two clock-ins in a row produce a day that reads as a single
     * unbroken stretch and nobody notices until payroll. Refusing is kinder.
     *
     * Recorded with a source of Slack so AttendancePunchSlackNotifier stays
     * quiet: the Home tab redraw and the confirmation below already say it
     * happened, and a third message is noise.
     */
    public static SlackPeopleAdmin.Outcome clock(Employee__c employee, Boolean clockingIn) {
        Date today = AttendanceRollupService.businessDateOf(System.now());
        List<Attendance_Punch__c> punches = SlackAdminData.punchesOn(employee.Id, today);
        Boolean onTheClock = !punches.isEmpty()
            && AttendanceRollupService.isCheckInType(punches[punches.size() - 1].Punch_Type__c);

        if (clockingIn && onTheClock) {
            return outcome(false, 'You are already clocked in.', null);
        }
        if (!clockingIn && !onTheClock) {
            return outcome(false,
                punches.isEmpty() ? 'You have not clocked in today.' : 'You are already clocked out.',
                null
            );
        }

        DateTime now = System.now();
        try {
            insert new Attendance_Punch__c(
                Employee__c = employee.Id,
                Punch_DateTime__c = now,
                Punch_Type__c = clockingIn ? 'Check-In' : 'Check-Out',
                Source__c = 'Slack'
            );
        } catch (DmlException e) {
            return outcome(false, 'Salesforce refused that punch: ' + e.getDmlMessage(0), null);
        }

        String zone = AttendanceRollupService.businessTimeZoneName();
        String at = now.format('HH:mm', zone);
        if (clockingIn) {
            Decimal breakMinutes = punches.isEmpty()
                ? null
                : ((now.getTime() - punches[punches.size() - 1].Punch_DateTime__c.getTime())
                    / 60000.0).setScale(0);
            return outcome(true,
                breakMinutes == null
                    ? 'Clocked in at ' + at + '.'
                    : 'Clocked in at ' + at + ' after a ' +
                      AttendanceRollupService.minutesText(breakMinutes) + ' break.',
                null
            );
        }
        // The rollup recalculates the day from the punch just written, so the
        // totals are read back rather than computed again here.
        Attendance__c day = SlackAdminData.attendanceOn(employee.Id, today);
        return outcome(true,
            'Clocked out at ' + at + '.' +
            (day == null || day.Total_Hours__c == null
                ? ''
                : ' ' + day.Total_Hours__c + 'h worked' +
                  ((day.Break_Minutes__c ?? 0) > 0
                      ? ', ' + AttendanceRollupService.minutesText(day.Break_Minutes__c) + ' break.'
                      : '.')),
            null
        );
    }

    /**
     * The wall-clock time a picker gave, as the instant it names.
     *
     * DateTime.newInstance reads a time in whatever zone the running user has,
     * and the guest user this executes as is not the office. The business zone is
     * applied explicitly so a punch added from Slack lands on the same day the
     * biometric machine would have put it.
     */
    @TestVisible
    private static DateTime instantOf(Date businessDate, String hhmm) {
        DateTime asIfUtc = DateTime.newInstanceGmt(
            businessDate,
            Time.newInstance(
                Integer.valueOf(hhmm.substring(0, 2)),
                Integer.valueOf(hhmm.substring(3, 5)), 0, 0
            )
        );
        Integer offsetMs =
            TimeZone.getTimeZone(AttendanceRollupService.businessTimeZoneName())
                .getOffset(asIfUtc);
        return asIfUtc.addSeconds(-offsetMs / 1000);
    }

    /** Outcome has no public constructor, so the people admin's factory is used. */
    private static SlackPeopleAdmin.Outcome outcome(Boolean ok, String message, Id recordId) {
        return SlackPeopleAdmin.outcomeFor(ok, message, recordId);
    }

    /**
     * Splits the "employeeId|yyyy-MM-dd" both the button value and the modal
     * metadata carry. Both come back through the client, so neither is trusted.
     */
    public static Id employeeIn(String packed) {
        if (String.isBlank(packed)) {
            return null;
        }
        return SlackModalValues.asId(packed.split('\\|')[0], Employee__c.SObjectType);
    }

    public static Date dateIn(String packed) {
        if (String.isBlank(packed) || !packed.contains('|')) {
            return AttendanceRollupService.businessDateOf(System.now());
        }
        Date parsed = SlackModalValues.asDate(packed.substringAfter('|'));
        return parsed ?? AttendanceRollupService.businessDateOf(System.now());
    }
}
