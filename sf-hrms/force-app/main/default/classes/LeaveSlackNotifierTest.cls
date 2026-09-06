/**
 * Tests for LeaveSlackNotifier. The Default settings record ships disabled, so
 * these cover the disabled path and the message construction directly.
 */
@isTest
private class LeaveSlackNotifierTest {
    @TestSetup
    static void setupTestData() {
        List<Employee__c> employees = TestDataFactory.createEmployees(2, true);
        Leave_Type__c leaveType = TestDataFactory.createLeaveType('Casual Leave', 12, true);
        TestDataFactory.createLeaveBalances(employees, leaveType, 0, 12, true);
    }

    private static Leave_Request__c createRequest() {
        List<Employee__c> employees = [SELECT Id FROM Employee__c ORDER BY Employee_Code__c];
        Leave_Type__c leaveType = [SELECT Id FROM Leave_Type__c LIMIT 1];
        Leave_Request__c request = TestDataFactory.buildLeaveRequest(
            employees[0], employees[1], leaveType, 2, 'Submitted'
        );
        request.Reason__c = 'Family function <important> & travel';
        insert request;
        return [
            SELECT Id, Name, Status__c, From_Date__c, To_Date__c, Days__c, Half_Day__c, Reason__c,
                   Employee__r.Name, Approver__r.Name, Leave_Type__r.Name
            FROM Leave_Request__c WHERE Id = :request.Id
        ];
    }

    @isTest
    static void shouldNotEnqueue_WhenIntegrationDisabled() {
        // Given the shipped Default record has Enabled__c = false
        Test.startTest();
        LeaveSlackNotifier.enqueue(new Set<Id>{ createRequest().Id }, true);
        Integer queued = Limits.getQueueableJobs();
        Test.stopTest();

        Assert.areEqual(0, queued, 'Nothing is queued while the integration is disabled');
    }

    @isTest
    static void shouldIgnoreEmptyInput() {
        Test.startTest();
        LeaveSlackNotifier.enqueue(new Set<Id>(), true);
        LeaveSlackNotifier.enqueue(null, true);
        Integer queued = Limits.getQueueableJobs();
        Test.stopTest();

        Assert.areEqual(0, queued, 'No work is queued for an empty or null id set');
    }

    @isTest
    static void shouldBuildValidBlockKitForNewRequest() {
        Leave_Request__c request = createRequest();

        Test.startTest();
        String blocksJson = LeaveSlackNotifier.buildBlocks(request, true);
        Test.stopTest();

        List<Object> blocks = (List<Object>) JSON.deserializeUntyped(blocksJson);
        Assert.isTrue(blocks.size() >= 3, 'Header, fields and context at minimum');
        Assert.isTrue(blocks.size() <= 50, 'Must stay inside the Slack message block ceiling');

        Map<String, Object> header = (Map<String, Object>) blocks[0];
        Assert.areEqual('header', header.get('type'), 'First block is the header');
        Assert.isTrue(blocksJson.contains('New leave request'), 'Announces a new request');
        Assert.isTrue(blocksJson.contains('Family function'), 'Carries the stated reason');
        Assert.isTrue(blocksJson.contains('&lt;important&gt;'),
            'Reason text is escaped for Slack');
        Assert.isTrue(blocksJson.contains('&amp;'), 'Ampersand in the reason is escaped');
    }

    @isTest
    static void shouldBuildDecisionMessage_WhenNotNew() {
        Leave_Request__c request = createRequest();
        request.Status__c = 'Approved';

        Test.startTest();
        String blocksJson = LeaveSlackNotifier.buildBlocks(request, false);
        String fallback = LeaveSlackNotifier.buildFallback(request, false);
        Test.stopTest();

        Assert.isTrue(blocksJson.contains('Approved'), 'The decision is named in the message');
        Assert.isTrue(fallback.contains('Approved'), 'And in the notification fallback');
    }

    @isTest
    static void shouldNameEmployeeAndDatesInFallback() {
        Leave_Request__c request = createRequest();

        Test.startTest();
        String fallback = LeaveSlackNotifier.buildFallback(request, true);
        Test.stopTest();

        Assert.isTrue(fallback.contains('applied for'), 'Fallback describes the action');
        Assert.isTrue(fallback.contains(String.valueOf(request.From_Date__c)),
            'Fallback carries the start date for clients that cannot render blocks');
    }

    private class OkMock implements HttpCalloutMock {
        public Integer callCount = 0;
        public List<String> channels = new List<String>();
        public HttpResponse respond(HttpRequest request) {
            callCount++;
            Map<String, Object> body =
                (Map<String, Object>) JSON.deserializeUntyped(request.getBody());
            channels.add(String.valueOf(body.get('channel')));
            HttpResponse response = new HttpResponse();
            response.setStatusCode(200);
            response.setBody('{"ok":true}');
            return response;
        }
    }

    private static HRMS_Slack_Setting__mdt enabledSetting(String channelId) {
        return new HRMS_Slack_Setting__mdt(
            Enabled__c = true,
            Named_Credential__c = 'Slack_API',
            Notify_Manager__c = true,
            Notify_HR__c = true,
            HR_Department_Name__c = 'HR',
            HR_Channel_Id__c = channelId
        );
    }

    @isTest
    static void shouldMessageManagerAndHrChannel_WhenNewRequest() {
        // Given a manager with a Slack id and an HR channel configured
        Leave_Request__c request = createRequest();
        Employee__c approver = [
            SELECT Id FROM Employee__c WHERE Id = :request.Approver__c LIMIT 1
        ];
        approver.Slack_User_Id__c = 'U_MANAGER';
        update approver;

        LeaveSlackNotifier.settingOverride = enabledSetting('C_HR');
        OkMock mock = new OkMock();
        Test.setMock(HttpCalloutMock.class, mock);

        // When
        Test.startTest();
        new LeaveSlackNotifier(new Set<Id>{ request.Id }, true).execute(null);
        Test.stopTest();

        // Then
        Assert.areEqual(2, mock.callCount, 'The manager and the HR channel are both messaged');
        Assert.isTrue(mock.channels.contains('U_MANAGER'), 'The approver receives a direct message');
        Assert.isTrue(mock.channels.contains('C_HR'), 'HR receives the channel post');
    }

    @isTest
    static void shouldDirectMessageHrEmployees_WhenNoChannelConfigured() {
        // Given HR employees with Slack ids and no channel set
        Leave_Request__c request = createRequest();
        List<Employee__c> hr = TestDataFactory.createEmployees(2, false);
        for (Integer i = 0; i < hr.size(); i++) {
            hr[i].Department__c = 'HR';
            hr[i].Slack_User_Id__c = 'U_HR' + i;
            hr[i].Employee_Code__c = 'HR' + i;
            hr[i].Official_Email__c = 'hr' + i + '@example.invalid';
        }
        insert hr;

        LeaveSlackNotifier.settingOverride = enabledSetting(null);
        OkMock mock = new OkMock();
        Test.setMock(HttpCalloutMock.class, mock);

        // When
        Test.startTest();
        new LeaveSlackNotifier(new Set<Id>{ request.Id }, true).execute(null);
        Test.stopTest();

        // Then
        Assert.isTrue(mock.channels.contains('U_HR0'), 'Each HR employee is messaged directly');
        Assert.isTrue(mock.channels.contains('U_HR1'), 'Each HR employee is messaged directly');
    }

    @isTest
    static void shouldMessageEmployeeOnly_WhenDecisionMade() {
        // Given
        Leave_Request__c request = createRequest();
        Employee__c employee = [
            SELECT Id FROM Employee__c WHERE Id = :request.Employee__c LIMIT 1
        ];
        employee.Slack_User_Id__c = 'U_EMPLOYEE';
        update employee;

        LeaveSlackNotifier.settingOverride = enabledSetting('C_HR');
        OkMock mock = new OkMock();
        Test.setMock(HttpCalloutMock.class, mock);

        // When
        Test.startTest();
        new LeaveSlackNotifier(new Set<Id>{ request.Id }, false).execute(null);
        Test.stopTest();

        // Then
        Assert.areEqual(1, mock.callCount, 'A decision goes only to the requesting employee');
        Assert.areEqual('U_EMPLOYEE', mock.channels[0], 'And it reaches that employee');
    }

    @isTest
    static void shouldSkipRecipientsWithoutSlackId() {
        // Given nobody has a Slack id
        Leave_Request__c request = createRequest();
        LeaveSlackNotifier.settingOverride = enabledSetting(null);
        OkMock mock = new OkMock();
        Test.setMock(HttpCalloutMock.class, mock);

        // When
        Test.startTest();
        new LeaveSlackNotifier(new Set<Id>{ request.Id }, true).execute(null);
        Test.stopTest();

        // Then
        Assert.areEqual(0, mock.callCount, 'Nobody is messaged when no Slack ids are mapped');
    }

    @isTest
    static void shouldNotThrow_WhenSlackRefusesTheMessage() {
        // Given Slack answers ok:false
        Leave_Request__c request = createRequest();
        Employee__c approver = [SELECT Id FROM Employee__c WHERE Id = :request.Approver__c LIMIT 1];
        approver.Slack_User_Id__c = 'U_MANAGER';
        update approver;
        LeaveSlackNotifier.settingOverride = enabledSetting(null);
        Test.setMock(HttpCalloutMock.class, new SlackRefusalMock());

        // When / Then: a Slack failure must never surface to the caller
        Test.startTest();
        new LeaveSlackNotifier(new Set<Id>{ request.Id }, true).execute(null);
        Test.stopTest();

        Assert.areEqual(1, [SELECT COUNT() FROM Leave_Request__c WHERE Id = :request.Id],
            'The leave request is untouched by a Slack failure');
    }

    private class SlackRefusalMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest request) {
            HttpResponse response = new HttpResponse();
            response.setStatusCode(200);
            response.setBody('{"ok":false,"error":"channel_not_found"}');
            return response;
        }
    }
}
