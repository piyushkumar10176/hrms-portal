/**
 * Tests for AttendancePunchSlackNotifier: which punches are announced, which are
 * deliberately not, and the shape of the Block Kit payload.
 *
 * The Default settings record cannot be inserted in a test, so every test pins
 * its own setting through the override seam rather than depending on whether the
 * org happens to have the integration switched on.
 */
@isTest
private class AttendancePunchSlackNotifierTest {
    /** A Wednesday, so it is neither a weekend nor a seeded holiday. */
    private static final Date WORKDAY = Date.newInstance(2026, 9, 9);

    @TestSetup
    static void setupTestData() {
        List<Employee__c> employees = TestDataFactory.createEmployees(2, true);
        employees[0].Slack_User_Id__c = 'U0TEST0001';
        update employees[0];
    }

    private static HRMS_Slack_Setting__mdt disabledSetting() {
        return new HRMS_Slack_Setting__mdt(Enabled__c = false, Notify_Punch__c = false);
    }

    private static HRMS_Slack_Setting__mdt enabledSetting() {
        return new HRMS_Slack_Setting__mdt(
            Enabled__c = true,
            Notify_Punch__c = true,
            Named_Credential__c = 'Slack_API',
            Workspace_Team_Id__c = 'T0TEST'
        );
    }

    private static Employee__c linkedEmployee() {
        return [
            SELECT Id, Name, Slack_User_Id__c
            FROM Employee__c
            WHERE Slack_User_Id__c != NULL
            LIMIT 1
        ];
    }

    /** Inserts punches with the integration pinned off, so seeding queues nothing. */
    private static void seedPunches(List<Attendance_Punch__c> punches) {
        AttendancePunchSlackNotifier.settingOverride = disabledSetting();
        insert punches;
    }

    @isTest
    static void shouldNotEnqueue_WhenPunchNoticesDisabled() {
        // Given
        Employee__c employee = linkedEmployee();
        List<Attendance_Punch__c> punches = new List<Attendance_Punch__c>{
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 10, 0), 'Check-In')
        };
        seedPunches(punches);

        // When
        Test.startTest();
        AttendancePunchSlackNotifier.settingOverride = disabledSetting();
        AttendancePunchSlackNotifier.enqueue(punches);
        Integer queued = Limits.getQueueableJobs();
        Test.stopTest();

        // Then
        Assert.areEqual(0, queued, 'Nothing is queued while punch notices are off');
    }

    @isTest
    static void shouldNotEnqueue_WhenPunchCameFromSlack() {
        // The slash command already answers the person who typed it, so a direct
        // message on top would repeat the same confirmation.
        Employee__c employee = linkedEmployee();
        Attendance_Punch__c punch =
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 10, 0), 'Check-In');
        punch.Source__c = 'Slack';
        seedPunches(new List<Attendance_Punch__c>{ punch });

        // When
        Test.startTest();
        AttendancePunchSlackNotifier.settingOverride = enabledSetting();
        AttendancePunchSlackNotifier.enqueue(new List<Attendance_Punch__c>{ punch });
        Integer queued = Limits.getQueueableJobs();
        Test.stopTest();

        // Then
        Assert.areEqual(0, queued, 'A Slack-sourced punch is not announced again');
    }

    @isTest
    static void shouldEnqueue_WhenPunchCameFromTheWeb() {
        // Given
        Employee__c employee = linkedEmployee();
        Attendance_Punch__c punch =
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 10, 0), 'Check-In');
        punch.Source__c = 'Web';
        seedPunches(new List<Attendance_Punch__c>{ punch });

        // When
        Test.startTest();
        AttendancePunchSlackNotifier.settingOverride = enabledSetting();
        AttendancePunchSlackNotifier.enqueue(new List<Attendance_Punch__c>{ punch });
        Integer queued = Limits.getQueueableJobs();
        Test.stopTest();

        // Then
        Assert.areEqual(1, queued, 'A web clock-in is announced to the employee');
    }

    @isTest
    static void shouldIgnoreEmptyInput() {
        Test.startTest();
        AttendancePunchSlackNotifier.settingOverride = enabledSetting();
        AttendancePunchSlackNotifier.enqueue(null);
        AttendancePunchSlackNotifier.enqueue(new List<Attendance_Punch__c>());
        Integer queued = Limits.getQueueableJobs();
        Test.stopTest();

        Assert.areEqual(0, queued, 'No work is queued for an empty or null list');
    }

    @isTest
    static void shouldSendDirectMessage_WhenQueueableRuns() {
        // Given a completed day, so the message can carry the totals
        Employee__c employee = linkedEmployee();
        List<Attendance_Punch__c> punches = new List<Attendance_Punch__c>{
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 10, 0), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 13, 0), 'Check-Out'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 14, 0), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 19, 0), 'Check-Out')
        };
        seedPunches(punches);
        SlackCalloutMock mock = new SlackCalloutMock();
        Test.setMock(HttpCalloutMock.class, mock);

        // When
        Test.startTest();
        AttendancePunchSlackNotifier.settingOverride = enabledSetting();
        System.enqueueJob(
            new AttendancePunchSlackNotifier(new Set<Id>{ punches[3].Id })
        );
        Test.stopTest();

        // Then
        Assert.areEqual(1, mock.calls, 'One direct message for one punch');
        Assert.isTrue(mock.lastBody.contains('U0TEST0001'),
            'Addressed to the employee Slack id, was: ' + mock.lastBody);
    }

    @isTest
    static void shouldSendNothing_WhenEmployeeHasNoSlackId() {
        // Given the second seeded employee was never linked to Slack
        Employee__c employee = [
            SELECT Id FROM Employee__c WHERE Slack_User_Id__c = NULL ORDER BY Employee_Code__c LIMIT 1
        ];
        Attendance_Punch__c punch =
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 10, 0), 'Check-In');
        seedPunches(new List<Attendance_Punch__c>{ punch });
        SlackCalloutMock mock = new SlackCalloutMock();
        Test.setMock(HttpCalloutMock.class, mock);

        // When
        Test.startTest();
        AttendancePunchSlackNotifier.settingOverride = enabledSetting();
        System.enqueueJob(new AttendancePunchSlackNotifier(new Set<Id>{ punch.Id }));
        Test.stopTest();

        // Then
        Assert.areEqual(0, mock.calls, 'An unlinked employee simply gets no message');
    }

    @isTest
    static void shouldMessageOnlyThePunchOwner_AndNobodyElse() {
        // Reported as the manager receiving an employee's clock-in. Nothing in
        // the notifier looks up a manager, and this pins that down: one punch
        // produces exactly one message, addressed to the person who punched.
        Employee__c employee = linkedEmployee();
        Employee__c manager = [
            SELECT Id FROM Employee__c WHERE Id != :employee.Id ORDER BY Employee_Code__c LIMIT 1
        ];
        manager.Slack_User_Id__c = 'U0MANAGER99';
        manager.Reporting_Manager__c = null;
        update manager;
        employee.Reporting_Manager__c = manager.Id;
        update employee;

        Attendance_Punch__c punch =
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 10, 0), 'Check-In');
        punch.Source__c = 'Web';
        seedPunches(new List<Attendance_Punch__c>{ punch });
        SlackCalloutMock mock = new SlackCalloutMock();
        Test.setMock(HttpCalloutMock.class, mock);

        // When
        Test.startTest();
        AttendancePunchSlackNotifier.settingOverride = enabledSetting();
        System.enqueueJob(new AttendancePunchSlackNotifier(new Set<Id>{ punch.Id }));
        Test.stopTest();

        // Then
        Assert.areEqual(1, mock.calls, 'Exactly one message for one punch');
        Assert.areEqual(1, mock.recipients.size(), 'Exactly one recipient');
        Assert.areEqual('U0TEST0001', mock.recipients[0],
            'Addressed to the employee who punched');
        Assert.isFalse(mock.recipients.contains('U0MANAGER99'),
            'The reporting manager must never be sent a punch notice');
    }

    @isTest
    static void shouldNameTheEmployee_InTheMessage() {
        // Without a name the reader cannot tell whether the message is about
        // them, which is how a correctly addressed message gets reported as
        // having gone to the wrong person.
        Employee__c employee = linkedEmployee();
        Attendance_Punch__c punch =
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 10, 0), 'Check-In');
        seedPunches(new List<Attendance_Punch__c>{ punch });
        Attendance_Punch__c saved = [
            SELECT Id, Punch_DateTime__c, Punch_Type__c, Source__c,
                   Employee__r.Name, Employee__r.Employee_Code__c
            FROM Attendance_Punch__c WHERE Id = :punch.Id
        ];

        Test.startTest();
        String blocks = AttendancePunchSlackNotifier.buildBlocks(saved, null);
        String fallback = AttendancePunchSlackNotifier.buildFallback(saved);
        Test.stopTest();

        Assert.isTrue(blocks.contains(saved.Employee__r.Name),
            'The message must name the employee, was: ' + blocks);
        Assert.isTrue(blocks.contains(saved.Employee__r.Employee_Code__c),
            'The message should carry the employee code as well, was: ' + blocks);
        Assert.isTrue(fallback.startsWith(saved.Employee__r.Name),
            'The notification preview must lead with the name, was: ' + fallback);
    }

    @isTest
    static void shouldBuildValidBlockKit_ForCheckOutWithBreak() {
        // Given
        Employee__c employee = linkedEmployee();
        List<Attendance_Punch__c> punches = new List<Attendance_Punch__c>{
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 10, 0), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 10, 30), 'Check-Out'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 11, 15), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 19, 0), 'Check-Out')
        };
        seedPunches(punches);
        Attendance__c day = [
            SELECT Id, Check_In__c, Check_Out__c, Total_Hours__c, Gross_Hours__c,
                   Break_Minutes__c, Penalty__c, Penalty_Reason__c
            FROM Attendance__c
            WHERE Employee__c = :employee.Id AND Date__c = :WORKDAY
        ];
        Attendance_Punch__c checkOut = [
            SELECT Id, Punch_DateTime__c, Punch_Type__c, Source__c,
                   Employee__r.Name, Employee__r.Employee_Code__c
            FROM Attendance_Punch__c WHERE Id = :punches[3].Id
        ];

        // When
        Test.startTest();
        String blocksJson = AttendancePunchSlackNotifier.buildBlocks(checkOut, day);
        Test.stopTest();

        // Then
        List<Object> blocks = (List<Object>) JSON.deserializeUntyped(blocksJson);
        Assert.isTrue(blocks.size() <= 50, 'Must stay inside the Slack message block ceiling');
        Assert.isTrue(blocksJson.contains('clocked out'), 'Announces the clock-out');
        Assert.isTrue(blocksJson.contains(checkOut.Employee__r.Name),
            'Names the employee who punched');
        Assert.isTrue(blocksJson.contains('19:00'), 'Shows the punch time in IST');
        Assert.isTrue(blocksJson.contains('45m'), 'Reports the forty-five minute break');
        Assert.areEqual(45, day.Break_Minutes__c, 'The 10:30 to 11:15 gap is the break');
    }

    @isTest
    static void shouldBuildBlocks_WhenDayNotYetRolledUp() {
        // A clock-in on a day with no Attendance__c row must still produce a
        // valid message rather than fail on the missing totals.
        Employee__c employee = linkedEmployee();
        Attendance_Punch__c punch =
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 10, 0), 'Check-In');
        seedPunches(new List<Attendance_Punch__c>{ punch });
        Attendance_Punch__c saved = [
            SELECT Id, Punch_DateTime__c, Punch_Type__c, Source__c,
                   Employee__r.Name, Employee__r.Employee_Code__c
            FROM Attendance_Punch__c WHERE Id = :punch.Id
        ];

        Test.startTest();
        String blocksJson = AttendancePunchSlackNotifier.buildBlocks(saved, null);
        String fallback = AttendancePunchSlackNotifier.buildFallback(saved);
        Test.stopTest();

        List<Object> blocks = (List<Object>) JSON.deserializeUntyped(blocksJson);
        Assert.areEqual(2, blocks.size(), 'Confirmation and context only, with no totals');
        Assert.isTrue(blocksJson.contains('clocked in'), 'Announces the clock-in');
        Assert.areEqual(saved.Employee__r.Name + ' clocked in at 10:00', fallback,
            'Fallback text names the employee and the time');
    }

    /** Answers every Slack call with a success body, and remembers each one. */
    private class SlackCalloutMock implements HttpCalloutMock {
        private Integer calls = 0;
        private String lastBody;
        private List<String> recipients = new List<String>();

        public HttpResponse respond(HttpRequest request) {
            calls++;
            lastBody = request.getBody();
            Map<String, Object> payload =
                (Map<String, Object>) JSON.deserializeUntyped(request.getBody());
            recipients.add(String.valueOf(payload.get('channel')));
            HttpResponse response = new HttpResponse();
            response.setStatusCode(200);
            response.setBody('{"ok":true}');
            return response;
        }
    }
}
