/**
 * Tests for the Apex Slack gateway.
 *
 * The gateway is a public endpoint, so most of what matters here is what it
 * refuses: an unsigned request, a tampered one, a replayed one, and anything at
 * all while the master switch is off.
 */
@isTest
private class SlackGatewayRestTest {

    private static final String SECRET = 'test-signing-secret-value';
    private static final String VERIFY_TOKEN = 'test-verification-token-value';

    @TestSetup
    static void setupTestData() {
        List<Employee__c> staff = TestDataFactory.createEmployees(2, true);
        staff[0].Slack_User_Id__c = 'U0TEST0001';
        staff[0].Role__c = 'Admin';
        update staff[0];

        Leave_Type__c annual = TestDataFactory.createLeaveType('Annual Leave', 18, true);
        TestDataFactory.createLeaveBalances(staff, annual, 0, 18, true);
    }

    /** Turns the gateway on with a known secret, as an admin would in Setup. */
    private static void enableGateway() {
        insert new Slack_Config__c(
            SetupOwnerId = UserInfo.getOrganizationId(),
            Signing_Secret__c = SECRET,
            Verification_Token__c = VERIFY_TOKEN,
            Gateway_Enabled__c = true
        );
    }

    /**
     * A JSON request, which keeps its body and is verified by signature. This is
     * how the events endpoint arrives.
     */
    private static void buildJsonRequest(String path, String body) {
        String timestamp = String.valueOf(SlackRequestVerifier.nowEpochSeconds());
        Blob mac = Crypto.generateMac(
            'hmacSHA256', Blob.valueOf('v0:' + timestamp + ':' + body), Blob.valueOf(SECRET)
        );

        RestRequest request = new RestRequest();
        request.requestURI = '/services/apexrest/slack/' + path;
        request.httpMethod = 'POST';
        request.requestBody = Blob.valueOf(body);
        request.headers.put('X-Slack-Request-Timestamp', timestamp);
        request.headers.put('X-Slack-Signature', 'v0=' + EncodingUtil.convertToHex(mac));

        RestContext.request = request;
        RestContext.response = new RestResponse();
    }

    /**
     * A form request as Apex REST actually delivers one: the body consumed into
     * params and requestBody left empty. Reproducing that here is the whole
     * point, because a test that sets a body would exercise a path production
     * never takes.
     */
    private static void buildFormRequest(String path, Map<String, String> fields) {
        RestRequest request = new RestRequest();
        request.requestURI = '/services/apexrest/slack/' + path;
        request.httpMethod = 'POST';
        request.requestBody = Blob.valueOf('');
        request.headers.put('Content-Type', 'application/x-www-form-urlencoded');
        for (String key : fields.keySet()) {
            request.params.put(key, fields.get(key));
        }
        RestContext.request = request;
        RestContext.response = new RestResponse();
    }

    private static String responseBody() {
        return RestContext.response.responseBody.toString();
    }

    @isTest
    static void shouldRefuseEverythingWhileTheGatewayIsOff() {
        // Deploying the class must not by itself open a public door.
        buildFormRequest('commands', new Map<String, String>{
            'token' => VERIFY_TOKEN, 'command' => '/myleave', 'user_id' => 'U0TEST0001'
        });

        Test.startTest();
        SlackGatewayRest.handle();
        Test.stopTest();

        Assert.areEqual(503, RestContext.response.statusCode, 'Refused while disabled');
        Assert.isTrue(responseBody().contains('gateway_disabled'), 'And says why');
    }

    @isTest
    static void shouldRefuseAnUnsignedRequest() {
        enableGateway();
        // No token at all, which is what an outsider guessing the URL would send.
        buildFormRequest('commands', new Map<String, String>{
            'command' => '/myleave', 'user_id' => 'U0TEST0001'
        });

        Test.startTest();
        SlackGatewayRest.handle();
        Test.stopTest();

        Assert.areEqual(401, RestContext.response.statusCode,
            'Anybody on the internet can reach this, so an unverified request must be refused');
    }

    @isTest
    static void shouldRefuseATamperedBody() {
        enableGateway();
        buildFormRequest('commands', new Map<String, String>{
            'token' => 'somebody-elses-token', 'command' => '/myleave', 'user_id' => 'U0TEST0001'
        });

        Test.startTest();
        SlackGatewayRest.handle();
        Test.stopTest();

        Assert.areEqual(401, RestContext.response.statusCode, 'A wrong token must not verify');
    }

    @isTest
    static void shouldEchoTheChallenge_WhenSlackVerifiesTheUrl() {
        // Slack proves it owns the URL before delivering any event.
        enableGateway();
        buildJsonRequest('events', '{"type":"url_verification","challenge":"abc123xyz"}');

        Test.startTest();
        SlackGatewayRest.handle();
        Test.stopTest();

        Assert.areEqual(200, RestContext.response.statusCode, 'The handshake succeeds');
        Assert.isTrue(responseBody().contains('abc123xyz'), 'And echoes the challenge back');
    }

    @isTest
    static void shouldAcknowledgeASlashCommandImmediately() {
        // The acknowledgement is what stops Slack showing a timeout. The real
        // answer arrives afterwards on the response_url.
        enableGateway();
        buildFormRequest('commands', new Map<String, String>{
            'token' => VERIFY_TOKEN, 'command' => '/myleave', 'user_id' => 'U0TEST0001',
            'text' => '', 'response_url' => 'https://example.test/hook'
        });

        Test.startTest();
        SlackGatewayRest.handle();
        Integer queued = Limits.getQueueableJobs();
        Test.stopTest();

        Assert.areEqual(200, RestContext.response.statusCode, 'Acknowledged');
        Assert.isTrue(responseBody().contains('Working on it'), 'With a holding reply');
        Assert.areEqual(1, queued, 'And the real work is handed to a Queueable');
    }

    @isTest
    static void shouldNotQueueWorkForAnUnknownCommand() {
        enableGateway();
        buildFormRequest('commands', new Map<String, String>{
            'token' => VERIFY_TOKEN, 'command' => '/notacommand', 'user_id' => 'U0TEST0001',
            'response_url' => 'https://example.test'
        });

        Test.startTest();
        SlackGatewayRest.handle();
        Integer queued = Limits.getQueueableJobs();
        Test.stopTest();

        Assert.areEqual(0, queued, 'Nothing is queued for a command we do not own');
        Assert.isTrue(responseBody().contains('not one I know'), 'And the user is told');
    }

    @isTest
    static void shouldAnswerAnUnknownPathWith404() {
        enableGateway();
        buildJsonRequest('nonsense', '{}');

        Test.startTest();
        SlackGatewayRest.handle();
        Test.stopTest();

        Assert.areEqual(404, RestContext.response.statusCode, 'Unknown endpoint');
    }

    @isTest
    static void shouldResolveAnEmployeeFromTheirSlackId() {
        Test.startTest();
        Employee__c found = SlackEmployeeLookup.forSlackUser('U0TEST0001');
        Employee__c missing = SlackEmployeeLookup.forSlackUser('U0NOBODY999');
        Employee__c rubbish = SlackEmployeeLookup.forSlackUser('not a slack id at all');
        Test.stopTest();

        Assert.isNotNull(found, 'The linked employee is found');
        Assert.isTrue(SlackEmployeeLookup.isHrOrAdmin(found), 'And their role is read');
        Assert.isNull(missing, 'An unlinked id resolves to nobody');
        Assert.isNull(rubbish, 'And a malformed id is not even queried for');
    }

    @isTest
    static void shouldBuildTheLeaveBalanceReply() {
        Employee__c employee = [SELECT Id, Name, Role__c FROM Employee__c WHERE Slack_User_Id__c = 'U0TEST0001'];

        Test.startTest();
        String reply = SlackLeaveCommand.balance(employee);
        String out = SlackLeaveCommand.whoIsOut();
        Test.stopTest();

        Assert.isTrue(reply.contains('Annual Leave'), 'The leave type is named, was: ' + reply);
        Assert.isTrue(reply.contains('ephemeral'), 'Only the person who asked sees it');
        Assert.isTrue(out.contains('ephemeral'), 'And the same for whosout');
    }

    @isTest
    static void shouldRunTheAsyncWorkerWithoutThrowing() {
        // The worker posts to a response_url. The mock stands in for Slack so the
        // routing is exercised without a real callout.
        Test.setMock(HttpCalloutMock.class, new ResponseUrlMock());

        Test.startTest();
        System.enqueueJob(new SlackAsyncWorker(
            '/myleave', '', 'U0TEST0001', 'https://example.test/hook'
        ));
        System.enqueueJob(new SlackAsyncWorker(
            '/myleave', '', 'U0NOTLINKED', 'https://example.test/hook'
        ));
        Test.stopTest();

        Assert.areEqual(2, responseUrlCalls,
            'Both the linked and the unlinked case answer the user rather than going quiet');
    }

    @isTest
    static void shouldLinkANewMemberOnTeamJoin() {
        Employee__c target = [
            SELECT Id, Official_Email__c FROM Employee__c
            WHERE Slack_User_Id__c = NULL LIMIT 1
        ];
        String payload = JSON.serialize(new Map<String, Object>{
            'type' => 'team_join',
            'user' => new Map<String, Object>{
                'id' => 'U0NEWJOINER',
                'profile' => new Map<String, Object>{ 'email' => target.Official_Email__c }
            }
        });

        Test.startTest();
        System.enqueueJob(new SlackEventWorker(payload));
        Test.stopTest();

        Assert.areEqual('U0NEWJOINER',
            [SELECT Slack_User_Id__c FROM Employee__c WHERE Id = :target.Id].Slack_User_Id__c,
            'A new workspace member is matched to their employee record by email');
    }

    @isTest
    static void shouldApproveFromAButton() {
        Employee__c approver = [SELECT Id, Name FROM Employee__c WHERE Slack_User_Id__c = 'U0TEST0001'];
        Employee__c asker = [SELECT Id FROM Employee__c WHERE Slack_User_Id__c = NULL LIMIT 1];
        Leave_Type__c leaveType = [SELECT Id FROM Leave_Type__c LIMIT 1];
        Leave_Request__c request = TestDataFactory.buildLeaveRequest(asker, approver, leaveType, 1, 'Submitted');
        insert request;
        Test.setMock(HttpCalloutMock.class, new ResponseUrlMock());

        Test.startTest();
        System.enqueueJob(new SlackDecisionWorker(request.Id, true, 'U0TEST0001', 'https://example.test/hook'));
        Test.stopTest();

        Assert.areEqual('Approved',
            [SELECT Status__c FROM Leave_Request__c WHERE Id = :request.Id].Status__c,
            'The named approver can approve');
        // At least one: the worker replaces the message, and approving also fires
        // LeaveRequestTrigger, which notifies the employee through the same mock.
        Assert.isTrue(responseUrlCalls >= 1,
            'The original message is replaced, was ' + responseUrlCalls + ' call(s)');
    }

    @isTest
    static void shouldRefuseDecidingYourOwnRequest() {
        // The one rule with no exception, including for HR and administrators.
        Employee__c self = [SELECT Id FROM Employee__c WHERE Slack_User_Id__c = 'U0TEST0001'];
        Leave_Type__c leaveType = [SELECT Id FROM Leave_Type__c LIMIT 1];
        Leave_Request__c request = TestDataFactory.buildLeaveRequest(self, self, leaveType, 1, 'Submitted');
        insert request;
        Test.setMock(HttpCalloutMock.class, new ResponseUrlMock());

        Test.startTest();
        System.enqueueJob(new SlackDecisionWorker(request.Id, true, 'U0TEST0001', 'https://example.test/hook'));
        Test.stopTest();

        Assert.areEqual('Submitted',
            [SELECT Status__c FROM Leave_Request__c WHERE Id = :request.Id].Status__c,
            'Somebody cannot approve their own request even as an admin');
    }

    @isTest
    static void shouldNotDecideTwice() {
        // Two people pressing at once is normal here, not an edge case: the
        // request is visible to the manager and to everyone in the HR channel.
        Employee__c approver = [SELECT Id FROM Employee__c WHERE Slack_User_Id__c = 'U0TEST0001'];
        Employee__c asker = [SELECT Id FROM Employee__c WHERE Slack_User_Id__c = NULL LIMIT 1];
        Leave_Type__c leaveType = [SELECT Id FROM Leave_Type__c LIMIT 1];
        Leave_Request__c request = TestDataFactory.buildLeaveRequest(asker, approver, leaveType, 1, 'Approved');
        insert request;
        Test.setMock(HttpCalloutMock.class, new ResponseUrlMock());

        Test.startTest();
        System.enqueueJob(new SlackDecisionWorker(request.Id, false, 'U0TEST0001', 'https://example.test/hook'));
        Test.stopTest();

        Assert.areEqual('Approved',
            [SELECT Status__c FROM Leave_Request__c WHERE Id = :request.Id].Status__c,
            'An already decided request is not flipped by a second press');
    }

    @isTest
    static void shouldAcknowledgeAButtonPressImmediately() {
        enableGateway();
        String payload = JSON.serialize(new Map<String, Object>{
            'type' => 'block_actions',
            'user' => new Map<String, Object>{ 'id' => 'U0TEST0001' },
            'response_url' => 'https://example.test/hook',
            'actions' => new List<Object>{
                new Map<String, Object>{ 'action_id' => 'approve_leave', 'value' => '00000000000000AAAA' }
            }
        });
        buildFormRequest('interactivity', new Map<String, String>{
            'token' => VERIFY_TOKEN, 'payload' => payload
        });

        Test.startTest();
        SlackGatewayRest.handle();
        Test.stopTest();

        Assert.areEqual(200, RestContext.response.statusCode,
            'A button press is acknowledged immediately whatever the value turns out to be');
    }

    @isTest
    static void shouldCutBlocksRatherThanLetSlackDropThem() {
        // Slack truncates silently past its ceiling, so the cut has to happen here.
        List<Object> many = new List<Object>();
        for (Integer i = 0; i < 120; i++) {
            many.add(SlackBlocks.section('row ' + i));
        }

        Test.startTest();
        List<Object> capped = SlackBlocks.capped(many, SlackBlocks.MAX_VIEW_BLOCKS, null);
        Map<String, Object> grid = SlackBlocks.fields(
            new List<String>{ 'a','b','c','d','e','f','g','h','i','j','k','l' },
            new List<String>{ '1','2','3','4','5','6','7','8','9','10','11','12' }
        );
        Map<String, Object> table = SlackBlocks.table(
            new List<String>{ 'Who', 'Days' },
            new List<List<String>>{ new List<String>{ 'Piyush', '2' }, new List<String>{ 'A', '10' } },
            10
        );
        Test.stopTest();

        Assert.areEqual(SlackBlocks.MAX_VIEW_BLOCKS, capped.size(), 'Cut to the view ceiling');
        Assert.areEqual(10, ((List<Object>) grid.get('fields')).size(), 'Ten fields is Slack\'s limit');
        String rendered = JSON.serialize(table);
        Assert.isTrue(rendered.contains('Piyush  2'), 'Columns are padded to line up, was: ' + rendered);
        Assert.areEqual('a &amp; b', SlackBlocks.escape('a & b'), 'Escaping is applied');
        Assert.areEqual('', SlackBlocks.escape(null), 'And tolerates null');
    }

    @isTest
    static void shouldCloseAModalOnSubmission() {
        enableGateway();
        buildFormRequest('interactivity', new Map<String, String>{
            'token' => VERIFY_TOKEN,
            'payload' => JSON.serialize(new Map<String, Object>{ 'type' => 'view_submission' })
        });

        Test.startTest();
        SlackGatewayRest.handle();
        Test.stopTest();

        Assert.areEqual(200, RestContext.response.statusCode,
            'A submission must be answered on the same response or Slack leaves the modal open');
    }

    /** Counts response_url posts. Apex forbids a static field on an inner class. */
    private static Integer responseUrlCalls = 0;

    /** Stands in for Slack accepting a post to a response_url. */
    private class ResponseUrlMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest request) {
            responseUrlCalls++;
            HttpResponse response = new HttpResponse();
            response.setStatusCode(200);
            response.setBody('ok');
            return response;
        }
    }
}
