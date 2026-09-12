/**
 * Approvals and the HR dashboard.
 *
 * Who may decide what comes from one place: the named approver may, HR and
 * admin may decide anything so cover is never blocked by somebody being away,
 * and nobody may decide their own request. That last rule has no exception,
 * including for HR.
 */
public inherited sharing class SlackApprovalsCommand {

    /** `/approvals`: everything waiting on this person. */
    public static String pending(Employee__c employee) {
        Boolean companyWide = SlackEmployeeLookup.isHrOrAdmin(employee);

        List<Leave_Request__c> requests = companyWide
            ? [SELECT Id, Name, Employee__c, Employee__r.Name, Leave_Type__r.Name,
                      From_Date__c, To_Date__c, Days__c, Half_Day__c, Reason__c
               FROM Leave_Request__c WHERE Status__c = 'Submitted'
               ORDER BY From_Date__c LIMIT 50]
            : [SELECT Id, Name, Employee__c, Employee__r.Name, Leave_Type__r.Name,
                      From_Date__c, To_Date__c, Days__c, Half_Day__c, Reason__c
               FROM Leave_Request__c
               WHERE Status__c = 'Submitted' AND Approver__c = :employee.Id
               ORDER BY From_Date__c LIMIT 50];

        // Nobody decides their own, so showing it here would be a dead end.
        List<Leave_Request__c> decidable = new List<Leave_Request__c>();
        for (Leave_Request__c request : requests) {
            if (request.Employee__c != employee.Id) {
                decidable.add(request);
            }
        }

        if (decidable.isEmpty()) {
            return SlackBlocks.ephemeral(':white_check_mark: Nothing is waiting on you.');
        }

        List<Object> blocks = new List<Object>{
            SlackBlocks.header('Waiting on you · ' + decidable.size())
        };

        // Each request gets its own block with buttons, capped well inside the
        // 50 block ceiling since every request costs two.
        Integer shown = Math.min(decidable.size(), 8);
        for (Integer i = 0; i < shown; i++) {
            Leave_Request__c request = decidable[i];
            blocks.add(SlackBlocks.section(
                '*' + SlackBlocks.escape(
                    request.Employee__r == null ? 'Unknown' : request.Employee__r.Name
                ) + '*\n' +
                (request.Leave_Type__r == null ? 'Leave' : request.Leave_Type__r.Name) +
                '  ·  ' + request.From_Date__c + ' to ' + request.To_Date__c +
                '  ·  ' + request.Days__c + (request.Half_Day__c == true ? ' (half day)' : '') +
                (String.isBlank(request.Reason__c)
                    ? ''
                    : '\n_' + SlackBlocks.escape(request.Reason__c) + '_')
            ));
            blocks.add(SlackBlocks.actions(new List<Object>{
                SlackBlocks.button('Approve', 'approve_leave', request.Id, 'primary'),
                SlackBlocks.button('Reject', 'reject_leave', request.Id, 'danger')
            }));
        }
        if (decidable.size() > shown) {
            blocks.add(SlackBlocks.context(
                '_' + (decidable.size() - shown) + ' more not shown. Decide these first._'
            ));
        }

        return SlackBlocks.ephemeral('Waiting on you', blocks);
    }

    /** `/hrdash`: the company view. HR and admin only. */
    public static String dashboard(Employee__c employee) {
        if (!SlackEmployeeLookup.isHrOrAdmin(employee)) {
            return SlackBlocks.ephemeral('That dashboard is for HR and administrators.');
        }

        Date today = AttendanceRollupService.businessDateOf(System.now());
        Date monthStart = today.toStartOfMonth();

        Integer headcount = [
            SELECT COUNT() FROM Employee__c WHERE Employee_Status__c = 'Active'
        ];
        Integer awaiting = [
            SELECT COUNT() FROM Leave_Request__c WHERE Status__c = 'Submitted'
        ];
        Integer onLeave = [
            SELECT COUNT() FROM Leave_Request__c
            WHERE Status__c = 'Approved' AND From_Date__c <= :today AND To_Date__c >= :today
        ];
        Integer clockedIn = [
            SELECT COUNT() FROM Attendance__c WHERE Date__c = :today
        ];
        Integer flagged = [
            SELECT COUNT() FROM Attendance__c
            WHERE Penalty__c = true AND Date__c >= :monthStart AND Date__c <= :today
        ];
        Integer unlinked = [
            SELECT COUNT() FROM Employee__c
            WHERE Employee_Status__c = 'Active' AND Slack_User_Id__c = NULL
        ];

        List<Object> blocks = new List<Object>{
            SlackBlocks.header('HR dashboard · ' + SlackBlocks.dateText(today)),
            SlackBlocks.fields(
                new List<String>{
                    'Active employees', 'Awaiting a decision', 'On leave today',
                    'Attendance today', 'Flagged this month', 'Not linked to Slack'
                },
                new List<String>{
                    String.valueOf(headcount),
                    String.valueOf(awaiting),
                    String.valueOf(onLeave),
                    clockedIn + ' of ' + headcount,
                    String.valueOf(flagged),
                    String.valueOf(unlinked)
                }
            )
        };

        if (unlinked > 0) {
            blocks.add(SlackBlocks.context(
                ':warning: ' + unlinked + ' active ' + (unlinked == 1 ? 'employee is' : 'employees are') +
                ' not linked to a Slack account, so they receive nothing at all.'
            ));
        }
        blocks.add(SlackBlocks.context('Served by Salesforce directly.'));

        return SlackBlocks.ephemeral('HR dashboard', blocks);
    }

    /** `/regularize`: the monthly allowance and which days could use one. */
    public static String regularize(Employee__c employee) {
        Date today = AttendanceRollupService.businessDateOf(System.now());
        Date monthStart = today.toStartOfMonth();

        Integer allowance = allowancePerMonth();
        Integer used = [
            SELECT COUNT() FROM Regularization_Request__c
            WHERE Employee__c = :employee.Id
              AND CreatedDate >= :DateTime.newInstance(monthStart, Time.newInstance(0, 0, 0, 0))
        ];

        List<Attendance__c> flagged = [
            SELECT Date__c, Penalty_Reason__c FROM Attendance__c
            WHERE Employee__c = :employee.Id
              AND Penalty__c = true
              AND Date__c >= :monthStart AND Date__c <= :today
            ORDER BY Date__c DESC LIMIT 10
        ];

        List<Object> blocks = new List<Object>{
            SlackBlocks.header('Attendance regularization'),
            SlackBlocks.section(
                'You have used *' + used + '* of *' + allowance + '* this month.' +
                (used >= allowance
                    ? '\n:warning: That is the whole allowance. A rejected request still counts.'
                    : '')
            )
        };

        if (flagged.isEmpty()) {
            blocks.add(SlackBlocks.context('No days are flagged this month.'));
        } else {
            List<List<String>> rows = new List<List<String>>();
            for (Attendance__c day : flagged) {
                rows.add(new List<String>{
                    SlackBlocks.dateText(day.Date__c),
                    day.Penalty_Reason__c == null ? '' : day.Penalty_Reason__c
                });
            }
            blocks.add(SlackBlocks.table(new List<String>{ 'Day', 'Why' }, rows, 10));
            blocks.add(SlackBlocks.context(
                'Correcting the punches on a day clears its flag by itself. ' +
                'Ask an administrator to add a missing punch.'
            ));
        }

        return SlackBlocks.ephemeral('Regularization', blocks);
    }

    /** Configurable by Custom Label rather than hardcoded. */
    private static Integer allowancePerMonth() {
        try {
            return Integer.valueOf(Label.HRMS_Regularizations_Per_Month.trim());
        } catch (Exception e) {
            return 3;
        }
    }
}
