/**
 * Tests for the whole interaction path: a Slack payload in, a response and a
 * queued job out.
 *
 * These go through SlackInteractivityHandler with the payloads Slack actually
 * sends, rather than calling the handlers directly, because the routing and the
 * three-second shape are the part most likely to break. Two rules are asserted
 * throughout: a modal opens inside the request that carried the trigger_id, and
 * anything needing a callout after a write happens afterwards in a Queueable.
 */
@isTest
private class SlackInteractionFlowTest {

    private static final String ADMIN_SLACK_ID = 'U0FLOWADM1';
    private static final String STAFF_SLACK_ID = 'U0FLOWEMP1';
    private static final String TRIGGER_ID = '13345224609.738474920.8088930838d88f008e0';

    @TestSetup
    static void setupTestData() {
        List<Employee__c> staff = TestDataFactory.createEmployees(2, true);
        staff[0].Role__c = 'Admin';
        staff[0].Slack_User_Id__c = ADMIN_SLACK_ID;
        staff[1].Role__c = 'Employee';
        staff[1].Slack_User_Id__c = STAFF_SLACK_ID;
        staff[1].Reporting_Manager__c = staff[0].Id;
        update staff;

        Leave_Type__c annual = TestDataFactory.createLeaveType('Annual Leave', 18, true);
        TestDataFactory.createLeaveBalances(staff, annual, 0, 12, true);

        insert new Slack_Config__c(
            SetupOwnerId = UserInfo.getOrganizationId(),
            Signing_Secret__c = 'test-signing-secret-value',
            Verification_Token__c = 'test-verification-token',
            Bot_Token__c = 'xoxb-test-bot-token',
            Gateway_Enabled__c = true
        );
    }

    /** Installs the mock and hands it back so a test can assert what was said. */
    private static SlackHttpMock mockSlack() {
        SlackHttpMock mock = new SlackHttpMock();
        Test.setMock(HttpCalloutMock.class, mock);
        return mock;
    }

    private static void prepareResponse() {
        RestContext.request = new RestRequest();
        RestContext.response = new RestResponse();
    }

    private static String responseBody() {
        return RestContext.response.responseBody == null
            ? '' : RestContext.response.responseBody.toString();
    }

    private static String buttonPayload(String actionId, String value, String slackUserId) {
        return JSON.serialize(new Map<String, Object>{
            'type' => 'block_actions',
            'trigger_id' => TRIGGER_ID,
            'user' => new Map<String, Object>{ 'id' => slackUserId },
            'actions' => new List<Object>{
                new Map<String, Object>{ 'action_id' => actionId, 'value' => value }
            }
        });
    }

    /** A submission, with each block carrying the action id "value" as Slack sends it. */
    private static String submissionPayload(
        String callbackId, String metadata, Map<String, Object> fields, String slackUserId
    ) {
        Map<String, Object> values = new Map<String, Object>();
        for (String blockId : fields.keySet()) {
            values.put(blockId, new Map<String, Object>{ 'value' => fields.get(blockId) });
        }
        return JSON.serialize(new Map<String, Object>{
            'type' => 'view_submission',
            'user' => new Map<String, Object>{ 'id' => slackUserId },
            'view' => new Map<String, Object>{
                'callback_id' => callbackId,
                'private_metadata' => metadata,
                'state' => new Map<String, Object>{ 'values' => values }
            }
        });
    }

    private static Map<String, Object> typed(String value) {
        return new Map<String, Object>{ 'value' => value };
    }

    private static Map<String, Object> picked(String value) {
        return new Map<String, Object>{
            'selected_option' => new Map<String, Object>{ 'value' => value }
        };
    }

    private static Map<String, Object> dated(Date value) {
        return new Map<String, Object>{ 'selected_date' => SlackBlocks.dateText(value) };
    }

    private static Employee__c staffMember() {
        return [SELECT Id, Name FROM Employee__c WHERE Slack_User_Id__c = :STAFF_SLACK_ID LIMIT 1];
    }

    private static Date nextMonday() {
        Date day = Date.today().addDays(1);
        while (DateTime.newInstanceGmt(day, Time.newInstance(12, 0, 0, 0)).formatGmt('EEE') != 'Mon') {
            day = day.addDays(1);
        }
        return day;
    }

    // ---- opening a modal -------------------------------------------------

    @isTest
    static void shouldOpenTheLeaveFormInsideTheRequestThatCarriedTheTriggerId() {
        SlackHttpMock mock = mockSlack();
        prepareResponse();

        Test.startTest();
        SlackInteractivityHandler.handle(
            RestContext.response, buttonPayload('hrms_apply_leave', 'new', STAFF_SLACK_ID)
        );
        // Asserted before stopTest deliberately: a trigger_id lives about three
        // seconds, so a modal opened by a Queueable would arrive too late.
        Assert.isTrue(
            mock.called('views.open'),
            'The modal must open in this request, not in a job afterwards'
        );
        Test.stopTest();

        Assert.isTrue(
            mock.bodyOf('views.open').contains(SlackLeaveApply.APPLY_CALLBACK),
            'And it should be the leave form'
        );
        Assert.areEqual(200, RestContext.response.statusCode, 'Slack should be acknowledged');
    }

    @isTest
    static void shouldNotOpenTheOnboardingFormForSomebodyWhoCannotOnboard() {
        SlackHttpMock mock = mockSlack();
        prepareResponse();

        Test.startTest();
        SlackInteractivityHandler.handle(
            RestContext.response,
            buttonPayload(SlackEmployeeModals.ADD_CALLBACK, 'add', STAFF_SLACK_ID)
        );
        Test.stopTest();

        Assert.isFalse(
            mock.called('views.open'),
            'The button is rendered by us but pressed by a client, so the check is here'
        );
        Assert.areEqual(200, RestContext.response.statusCode, 'Still acknowledged, not errored');
    }

    @isTest
    static void shouldOpenTheOnboardingFormForAnAdministrator() {
        SlackHttpMock mock = mockSlack();
        prepareResponse();

        Test.startTest();
        SlackInteractivityHandler.handle(
            RestContext.response,
            buttonPayload(SlackEmployeeModals.ADD_CALLBACK, 'add', ADMIN_SLACK_ID)
        );
        Assert.isTrue(mock.called('views.open'), 'An administrator gets the form');
        Test.stopTest();
    }

    @isTest
    static void shouldOpenTheCorrectionFormForTheDayTheButtonNamed() {
        SlackHttpMock mock = mockSlack();
        prepareResponse();
        String packed = staffMember().Id + '|2026-03-10';

        Test.startTest();
        SlackInteractivityHandler.handle(
            RestContext.response,
            buttonPayload(SlackAttendanceAdmin.ADD_PUNCH_CALLBACK, packed, ADMIN_SLACK_ID)
        );
        Assert.isTrue(
            mock.bodyOf('views.open').contains('2026-03-10'),
            'The form has to open on the day that was being looked at'
        );
        Test.stopTest();
    }

    // ---- writing ---------------------------------------------------------

    @isTest
    static void shouldClockInFromTheHomeTabAndConfirmAfterwards() {
        SlackHttpMock mock = mockSlack();
        prepareResponse();

        Test.startTest();
        SlackInteractivityHandler.handle(
            RestContext.response, buttonPayload('home_clock_in', 'in', STAFF_SLACK_ID)
        );
        Assert.areEqual(
            1, [SELECT COUNT() FROM Attendance_Punch__c],
            'The punch is written in the request, so the acknowledgement is honest'
        );
        Assert.isFalse(
            mock.called('chat.postMessage'),
            'Nothing may call out after that write in the same transaction'
        );
        Test.stopTest();

        Assert.isTrue(
            mock.called('chat.postMessage'), 'The confirmation arrives once the job runs'
        );
        Assert.isTrue(
            mock.called('views.publish'),
            'And the Home tab is redrawn, because it now shows the wrong thing'
        );
        Assert.isTrue(
            mock.saidInAny('chat.postMessage', 'Clocked in'),
            'The message should say what happened: ' + mock.allSaidTo('chat.postMessage')
        );
    }

    @isTest
    static void shouldTellSomebodyUnlinkedWhyNothingHappens() {
        SlackHttpMock mock = mockSlack();
        prepareResponse();

        Test.startTest();
        SlackInteractivityHandler.handle(
            RestContext.response, buttonPayload('home_clock_in', 'in', 'U0NOBODY99')
        );
        Test.stopTest();

        Assert.areEqual(
            0, [SELECT COUNT() FROM Attendance_Punch__c], 'Nothing should be written'
        );
        Assert.isTrue(
            mock.saidInAny('chat.postMessage', 'not linked'),
            'A Home tab press carries no response_url, so this has to be a direct message'
        );
    }

    // ---- submitting a form -----------------------------------------------

    @isTest
    static void shouldRecordLeaveAndCloseTheModal() {
        SlackHttpMock mock = mockSlack();
        prepareResponse();
        Date monday = nextMonday();
        String payload = submissionPayload(
            SlackLeaveApply.APPLY_CALLBACK, null,
            new Map<String, Object>{
                'leave_type' => picked([SELECT Id FROM Leave_Type__c LIMIT 1].Id),
                'from_date' => dated(monday),
                'to_date' => dated(monday.addDays(1)),
                'half_day' => picked('no'),
                'reason' => typed('Wedding')
            },
            STAFF_SLACK_ID
        );

        Test.startTest();
        SlackInteractivityHandler.handle(RestContext.response, payload);
        Assert.areEqual(
            '{}', responseBody(),
            'An empty object is what closes the modal, and it has to be on this response'
        );
        Test.stopTest();

        Leave_Request__c saved = [
            SELECT Days__c, Status__c, Reason__c FROM Leave_Request__c LIMIT 1
        ];
        Assert.areEqual(2, saved.Days__c, 'Monday and Tuesday are two days');
        Assert.areEqual('Wedding', saved.Reason__c, 'The reason should survive the round trip');
        Assert.isTrue(
            mock.saidInAny('chat.postMessage', 'Leave requested'),
            'And the applicant is told once the job runs: ' + mock.allSaidTo('chat.postMessage')
        );
    }

    @isTest
    static void shouldKeepTheModalOpenAndNameTheFieldWhenLeaveIsRefused() {
        mockSlack();
        prepareResponse();
        Date monday = nextMonday();
        String payload = submissionPayload(
            SlackLeaveApply.APPLY_CALLBACK, null,
            new Map<String, Object>{
                'leave_type' => picked([SELECT Id FROM Leave_Type__c LIMIT 1].Id),
                'from_date' => dated(monday.addDays(3)),
                'to_date' => dated(monday),
                'half_day' => picked('no')
            },
            STAFF_SLACK_ID
        );

        Test.startTest();
        SlackInteractivityHandler.handle(RestContext.response, payload);
        Test.stopTest();

        Map<String, Object> answer =
            (Map<String, Object>) JSON.deserializeUntyped(responseBody());
        Assert.areEqual(
            'errors', answer.get('response_action'),
            'The modal stays open so the answer sits next to the question'
        );
        Assert.isTrue(
            ((Map<String, Object>) answer.get('errors')).containsKey('to_date'),
            'And the end date is the field to fix'
        );
        Assert.areEqual(0, [SELECT COUNT() FROM Leave_Request__c], 'Nothing should be written');
    }

    @isTest
    static void shouldOnboardSomebodyAndLinkTheirSlackAccountAfterwards() {
        SlackHttpMock mock = new SlackHttpMock('U0NEWJOIN1');
        Test.setMock(HttpCalloutMock.class, mock);
        prepareResponse();

        String payload = submissionPayload(
            SlackEmployeeModals.ADD_CALLBACK, null,
            new Map<String, Object>{
                'first_name' => typed('Priya'),
                'last_name' => typed('Sharma'),
                'email' => typed('priya.sharma@cloudsheer.test'),
                'joining' => dated(Date.today()),
                'role' => picked('Employee')
            },
            ADMIN_SLACK_ID
        );

        Test.startTest();
        SlackInteractivityHandler.handle(RestContext.response, payload);
        Assert.areEqual('{}', responseBody(), 'The modal closes on success');
        Test.stopTest();

        Employee__c created = [
            SELECT Name, Employee_Code__c, Slack_User_Id__c FROM Employee__c
            WHERE Official_Email__c = 'priya.sharma@cloudsheer.test'
        ];
        Assert.areEqual('Priya Sharma', created.Name, 'The record should exist');
        Assert.areEqual(
            'U0NEWJOIN1', created.Slack_User_Id__c,
            'Linking their Slack account is what onboarding means in a Slack-only product'
        );
        Assert.isFalse(
            mock.bodyOf('chat.postMessage').contains('http'),
            'This app sends no portal link, so none should appear in the confirmation'
        );
    }

    @isTest
    static void shouldOnboardSomebodyEvenWhenSlackHasNobodyAtThatAddress() {
        SlackHttpMock mock = mockSlack();
        prepareResponse();

        String payload = submissionPayload(
            SlackEmployeeModals.ADD_CALLBACK, null,
            new Map<String, Object>{
                'first_name' => typed('Arun'),
                'last_name' => typed('Nair'),
                'email' => typed('arun.nair@cloudsheer.test'),
                'joining' => dated(Date.today())
            },
            ADMIN_SLACK_ID
        );

        Test.startTest();
        SlackInteractivityHandler.handle(RestContext.response, payload);
        Test.stopTest();

        Employee__c created = [
            SELECT Slack_User_Id__c FROM Employee__c
            WHERE Official_Email__c = 'arun.nair@cloudsheer.test'
        ];
        Assert.isNull(
            created.Slack_User_Id__c,
            'Somebody who has not joined the workspace simply stays unlinked'
        );
        Assert.isTrue(
            mock.saidInAny('chat.postMessage', 'Nobody in this workspace'),
            'And the administrator is told rather than left to wonder: ' +
                mock.allSaidTo('chat.postMessage')
        );
    }

    @isTest
    static void shouldCorrectADayAndShowItBack() {
        SlackHttpMock mock = mockSlack();
        prepareResponse();
        Date today = AttendanceRollupService.businessDateOf(System.now());
        String metadata = staffMember().Id + '|' + SlackBlocks.dateText(today);

        String payload = submissionPayload(
            SlackAttendanceAdmin.ADD_PUNCH_CALLBACK, metadata,
            new Map<String, Object>{
                'punch_type' => picked('Check-In'),
                'punch_time' => new Map<String, Object>{ 'selected_time' => '09:15' }
            },
            ADMIN_SLACK_ID
        );

        Test.startTest();
        SlackInteractivityHandler.handle(RestContext.response, payload);
        Test.stopTest();

        Attendance_Punch__c saved = [
            SELECT Punch_DateTime__c, Source__c FROM Attendance_Punch__c LIMIT 1
        ];
        Assert.areEqual(
            '09:15',
            saved.Punch_DateTime__c.format('HH:mm', AttendanceRollupService.businessTimeZoneName()),
            'The picker time should land in the office time zone'
        );
        Assert.isTrue(
            mock.saidInAny('chat.postMessage', 'recalculated'),
            'The admin should be told the day was rebuilt from the punches: ' +
                mock.allSaidTo('chat.postMessage')
        );
    }

    @isTest
    static void shouldRefuseASearchTooShortToBeUseful() {
        mockSlack();
        prepareResponse();

        Test.startTest();
        SlackInteractivityHandler.handle(RestContext.response, submissionPayload(
            SlackEmployeeModals.FIND_CALLBACK, null,
            new Map<String, Object>{ 'term' => typed('a') }, ADMIN_SLACK_ID
        ));
        Test.stopTest();

        Assert.isTrue(
            responseBody().contains('response_action'),
            'One character would match everybody, so the modal stays open'
        );
    }

    @isTest
    static void shouldRunASearchAndSendTheResults() {
        SlackHttpMock mock = mockSlack();
        prepareResponse();

        Test.startTest();
        SlackInteractivityHandler.handle(RestContext.response, submissionPayload(
            SlackEmployeeModals.FIND_CALLBACK, null,
            new Map<String, Object>{ 'term' => typed('Test Employee') }, ADMIN_SLACK_ID
        ));
        Assert.areEqual('{}', responseBody(), 'The modal closes while the search runs');
        Test.stopTest();

        Assert.isTrue(
            mock.saidInAny('chat.postMessage', 'matches'),
            'The results arrive as a message, which works from every surface'
        );
    }

    @isTest
    static void shouldShowAMonthWhenThePickerLeavesTheDayBlank() {
        SlackHttpMock mock = mockSlack();
        prepareResponse();

        Test.startTest();
        SlackInteractivityHandler.handle(RestContext.response, submissionPayload(
            SlackAttendanceAdmin.PICK_CALLBACK, null,
            new Map<String, Object>{ 'employee' => picked(staffMember().Id) },
            ADMIN_SLACK_ID
        ));
        Test.stopTest();

        Assert.isTrue(
            mock.called('chat.postMessage'),
            'A blank day means the month summary, which still has to arrive'
        );
    }

    @isTest
    static void shouldOffboardAndRedrawTheTab() {
        SlackHttpMock mock = mockSlack();
        prepareResponse();
        // Captured first: offboarding clears the Slack link, so looking them up
        // by it afterwards finds nobody, which is the point of the feature.
        Id leaverId = staffMember().Id;

        Test.startTest();
        SlackInteractivityHandler.handle(RestContext.response, submissionPayload(
            SlackEmployeeModals.OFFBOARD_CALLBACK, leaverId,
            new Map<String, Object>{ 'lwd' => dated(Date.today()) }, ADMIN_SLACK_ID
        ));
        Test.stopTest();

        Assert.areEqual(
            'Inactive',
            [SELECT Employee_Status__c FROM Employee__c WHERE Id = :leaverId].Employee_Status__c,
            'The record should be deactivated'
        );
        Assert.isTrue(
            mock.saidInAny('chat.postMessage', 'offboarded'),
            'And the administrator told: ' + mock.allSaidTo('chat.postMessage')
        );
    }

    // ---- deciding --------------------------------------------------------

    @isTest
    static void shouldApproveOnTheFirstPressAndTellBothPeople() {
        SlackHttpMock mock = mockSlack();
        prepareResponse();
        Leave_Request__c request = new Leave_Request__c(
            Employee__c = staffMember().Id,
            Approver__c = [SELECT Id FROM Employee__c WHERE Slack_User_Id__c = :ADMIN_SLACK_ID].Id,
            Leave_Type__c = [SELECT Id FROM Leave_Type__c LIMIT 1].Id,
            From_Date__c = nextMonday(),
            To_Date__c = nextMonday(),
            Days__c = 1,
            Status__c = 'Submitted'
        );
        insert request;

        Test.startTest();
        SlackInteractivityHandler.handle(RestContext.response, JSON.serialize(
            new Map<String, Object>{
                'type' => 'block_actions',
                'user' => new Map<String, Object>{ 'id' => ADMIN_SLACK_ID },
                'response_url' => 'https://hooks.slack.test/replace',
                'actions' => new List<Object>{
                    new Map<String, Object>{
                        'action_id' => 'approve_leave', 'value' => request.Id
                    }
                }
            }
        ));
        // The decision is written in the request that carried the click, so a
        // second press finds it already made rather than appearing to do nothing.
        Assert.areEqual('Approved',
            [SELECT Status__c FROM Leave_Request__c WHERE Id = :request.Id].Status__c,
            'One press is enough');
        Test.stopTest();

        Assert.isTrue(
            mock.saidInAny('hooks.slack.test', 'replace_original'),
            'The buttons have to disappear, or the same request is decided twice: ' +
                String.join(mock.endpoints, ', ')
        );
        Assert.isTrue(
            mock.saidInAny('chat.postMessage', 'approved'),
            'And the person who asked is told: ' + mock.allSaidTo('chat.postMessage')
        );
        Assert.isTrue(
            mock.called('views.publish'),
            'Both tabs moved, so both are redrawn'
        );
    }

    @isTest
    static void shouldTellTheRequesterWhenTheirLeaveIsRejected() {
        SlackHttpMock mock = mockSlack();
        prepareResponse();
        Leave_Request__c request = new Leave_Request__c(
            Employee__c = staffMember().Id,
            Approver__c = [SELECT Id FROM Employee__c WHERE Slack_User_Id__c = :ADMIN_SLACK_ID].Id,
            Leave_Type__c = [SELECT Id FROM Leave_Type__c LIMIT 1].Id,
            From_Date__c = nextMonday(),
            To_Date__c = nextMonday(),
            Days__c = 1,
            Status__c = 'Submitted'
        );
        insert request;

        Test.startTest();
        SlackInteractivityHandler.handle(RestContext.response, JSON.serialize(
            new Map<String, Object>{
                'type' => 'block_actions',
                'user' => new Map<String, Object>{ 'id' => ADMIN_SLACK_ID },
                'response_url' => 'https://hooks.slack.test/replace',
                'actions' => new List<Object>{
                    new Map<String, Object>{
                        'action_id' => 'reject_leave', 'value' => request.Id
                    }
                }
            }
        ));
        Test.stopTest();

        Assert.areEqual('Rejected',
            [SELECT Status__c FROM Leave_Request__c WHERE Id = :request.Id].Status__c,
            'The rejection is recorded');
        Assert.isTrue(
            mock.saidInAny('chat.postMessage', 'rejected'),
            'Being told matters most when the answer is no: ' +
                mock.allSaidTo('chat.postMessage')
        );
    }

    @isTest
    static void shouldSayOnlyTheConfirmationAfterApplyingForLeave() {
        SlackHttpMock mock = mockSlack();
        prepareResponse();
        // A decided request already in their history, which they did not ask to
        // see again while applying for something new.
        insert new Leave_Request__c(
            Employee__c = staffMember().Id,
            Leave_Type__c = [SELECT Id FROM Leave_Type__c LIMIT 1].Id,
            From_Date__c = Date.today().addDays(-30),
            To_Date__c = Date.today().addDays(-30),
            Days__c = 1,
            Status__c = 'Rejected'
        );
        Date monday = nextMonday();

        Test.startTest();
        SlackInteractivityHandler.handle(RestContext.response, submissionPayload(
            SlackLeaveApply.APPLY_CALLBACK, null,
            new Map<String, Object>{
                'leave_type' => picked([SELECT Id FROM Leave_Type__c LIMIT 1].Id),
                'from_date' => dated(monday),
                'to_date' => dated(monday),
                'half_day' => picked('no')
            },
            STAFF_SLACK_ID
        ));
        Test.stopTest();

        Assert.isTrue(
            mock.saidInAny('chat.postMessage', 'Leave requested'),
            'The confirmation is the point: ' + mock.allSaidTo('chat.postMessage')
        );
        Assert.isFalse(
            mock.saidInAny('chat.postMessage', 'Your leave requests'),
            'Their whole history afterwards buries it under something nobody asked for'
        );
    }

    // ---- what it refuses -------------------------------------------------

    @isTest
    static void shouldRefuseAPayloadThatIsNotJson() {
        prepareResponse();

        Test.startTest();
        SlackInteractivityHandler.handle(RestContext.response, 'this is not json');
        Test.stopTest();

        Assert.areEqual(400, RestContext.response.statusCode, 'Unparseable is a bad request');
    }

    @isTest
    static void shouldRefuseAnEmptyPayload() {
        prepareResponse();

        Test.startTest();
        SlackInteractivityHandler.handle(RestContext.response, '');
        Test.stopTest();

        Assert.areEqual(400, RestContext.response.statusCode, 'Nothing to act on');
    }

    @isTest
    static void shouldAcknowledgeAnInteractionItDoesNotHandle() {
        prepareResponse();

        Test.startTest();
        SlackInteractivityHandler.handle(RestContext.response, JSON.serialize(
            new Map<String, Object>{ 'type' => 'shortcut' }
        ));
        Test.stopTest();

        Assert.areEqual(
            200, RestContext.response.statusCode,
            'Refusing would make Slack retry something this app simply does not handle'
        );
    }

    @isTest
    static void shouldIgnoreAButtonFromAnOlderVersionOfTheApp() {
        SlackHttpMock mock = mockSlack();
        prepareResponse();

        Test.startTest();
        SlackInteractivityHandler.handle(
            RestContext.response, buttonPayload('a_button_that_no_longer_exists', 'x', ADMIN_SLACK_ID)
        );
        Test.stopTest();

        Assert.areEqual(200, RestContext.response.statusCode, 'A stale message is not an error');
        Assert.isFalse(mock.called('chat.postMessage'), 'And nothing needs saying about it');
    }
}
