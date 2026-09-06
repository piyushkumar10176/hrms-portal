/**
 * Tests for SlackService. Slack answers HTTP 200 even when it refuses a request,
 * so the important cases are the ones where the body says ok:false.
 */
@isTest
private class SlackServiceTest {
    private class Mock implements HttpCalloutMock {
        private final Integer status;
        private final String body;
        public String capturedBody;
        public String capturedEndpoint;

        public Mock(Integer status, String body) {
            this.status = status;
            this.body = body;
        }

        public HttpResponse respond(HttpRequest request) {
            capturedBody = request.getBody();
            capturedEndpoint = request.getEndpoint();
            HttpResponse response = new HttpResponse();
            response.setStatusCode(status);
            response.setBody(body);
            return response;
        }
    }

    @isTest
    static void shouldSucceed_WhenSlackReturnsOk() {
        Mock mock = new Mock(200, '{"ok":true,"channel":"C123","ts":"1.0"}');
        Test.setMock(HttpCalloutMock.class, mock);

        Test.startTest();
        SlackService.SendResult result =
            SlackService.postMessage('Slack_API', 'C123', 'hello', null);
        Test.stopTest();

        Assert.isTrue(result.success, 'ok:true means the message was posted');
        Assert.isNull(result.errorCode, 'No error code on success');
        Assert.isTrue(mock.capturedEndpoint.contains('callout:Slack_API'),
            'The token must come from the Named Credential');
        Assert.isTrue(mock.capturedEndpoint.endsWith('/api/chat.postMessage'),
            'Posts to chat.postMessage');
    }

    @isTest
    static void shouldFail_WhenSlackReturnsOkFalse() {
        Test.setMock(HttpCalloutMock.class, new Mock(200, '{"ok":false,"error":"channel_not_found"}'));

        Test.startTest();
        SlackService.SendResult result =
            SlackService.postMessage('Slack_API', 'C404', 'hello', null);
        Test.stopTest();

        Assert.isFalse(result.success, 'HTTP 200 with ok:false is still a failure');
        Assert.areEqual('channel_not_found', result.errorCode, 'The Slack error is surfaced');
    }

    @isTest
    static void shouldFail_WhenHttpStatusNotOk() {
        Test.setMock(HttpCalloutMock.class, new Mock(500, 'upstream boom'));

        Test.startTest();
        SlackService.SendResult result =
            SlackService.postMessage('Slack_API', 'C123', 'hello', null);
        Test.stopTest();

        Assert.isFalse(result.success, 'A 500 is a failure');
        Assert.areEqual('http_500', result.errorCode, 'The status code is reported');
    }

    @isTest
    static void shouldNotCallout_WhenConfigurationMissing() {
        Test.startTest();
        SlackService.SendResult noCredential = SlackService.postMessage(null, 'C123', 'hi', null);
        SlackService.SendResult noChannel = SlackService.postMessage('Slack_API', '', 'hi', null);
        Test.stopTest();

        Assert.areEqual('missing_configuration', noCredential.errorCode,
            'A blank named credential is refused before any callout');
        Assert.areEqual('missing_configuration', noChannel.errorCode,
            'A blank channel is refused before any callout');
    }

    @isTest
    static void shouldSendBlocksAsJsonArray() {
        Mock mock = new Mock(200, '{"ok":true}');
        Test.setMock(HttpCalloutMock.class, mock);
        String blocks = '[{"type":"section","text":{"type":"mrkdwn","text":"hi"}}]';

        Test.startTest();
        SlackService.postMessage('Slack_API', 'C123', 'fallback', blocks);
        Test.stopTest();

        Map<String, Object> sent =
            (Map<String, Object>) JSON.deserializeUntyped(mock.capturedBody);
        Assert.isTrue(sent.get('blocks') instanceof List<Object>,
            'Blocks must be sent as a JSON array, not a string');
        Assert.areEqual('fallback', sent.get('text'),
            'Fallback text accompanies the blocks for notifications');
    }

    @isTest
    static void shouldEscapeSlackControlCharacters() {
        Assert.areEqual('a &amp; b', SlackService.escape('a & b'), 'Ampersand is escaped');
        Assert.areEqual('&lt;tag&gt;', SlackService.escape('<tag>'), 'Angle brackets are escaped');
        Assert.areEqual('', SlackService.escape(null), 'Null becomes an empty string');
    }
}
