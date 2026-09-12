/**
 * Applying for and cancelling leave from Slack.
 *
 * The validation matters more than the form. A request that is accepted and then
 * silently fails a balance check leaves the employee believing they have leave
 * booked, so everything that could refuse this is checked before the record is
 * written, and every refusal names the field at fault so the modal stays open
 * with the answer next to the question.
 *
 * Days are counted the way the policy counts them: weekends and public holidays
 * inside a range are not leave. A half day is half of one day and cannot span a
 * range, because there is no such thing as half of a Tuesday and half of a
 * Thursday on one request.
 */
public inherited sharing class SlackLeaveApply {

    public static final String APPLY_CALLBACK = 'hrms_apply_leave';
    public static final String CANCEL_CALLBACK = 'hrms_cancel_leave';

    /** How far ahead leave may be booked, so a typo in the year is caught. */
    private static final Integer MAX_DAYS_AHEAD = 400;

    // ---- the form --------------------------------------------------------

    public static Map<String, Object> applyModal(Employee__c employee) {
        List<SlackViewBuilder.Choice> types = SlackAdminData.leaveTypeChoices();
        if (types.isEmpty()) {
            return SlackViewBuilder.modal(APPLY_CALLBACK, 'Apply for leave', null, null,
                new List<Object>{
                    SlackBlocks.section(
                        'No leave types are configured yet, so there is nothing to apply for. ' +
                        'Ask HR to set them up.'
                    )
                }
            );
        }

        Date today = AttendanceRollupService.businessDateOf(System.now());
        List<Object> blocks = new List<Object>{
            SlackViewBuilder.input('leave_type', 'Leave type',
                SlackViewBuilder.selectInput(types, null)),
            SlackViewBuilder.input('from_date', 'From', SlackViewBuilder.datePicker(today)),
            SlackViewBuilder.input('to_date', 'To', SlackViewBuilder.datePicker(today)),
            SlackViewBuilder.input('half_day', 'Half day?',
                SlackViewBuilder.selectInput(new List<SlackViewBuilder.Choice>{
                    new SlackViewBuilder.Choice('No, a full day', 'no'),
                    new SlackViewBuilder.Choice('Yes, first half', 'First Half'),
                    new SlackViewBuilder.Choice('Yes, second half', 'Second Half')
                }, 'no'), true,
                'A half day covers one date only.'),
            SlackViewBuilder.input('reason', 'Reason',
                SlackViewBuilder.textInput('Family function', null, true), true, null)
        };

        blocks.add(SlackBlocks.context(balanceSummary(employee)));
        blocks.add(SlackBlocks.context(
            approverLine(employee) +
            '  ·  Weekends and public holidays inside the range are not counted.'
        ));

        return SlackViewBuilder.modal(APPLY_CALLBACK, 'Apply for leave', 'Submit', null, blocks);
    }

    private static String balanceSummary(Employee__c employee) {
        List<Leave_Balance__c> balances = SlackAdminData.balancesFor(employee.Id);
        if (balances.isEmpty()) {
            return '_No leave balance is allocated to you yet._';
        }
        List<String> parts = new List<String>();
        for (Leave_Balance__c row : balances) {
            parts.add(
                (row.Leave_Type__r == null ? 'Leave' : row.Leave_Type__r.Name) + ' ' +
                available(row).stripTrailingZeros().toPlainString()
            );
        }
        return 'You have left: ' + String.join(parts, '  ·  ');
    }

    private static String approverLine(Employee__c employee) {
        return employee.Reporting_Manager__c == null
            ? ':warning: You have no reporting manager, so this goes to HR'
            : 'Goes to your reporting manager';
    }

    // ---- the submission --------------------------------------------------

    /**
     * Validates and records a request.
     *
     * Runs inside the view_submission request, so it may query and write but must
     * not call out: the confirmation message is left to the worker.
     */
    public static SlackPeopleAdmin.Outcome submit(
        Map<String, String> values, Employee__c employee
    ) {
        Id leaveTypeId =
            SlackModalValues.asId(values.get('leave_type'), Leave_Type__c.SObjectType);
        if (leaveTypeId == null) {
            return fault('leave_type', 'Pick a leave type.');
        }

        Date fromDate = SlackModalValues.asDate(values.get('from_date'));
        Date toDate = SlackModalValues.asDate(values.get('to_date'));
        if (fromDate == null) {
            return fault('from_date', 'Pick a start date.');
        }
        if (toDate == null) {
            return fault('to_date', 'Pick an end date.');
        }
        if (toDate < fromDate) {
            return fault('to_date', 'The end date is before the start date.');
        }

        Date today = AttendanceRollupService.businessDateOf(System.now());
        if (fromDate.daysBetween(today) > MAX_DAYS_AHEAD) {
            return fault('from_date', 'That is more than a year in the past.');
        }
        if (today.daysBetween(fromDate) > MAX_DAYS_AHEAD) {
            return fault('from_date', 'That is more than a year ahead. Check the year.');
        }

        String halfDay = values.get('half_day') ?? 'no';
        Boolean isHalf = halfDay != 'no';
        if (isHalf && fromDate != toDate) {
            return fault('to_date', 'A half day covers one date, so both dates must match.');
        }

        List<Leave_Request__c> clashes =
            SlackAdminData.overlapping(employee.Id, fromDate, toDate);
        if (!clashes.isEmpty()) {
            Leave_Request__c clash = clashes[0];
            return fault('from_date',
                'You already have a ' + clash.Status__c.toLowerCase() + ' request covering ' +
                SlackBlocks.dateText(clash.From_Date__c) + ' to ' +
                SlackBlocks.dateText(clash.To_Date__c) + '.'
            );
        }

        Decimal days = countDays(fromDate, toDate, isHalf);
        if (days <= 0) {
            return fault('from_date',
                'Every day in that range is a weekend or a public holiday, so there is ' +
                'no leave to take.'
            );
        }

        SlackPeopleAdmin.Outcome balanceFault = checkBalance(employee, leaveTypeId, days);
        if (balanceFault != null) {
            return balanceFault;
        }

        Leave_Request__c request = new Leave_Request__c(
            Employee__c = employee.Id,
            Leave_Type__c = leaveTypeId,
            From_Date__c = fromDate,
            To_Date__c = toDate,
            Days__c = days,
            Half_Day__c = isHalf,
            Half_Day_Session__c = isHalf ? halfDay : null,
            Reason__c = values.get('reason'),
            Status__c = 'Submitted',
            Approver__c = employee.Reporting_Manager__c
        );
        try {
            insert request;
        } catch (DmlException e) {
            return SlackPeopleAdmin.outcomeFor(
                false, 'Salesforce refused that request: ' + e.getDmlMessage(0), null
            );
        }

        return SlackPeopleAdmin.outcomeFor(true, null, request.Id);
    }

    /**
     * Counts the days a request actually costs.
     *
     * Saturday and Sunday are not working days here and public holidays inside
     * the range are not leave, which is why this is not a plain daysBetween.
     */
    @TestVisible
    private static Decimal countDays(Date fromDate, Date toDate, Boolean isHalf) {
        if (isHalf) {
            // The single date still has to be a working day to cost anything.
            return isWorkingDay(fromDate, SlackAdminData.holidaysBetween(fromDate, toDate))
                ? 0.5 : 0;
        }
        Set<Date> holidays = SlackAdminData.holidaysBetween(fromDate, toDate);
        Integer count = 0;
        Date cursor = fromDate;
        // Bounded by the year-ahead check above, so this cannot run away.
        while (cursor <= toDate) {
            if (isWorkingDay(cursor, holidays)) {
                count++;
            }
            cursor = cursor.addDays(1);
        }
        return count;
    }

    private static Boolean isWorkingDay(Date day, Set<Date> holidays) {
        if (holidays.contains(day)) {
            return false;
        }
        // Apex has no day-of-week accessor on Date, and format() would use the
        // running user's zone, so the day is named from a GMT instant instead.
        String weekday = DateTime.newInstanceGmt(day, Time.newInstance(12, 0, 0, 0))
            .formatGmt('EEE');
        return weekday != 'Sat' && weekday != 'Sun';
    }

    /**
     * Refuses a request the person cannot afford.
     *
     * A type with no balance row at all is allowed through rather than refused:
     * unpaid and newly configured types legitimately have none, and refusing
     * would block leave nobody has decided to limit.
     */
    private static SlackPeopleAdmin.Outcome checkBalance(Employee__c employee, Id leaveTypeId, Decimal days) {
        for (Leave_Balance__c row : SlackAdminData.balancesFor(employee.Id)) {
            if (row.Leave_Type__c != leaveTypeId) {
                continue;
            }
            Decimal left = available(row);
            if (days > left) {
                return fault('leave_type',
                    'That is ' + days.stripTrailingZeros().toPlainString() + ' days, and you ' +
                    'have ' + left.stripTrailingZeros().toPlainString() + ' left.'
                );
            }
            return null;
        }
        return null;
    }

    private static Decimal available(Leave_Balance__c row) {
        if (row.Closing_Balance__c != null) {
            return row.Closing_Balance__c;
        }
        return (row.Opening_Balance__c ?? 0) + (row.Accrued__c ?? 0) - (row.Availed__c ?? 0);
    }

    // ---- cancelling ------------------------------------------------------

    /**
     * Withdraws a request.
     *
     * Only the person who made it, and only while it is still theirs to take
     * back. An approved request already counted against the balance, so
     * cancelling it is a decision for the approver rather than a withdrawal.
     */
    public static SlackPeopleAdmin.Outcome cancel(Id requestId, Employee__c employee) {
        List<Leave_Request__c> found = [
            SELECT Id, Employee__c, Status__c, From_Date__c, To_Date__c, Leave_Type__r.Name
            FROM Leave_Request__c WHERE Id = :requestId LIMIT 1
        ];
        if (found.isEmpty()) {
            return SlackPeopleAdmin.outcomeFor(false, 'That request no longer exists.', null);
        }
        Leave_Request__c request = found[0];
        if (request.Employee__c != employee.Id) {
            return SlackPeopleAdmin.outcomeFor(
                false, 'That is not your request to cancel.', null
            );
        }
        if (request.Status__c != 'Submitted') {
            return SlackPeopleAdmin.outcomeFor(
                false,
                'That request is already ' + request.Status__c.toLowerCase() +
                '. Ask your approver to reverse it.',
                null
            );
        }

        try {
            update new Leave_Request__c(
                Id = requestId,
                Status__c = 'Cancelled',
                Cancelled_On__c = AttendanceRollupService.businessDateOf(System.now()),
                Cancellation_Reason__c = 'Withdrawn by the employee from Slack'
            );
        } catch (DmlException e) {
            return SlackPeopleAdmin.outcomeFor(
                false, 'Salesforce refused that: ' + e.getDmlMessage(0), null
            );
        }

        return SlackPeopleAdmin.outcomeFor(true,
            ':white_check_mark: Cancelled your ' +
            (request.Leave_Type__r == null ? 'leave' : request.Leave_Type__r.Name) +
            ' for ' + SlackBlocks.dateText(request.From_Date__c) + ' to ' +
            SlackBlocks.dateText(request.To_Date__c) + '.',
            requestId
        );
    }

    /** The reader's own requests, each cancellable while it is still pending. */
    public static List<Object> myRequests(Employee__c employee) {
        List<Leave_Request__c> requests = SlackAdminData.requestsFor(employee.Id);
        if (requests.isEmpty()) {
            return new List<Object>{
                SlackBlocks.section('You have no leave requests yet.'),
                SlackBlocks.actions(new List<Object>{
                    SlackBlocks.button('Apply for leave', 'hrms_apply_leave', 'new', 'primary')
                })
            };
        }

        List<Object> blocks = new List<Object>{ SlackBlocks.header('Your leave requests') };
        List<List<String>> rows = new List<List<String>>();
        for (Leave_Request__c request : requests) {
            rows.add(new List<String>{
                request.Leave_Type__r == null ? 'Leave' : request.Leave_Type__r.Name,
                SlackBlocks.dateText(request.From_Date__c) + ' to ' +
                    SlackBlocks.dateText(request.To_Date__c),
                String.valueOf(request.Days__c ?? 0),
                request.Status__c
            });
        }
        blocks.add(SlackBlocks.table(
            new List<String>{ 'Type', 'Dates', 'Days', 'Status' }, rows, 15
        ));

        // Only what is still pending can be withdrawn, and a row of buttons holds
        // five, so the nearest few get one.
        List<Object> buttons = new List<Object>{
            SlackBlocks.button('Apply for leave', 'hrms_apply_leave', 'new', 'primary')
        };
        for (Leave_Request__c request : requests) {
            if (request.Status__c != 'Submitted' || buttons.size() >= 5) {
                continue;
            }
            buttons.add(SlackBlocks.button(
                'Cancel ' + SlackBlocks.dateText(request.From_Date__c).substring(5),
                'hrms_cancel_leave', request.Id, 'danger'
            ));
        }
        blocks.add(SlackBlocks.actions(buttons));
        return blocks;
    }

    // ---- shared ----------------------------------------------------------

    private static SlackPeopleAdmin.Outcome fault(String blockId, String message) {
        return SlackPeopleAdmin.faultFor(blockId, message);
    }
}
