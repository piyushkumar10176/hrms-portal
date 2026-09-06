/**
 * Tests for LeaveDigestService and DailyLeaveDigestJob.
 */
@isTest
private class LeaveDigestServiceTest {
    private static final Date REPORT_DAY = Date.newInstance(2026, 9, 9);

    @TestSetup
    static void setupTestData() {
        List<Employee__c> employees = TestDataFactory.createEmployees(3, true);
        Leave_Type__c leaveType = TestDataFactory.createLeaveType('Casual Leave', 12, true);
        TestDataFactory.createLeaveBalances(employees, leaveType, 0, 12, true);
    }

    private static Leave_Request__c approvedLeave(Employee__c employee, Date fromDate, Date toDate) {
        // Pin the leave notifier off while seeding. Otherwise the trigger queues a
        // real Slack notification whenever the org's Default setting happens to be
        // enabled, which adds callouts these tests count.
        LeaveSlackNotifier.settingOverride = new HRMS_Slack_Setting__mdt(Enabled__c = false);
        Leave_Type__c leaveType = [SELECT Id FROM Leave_Type__c LIMIT 1];
        Leave_Request__c request = new Leave_Request__c(
            Employee__c = employee.Id,
            Leave_Type__c = leaveType.Id,
            From_Date__c = fromDate,
            To_Date__c = toDate,
            Days__c = 1,
            Half_Day__c = false,
            Status__c = 'Approved'
        );
        insert request;
        return request;
    }

    @isTest
    static void shouldFindAbsence_WhenLeaveSpansTheDate() {
        List<Employee__c> employees = [SELECT Id FROM Employee__c ORDER BY Employee_Code__c];
        approvedLeave(employees[0], REPORT_DAY.addDays(-2), REPORT_DAY.addDays(2));

        Test.startTest();
        List<LeaveDigestService.Absence> absences = LeaveDigestService.absencesOn(REPORT_DAY);
        Test.stopTest();

        Assert.areEqual(1, absences.size(), 'Leave spanning the date counts as an absence');
    }

    @isTest
    static void shouldExcludeLeaveOutsideTheDate() {
        List<Employee__c> employees = [SELECT Id FROM Employee__c ORDER BY Employee_Code__c];
        approvedLeave(employees[0], REPORT_DAY.addDays(5), REPORT_DAY.addDays(6));

        Test.startTest();
        List<LeaveDigestService.Absence> absences = LeaveDigestService.absencesOn(REPORT_DAY);
        Test.stopTest();

        Assert.areEqual(0, absences.size(), 'Leave in the future is not an absence today');
    }

    @isTest
    static void shouldExcludeUnapprovedLeave() {
        List<Employee__c> employees = [SELECT Id FROM Employee__c ORDER BY Employee_Code__c];
        Leave_Request__c request = approvedLeave(employees[0], REPORT_DAY, REPORT_DAY);
        request.Status__c = 'Submitted';
        update request;

        Test.startTest();
        List<LeaveDigestService.Absence> absences = LeaveDigestService.absencesOn(REPORT_DAY);
        Test.stopTest();

        Assert.areEqual(0, absences.size(), 'Only approved leave counts as an absence');
    }

    @isTest
    static void shouldBuildValidBlocks_WhenPeopleAreOut() {
        List<Employee__c> employees = [SELECT Id FROM Employee__c ORDER BY Employee_Code__c];
        approvedLeave(employees[0], REPORT_DAY, REPORT_DAY);
        approvedLeave(employees[1], REPORT_DAY, REPORT_DAY);

        Test.startTest();
        List<LeaveDigestService.Absence> absences = LeaveDigestService.absencesOn(REPORT_DAY);
        String blocksJson = LeaveDigestService.buildBlocks(REPORT_DAY, absences, new List<Leave_Request__c>(), null);
        Test.stopTest();

        List<Object> blocks = (List<Object>) JSON.deserializeUntyped(blocksJson);
        Assert.isTrue(blocks.size() <= 50, 'Must stay inside the Slack message block ceiling');
        Assert.isTrue(blocksJson.contains('2 people are out'), 'Counts the absences');
    }

    @isTest
    static void shouldSayNobodyIsOut_WhenNoAbsences() {
        Test.startTest();
        String blocksJson = LeaveDigestService.buildBlocks(
            REPORT_DAY, new List<LeaveDigestService.Absence>(), new List<Leave_Request__c>(), null
        );
        Test.stopTest();

        Assert.isTrue(blocksJson.contains('Nobody is on approved leave'), 'States the quiet case plainly');
    }

    @isTest
    static void shouldNameTheHoliday_WhenOneFalls() {
        Test.startTest();
        String blocksJson = LeaveDigestService.buildBlocks(
            REPORT_DAY, new List<LeaveDigestService.Absence>(), new List<Leave_Request__c>(), 'Diwali'
        );
        Test.stopTest();

        Assert.isTrue(blocksJson.contains('Diwali'), 'A holiday is called out in the digest');
    }

    @isTest
    static void shouldListPendingRequests() {
        List<Employee__c> employees = [SELECT Id FROM Employee__c ORDER BY Employee_Code__c];
        Leave_Request__c request = approvedLeave(employees[0], REPORT_DAY.addDays(20), REPORT_DAY.addDays(20));
        request.Status__c = 'Submitted';
        update request;

        Test.startTest();
        List<Leave_Request__c> pending = LeaveDigestService.pendingRequests();
        String blocksJson = LeaveDigestService.buildBlocks(
            REPORT_DAY, new List<LeaveDigestService.Absence>(), pending, null
        );
        Test.stopTest();

        Assert.areEqual(1, pending.size(), 'The submitted request is pending');
        Assert.isTrue(blocksJson.contains('awaiting a decision'), 'Pending work is surfaced in the digest');
    }

    @isTest
    static void shouldNotPost_WhenIntegrationDisabled() {
        DailyLeaveDigestJob.settingOverride = new HRMS_Slack_Setting__mdt(Enabled__c = false);

        Test.startTest();
        new DailyLeaveDigestJob().execute(null);
        Test.stopTest();

        // No callout mock is set, so any attempt to post would throw.
        Assert.isTrue(true, 'A disabled integration performs no callout');
    }

    @isTest
    static void shouldPostDigest_WhenEnabled() {
        List<Employee__c> employees = [SELECT Id FROM Employee__c ORDER BY Employee_Code__c];
        approvedLeave(employees[0], Date.today(), Date.today());

        DailyLeaveDigestJob.settingOverride = new HRMS_Slack_Setting__mdt(
            Enabled__c = true,
            Named_Credential__c = 'Slack_API',
            Digest_Channel_Id__c = 'C_DIGEST',
            Workspace_Team_Id__c = 'T_TEST'
        );
        DigestMock mock = new DigestMock();
        Test.setMock(HttpCalloutMock.class, mock);

        Test.startTest();
        new DailyLeaveDigestJob().execute(null);
        Test.stopTest();

        Assert.areEqual(1, mock.callCount, 'One digest is posted');
        Assert.areEqual('C_DIGEST', mock.channel, 'It goes to the configured digest channel');
    }

    @isTest
    static void shouldScheduleWithoutError() {
        Test.startTest();
        String jobId = System.schedule(
            'HRMS digest test', '0 0 3 * * ?', new DailyLeaveDigestSchedulable()
        );
        Test.stopTest();

        Assert.areEqual(
            1,
            [SELECT COUNT() FROM CronTrigger WHERE Id = :jobId],
            'The schedulable registers a cron trigger'
        );
    }

    private class DigestMock implements HttpCalloutMock {
        public Integer callCount = 0;
        public String channel;
        public HttpResponse respond(HttpRequest request) {
            callCount++;
            Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(request.getBody());
            channel = String.valueOf(body.get('channel'));
            HttpResponse response = new HttpResponse();
            response.setStatusCode(200);
            response.setBody('{"ok":true}');
            return response;
        }
    }
}
