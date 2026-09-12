/**
 * The App Home tab.
 *
 * Commands need remembering; a Home tab does not. Open the app and today's
 * state is already there with buttons on it, which is the difference between a
 * chat bot and something that feels like a product.
 *
 * Role-aware and additive: an employee sees their own day, a manager adds what
 * is waiting on them, HR and admin add the company. Nobody is shown a section
 * they have no business seeing.
 */
public with sharing class SlackHomeView {

    /** Builds the whole view for one person. */
    public static List<Object> build(Employee__c employee) {
        List<Object> blocks = new List<Object>();

        blocks.add(SlackBlocks.section(
            greeting() + ', *' + SlackBlocks.escape(firstName(employee)) + '*  ·  ' + todayLabel()
        ));
        blocks.add(SlackBlocks.divider());
        blocks.addAll(attendanceSection(employee));
        blocks.add(SlackBlocks.divider());
        blocks.addAll(leaveSection(employee));
        blocks.addAll(approvalsSection(employee));
        blocks.addAll(outTodaySection());
        blocks.addAll(companySection(employee));
        blocks.add(SlackBlocks.divider());
        blocks.add(SlackBlocks.context(new List<String>{
            'Commands still work: `/myleave`  `/attendance`  `/approvals`  `/whosout`  `/regularize`',
            '_Served by Salesforce directly. Refreshes each time you open this tab._'
        }));

        // A Home view caps at 100 blocks and Slack drops the overflow silently.
        return SlackBlocks.capped(blocks, SlackBlocks.MAX_VIEW_BLOCKS,
            '_Some sections were hidden to fit._');
    }

    /** Shown to a Slack account with no matching employee record. */
    public static List<Object> buildUnlinked() {
        return new List<Object>{
            SlackBlocks.header('CloudSheer HRMS'),
            SlackBlocks.section(
                'Your Slack account is not linked to an employee record yet, so there is ' +
                'nothing to show here.'
            ),
            SlackBlocks.context(
                'Ask HR to link it. Linking matches on your work email address.'
            )
        };
    }

    // ---- sections --------------------------------------------------------

    private static List<Object> attendanceSection(Employee__c employee) {
        List<Object> blocks = new List<Object>();
        List<Attendance_Punch__c> punches = todaysPunches(employee.Id);

        if (punches.isEmpty()) {
            blocks.add(SlackBlocks.section('*Attendance*\nYou have not clocked in yet today.'));
            blocks.add(SlackBlocks.actions(new List<Object>{
                SlackBlocks.button('Clock in', 'home_clock_in', 'in', 'primary')
            }));
            return blocks;
        }

        Attendance__c day = derivedDay(employee.Id);
        Boolean onTheClock = AttendanceRollupService.isCheckInType(
            punches[punches.size() - 1].Punch_Type__c
        );
        String zone = AttendanceRollupService.businessTimeZoneName();

        blocks.add(SlackBlocks.section('*Attendance*\n' + (onTheClock
            ? 'On the clock since *' + punches[0].Punch_DateTime__c.format('HH:mm', zone) + '*'
            : 'Clocked out at *' +
              punches[punches.size() - 1].Punch_DateTime__c.format('HH:mm', zone) + '*')));

        if (day != null) {
            blocks.add(SlackBlocks.fields(
                new List<String>{ 'First clock-in', 'Last clock-out', 'Break', 'Worked' },
                new List<String>{
                    day.Check_In__c == null ? '' : day.Check_In__c.format('HH:mm', zone),
                    day.Check_Out__c == null ? '' : day.Check_Out__c.format('HH:mm', zone),
                    AttendanceRollupService.minutesText(day.Break_Minutes__c),
                    (day.Total_Hours__c == null ? '—' : String.valueOf(day.Total_Hours__c)) +
                        ' of ' + AttendanceRollupService.minimumEffectiveHours() + 'h'
                }
            ));
        }

        blocks.add(SlackBlocks.actions(new List<Object>{
            onTheClock
                ? SlackBlocks.button('Clock out', 'home_clock_out', 'out', 'danger')
                : SlackBlocks.button('Clock in', 'home_clock_in', 'in', 'primary'),
            SlackBlocks.button('Full log', 'home_view_punches', 'log', null)
        }));
        return blocks;
    }

    private static List<Object> leaveSection(Employee__c employee) {
        List<Object> blocks = new List<Object>{ SlackBlocks.section('*Leave*') };

        List<Leave_Balance__c> balances = [
            SELECT Leave_Type__r.Name, Opening_Balance__c, Accrued__c, Availed__c, Closing_Balance__c
            FROM Leave_Balance__c WHERE Employee__c = :employee.Id
            ORDER BY Leave_Type__r.Name LIMIT 6
        ];

        if (balances.isEmpty()) {
            blocks.add(SlackBlocks.context('_No leave types are allocated to you yet._'));
            return blocks;
        }

        List<String> labels = new List<String>();
        List<String> values = new List<String>();
        for (Leave_Balance__c row : balances) {
            Decimal left = available(row);
            labels.add(row.Leave_Type__r == null ? 'Leave' : row.Leave_Type__r.Name);
            values.add(left.stripTrailingZeros().toPlainString() +
                (left == 1 ? ' day left' : ' days left'));
        }
        blocks.add(SlackBlocks.fields(labels, values));
        blocks.add(SlackBlocks.context(
            'Use `/myleave` for the full picture. Applying from here arrives with the next release.'
        ));
        return blocks;
    }

    /** Only rendered for somebody who can actually decide something. */
    private static List<Object> approvalsSection(Employee__c employee) {
        Boolean companyWide = SlackEmployeeLookup.isHrOrAdmin(employee);
        Integer reports = [
            SELECT COUNT() FROM Employee__c
            WHERE Reporting_Manager__c = :employee.Id AND Employee_Status__c = 'Active'
        ];
        if (reports == 0 && !companyWide) {
            return new List<Object>();
        }

        List<Leave_Request__c> waiting = companyWide
            ? [SELECT Employee__c, Employee__r.Name, Leave_Type__r.Name, From_Date__c, To_Date__c, Days__c
               FROM Leave_Request__c WHERE Status__c = 'Submitted' ORDER BY From_Date__c LIMIT 20]
            : [SELECT Employee__c, Employee__r.Name, Leave_Type__r.Name, From_Date__c, To_Date__c, Days__c
               FROM Leave_Request__c WHERE Status__c = 'Submitted' AND Approver__c = :employee.Id
               ORDER BY From_Date__c LIMIT 20];

        List<List<String>> rows = new List<List<String>>();
        for (Leave_Request__c request : waiting) {
            // Nobody decides their own, so listing it here would be a dead end.
            if (request.Employee__c == employee.Id) {
                continue;
            }
            rows.add(new List<String>{
                request.Employee__r == null ? 'Unknown' : request.Employee__r.Name,
                request.Leave_Type__r == null ? 'Leave' : request.Leave_Type__r.Name,
                SlackBlocks.dateText(request.From_Date__c) + ' to ' +
                    SlackBlocks.dateText(request.To_Date__c),
                String.valueOf(request.Days__c)
            });
        }

        List<Object> blocks = new List<Object>{ SlackBlocks.divider() };
        if (rows.isEmpty()) {
            blocks.add(SlackBlocks.section('*Waiting on you*\n:white_check_mark: Nothing to approve.'));
            return blocks;
        }
        blocks.add(SlackBlocks.section('*Waiting on you* · ' + rows.size()));
        blocks.add(SlackBlocks.table(
            new List<String>{ 'Who', 'Type', 'Dates', 'Days' }, rows, 8
        ));
        blocks.add(SlackBlocks.actions(new List<Object>{
            SlackBlocks.button('Review and decide', 'home_open_approvals', 'open', 'primary')
        }));
        return blocks;
    }

    /** Useful to everybody, so not gated. */
    private static List<Object> outTodaySection() {
        Date today = AttendanceRollupService.businessDateOf(System.now());
        List<String> away = new List<String>();
        List<String> remote = new List<String>();

        for (Leave_Request__c request : [
            SELECT Employee__r.Name, Leave_Type__r.Name, Leave_Type__r.Code__c, Half_Day__c
            FROM Leave_Request__c
            WHERE Status__c = 'Approved' AND From_Date__c <= :today AND To_Date__c >= :today
            ORDER BY Employee__r.Name LIMIT 50
        ]) {
            String who = SlackBlocks.escape(
                request.Employee__r == null ? 'Unknown' : request.Employee__r.Name
            ) + (request.Half_Day__c == true ? ' (half day)' : '');
            if (isRemote(request.Leave_Type__r)) {
                remote.add(who);
            } else {
                away.add(who);
            }
        }

        if (away.isEmpty() && remote.isEmpty()) {
            return new List<Object>();
        }
        List<Object> blocks = new List<Object>{
            SlackBlocks.divider(), SlackBlocks.section('*Out today*')
        };
        if (!away.isEmpty()) {
            blocks.add(SlackBlocks.context(':palm_tree: ' + String.join(away, ', ')));
        }
        if (!remote.isEmpty()) {
            blocks.add(SlackBlocks.context(':house: Remote: ' + String.join(remote, ', ')));
        }
        return blocks;
    }

    /** HR and admin only. */
    private static List<Object> companySection(Employee__c employee) {
        if (!SlackEmployeeLookup.isHrOrAdmin(employee)) {
            return new List<Object>();
        }
        Date today = AttendanceRollupService.businessDateOf(System.now());
        Integer headcount = [SELECT COUNT() FROM Employee__c WHERE Employee_Status__c = 'Active'];
        Integer clockedIn = [SELECT COUNT() FROM Attendance__c WHERE Date__c = :today];
        Integer onLeave = [
            SELECT COUNT() FROM Leave_Request__c
            WHERE Status__c = 'Approved' AND From_Date__c <= :today AND To_Date__c >= :today
        ];
        Integer unlinked = [
            SELECT COUNT() FROM Employee__c
            WHERE Employee_Status__c = 'Active' AND Slack_User_Id__c = NULL
        ];

        List<Object> blocks = new List<Object>{
            SlackBlocks.divider(),
            SlackBlocks.header('Company today'),
            SlackBlocks.fields(
                new List<String>{ 'Active employees', 'Attendance today', 'On leave', 'Not linked to Slack' },
                new List<String>{
                    String.valueOf(headcount),
                    clockedIn + ' of ' + headcount,
                    String.valueOf(onLeave),
                    String.valueOf(unlinked)
                }
            )
        };
        if (unlinked > 0) {
            blocks.add(SlackBlocks.context(
                ':warning: ' + unlinked + ' active ' + (unlinked == 1 ? 'employee receives' : 'employees receive') +
                ' nothing, having no Slack account linked.'
            ));
        }
        return blocks;
    }

    // ---- helpers ---------------------------------------------------------

    private static String firstName(Employee__c employee) {
        if (String.isNotBlank(employee.First_Name__c)) {
            return employee.First_Name__c;
        }
        return employee.Name == null ? 'there' : employee.Name.split(' ')[0];
    }

    private static String greeting() {
        Integer hour = Integer.valueOf(
            System.now().format('HH', AttendanceRollupService.businessTimeZoneName())
        );
        if (hour < 12) return 'Good morning';
        if (hour < 17) return 'Good afternoon';
        return 'Good evening';
    }

    private static String todayLabel() {
        return System.now().format('EEEE d MMMM', AttendanceRollupService.businessTimeZoneName());
    }

    private static List<Attendance_Punch__c> todaysPunches(Id employeeId) {
        Date today = AttendanceRollupService.businessDateOf(System.now());
        return [
            SELECT Punch_DateTime__c, Punch_Type__c, Source__c
            FROM Attendance_Punch__c
            WHERE Employee__c = :employeeId
              AND DAY_ONLY(convertTimezone(Punch_DateTime__c)) = :today
            ORDER BY Punch_DateTime__c ASC LIMIT 50
        ];
    }

    private static Attendance__c derivedDay(Id employeeId) {
        Date today = AttendanceRollupService.businessDateOf(System.now());
        List<Attendance__c> rows = [
            SELECT Check_In__c, Check_Out__c, Break_Minutes__c, Total_Hours__c
            FROM Attendance__c WHERE Employee__c = :employeeId AND Date__c = :today LIMIT 1
        ];
        return rows.isEmpty() ? null : rows[0];
    }

    private static Boolean isRemote(Leave_Type__c leaveType) {
        if (leaveType == null) return false;
        String code = (leaveType.Code__c ?? '').toUpperCase();
        String name = (leaveType.Name ?? '').toLowerCase();
        return code == 'WFH' || name.contains('work from home') || name.contains('remote');
    }

    private static Decimal available(Leave_Balance__c row) {
        if (row.Closing_Balance__c != null) return row.Closing_Balance__c;
        return (row.Opening_Balance__c ?? 0) + (row.Accrued__c ?? 0) - (row.Availed__c ?? 0);
    }
}
