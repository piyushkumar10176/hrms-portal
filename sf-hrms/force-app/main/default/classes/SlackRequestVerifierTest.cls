/**
 * Tests for SlackRequestVerifier.
 *
 * The positive case uses Slack's own published example, so a passing test means
 * this agrees with Slack rather than merely agreeing with itself.
 */
@isTest
private class SlackRequestVerifierTest {

    // Slack's documented example request and its expected signature.
    private static final String SECRET = '8f742231b10e8888abcd99yyyzzz85a5';
    private static final String TIMESTAMP = '1531420618';
    private static final String BODY =
        'token=xyzz0WbapA4vBCDEFasx0q6G&team_id=T1DC2JH3J&team_domain=testteamnow' +
        '&channel_id=G8PSS9T3V&channel_name=foobar&user_id=U2CERLKJA&user_name=roadrunner' +
        '&command=%2Fwebhook-collect&text=&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands' +
        '%2FT1DC2JH3J%2F397700885554%2F96rGlfmibIGlgcZRskXaIFfN' +
        '&trigger_id=398738663015.47445629121.803a0bc887a14d10d2c447fce8b6703c';
    private static final String SIGNATURE =
        'v0=a2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503';

    /** The moment Slack signed that example, so the age check passes. */
    private static Long signedAt() {
        return Long.valueOf(TIMESTAMP);
    }

    @isTest
    static void shouldAcceptSlacksOwnExample() {
        Test.startTest();
        SlackRequestVerifier.Verdict verdict =
            SlackRequestVerifier.verify(BODY, SIGNATURE, TIMESTAMP, SECRET, signedAt());
        Test.stopTest();

        Assert.isTrue(verdict.ok, 'Slack\'s published vector must verify, was: ' + verdict.reason);
    }

    @isTest
    static void shouldRefuseATamperedBody() {
        // One character changed. The whole point of signing is that this fails.
        String tampered = BODY.replace('roadrunner', 'roadrunnes');

        Test.startTest();
        SlackRequestVerifier.Verdict verdict =
            SlackRequestVerifier.verify(tampered, SIGNATURE, TIMESTAMP, SECRET, signedAt());
        Test.stopTest();

        Assert.isFalse(verdict.ok, 'A changed body must not verify');
        Assert.areEqual('signature_mismatch', verdict.reason, 'Refused for the right reason');
    }

    @isTest
    static void shouldRefuseTheWrongSecret() {
        Test.startTest();
        SlackRequestVerifier.Verdict verdict =
            SlackRequestVerifier.verify(BODY, SIGNATURE, TIMESTAMP, 'not-the-secret', signedAt());
        Test.stopTest();

        Assert.isFalse(verdict.ok, 'Another app\'s secret must not verify');
    }

    @isTest
    static void shouldRefuseAReplayedRequest() {
        // A valid signature captured off the wire and sent again an hour later.
        Test.startTest();
        SlackRequestVerifier.Verdict verdict = SlackRequestVerifier.verify(
            BODY, SIGNATURE, TIMESTAMP, SECRET, signedAt() + 3600
        );
        Test.stopTest();

        Assert.isFalse(verdict.ok, 'An hour-old request must be refused');
        Assert.areEqual('stale_request', verdict.reason, 'Refused as a replay');
    }

    @isTest
    static void shouldAcceptInsideTheFiveMinuteWindow() {
        Test.startTest();
        SlackRequestVerifier.Verdict verdict = SlackRequestVerifier.verify(
            BODY, SIGNATURE, TIMESTAMP, SECRET, signedAt() + 299
        );
        Test.stopTest();

        Assert.isTrue(verdict.ok, 'Just inside five minutes is still fresh');
    }

    @isTest
    static void shouldRefuseWhatIsMissing() {
        Long now = signedAt();
        Test.startTest();
        Assert.areEqual('no_signing_secret_configured',
            SlackRequestVerifier.verify(BODY, SIGNATURE, TIMESTAMP, null, now).reason,
            'An unconfigured secret must refuse rather than accept everything');
        Assert.areEqual('missing_signature_headers',
            SlackRequestVerifier.verify(BODY, null, TIMESTAMP, SECRET, now).reason,
            'No signature header');
        Assert.areEqual('missing_signature_headers',
            SlackRequestVerifier.verify(BODY, SIGNATURE, null, SECRET, now).reason,
            'No timestamp header');
        Assert.areEqual('missing_body',
            SlackRequestVerifier.verify(null, SIGNATURE, TIMESTAMP, SECRET, now).reason,
            'No body');
        Assert.areEqual('unparseable_timestamp',
            SlackRequestVerifier.verify(BODY, SIGNATURE, 'not-a-number', SECRET, now).reason,
            'A timestamp that is not a number');
        Test.stopTest();
    }

    @isTest
    static void shouldCompareWithoutShortCircuiting() {
        Test.startTest();
        Assert.isTrue(SlackRequestVerifier.constantTimeEquals('abc123', 'abc123'), 'Equal matches');
        Assert.isFalse(SlackRequestVerifier.constantTimeEquals('abc123', 'abc124'), 'Last character differs');
        Assert.isFalse(SlackRequestVerifier.constantTimeEquals('abc123', 'zbc123'), 'First character differs');
        Assert.isFalse(SlackRequestVerifier.constantTimeEquals('abc', 'abcd'), 'Different lengths');
        Assert.isFalse(SlackRequestVerifier.constantTimeEquals(null, 'abc'), 'Null is never equal');
        Assert.isFalse(SlackRequestVerifier.constantTimeEquals('abc', null), 'Null is never equal');
        Test.stopTest();
    }

    @isTest
    static void shouldParseWhatSlackPostsForASlashCommand() {
        Test.startTest();
        Map<String, String> form = SlackRequestVerifier.parseForm(BODY);
        Test.stopTest();

        Assert.areEqual('/webhook-collect', form.get('command'), 'The command is url decoded');
        Assert.areEqual('U2CERLKJA', form.get('user_id'), 'The member id is who typed it');
        Assert.areEqual('', form.get('text'), 'An empty argument stays empty rather than missing');
        Assert.isTrue(
            form.get('response_url').startsWith('https://hooks.slack.com/'),
            'The response url is decoded back to a usable address'
        );
    }

    @isTest
    static void shouldSurviveAMalformedForm() {
        Test.startTest();
        Map<String, String> form = SlackRequestVerifier.parseForm('a=1&broken&b=2&=&c=3');
        Test.stopTest();

        Assert.areEqual('1', form.get('a'), 'Good pairs before the bad one survive');
        Assert.areEqual('3', form.get('c'), 'And after it');
        Assert.areEqual(0, SlackRequestVerifier.parseForm(null).size(), 'Null body is empty, not an error');
        Assert.areEqual(0, SlackRequestVerifier.parseForm('').size(), 'Empty body is empty');
    }
}
