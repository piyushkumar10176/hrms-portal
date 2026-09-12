/**
 * Proves a request really came from Slack.
 *
 * Slack signs every request it sends. The signature is an HMAC-SHA256 over
 * "v0:{timestamp}:{raw body}" keyed with the app's signing secret. Verifying it
 * is the only thing standing between this endpoint and anybody on the internet,
 * because the endpoint has to be publicly reachable for Slack to call it at all.
 *
 * Two rules beyond the signature itself:
 *
 *   The raw body must be used exactly as received. Re-serialising the form or
 *   the JSON changes the bytes and the digest stops matching.
 *
 *   Anything older than five minutes is refused, so a signature captured off the
 *   wire cannot be replayed later.
 *
 * Verified against Slack's own published test vector in SlackRequestVerifierTest.
 */
public with sharing class SlackRequestVerifier {

    /** How old a request may be before it is treated as a replay. */
    private static final Long MAX_AGE_SECONDS = 300;
    private static final String VERSION = 'v0';

    public class Verdict {
        @TestVisible public Boolean ok { get; private set; }
        @TestVisible public String reason { get; private set; }
        private Verdict(Boolean ok, String reason) {
            this.ok = ok;
            this.reason = reason;
        }
    }

    private static Verdict pass() {
        return new Verdict(true, null);
    }
    private static Verdict fail(String reason) {
        return new Verdict(false, reason);
    }

    /**
     * @param rawBody the request body exactly as received, never re-serialised
     * @param signature the X-Slack-Signature header
     * @param timestamp the X-Slack-Request-Timestamp header
     * @param signingSecret the app's signing secret
     * @param nowEpochSeconds current time, passed in so tests can pin it
     */
    public static Verdict verify(
        String rawBody,
        String signature,
        String timestamp,
        String signingSecret,
        Long nowEpochSeconds
    ) {
        if (String.isBlank(signingSecret)) {
            return fail('no_signing_secret_configured');
        }
        if (String.isBlank(signature) || String.isBlank(timestamp)) {
            return fail('missing_signature_headers');
        }
        if (rawBody == null) {
            return fail('missing_body');
        }

        Long sent;
        try {
            sent = Long.valueOf(timestamp);
        } catch (Exception e) {
            return fail('unparseable_timestamp');
        }

        Long age = Math.abs(nowEpochSeconds - sent);
        if (age > MAX_AGE_SECONDS) {
            return fail('stale_request');
        }

        String base = VERSION + ':' + timestamp + ':' + rawBody;
        Blob mac = Crypto.generateMac(
            'hmacSHA256',
            Blob.valueOf(base),
            Blob.valueOf(signingSecret)
        );
        String expected = VERSION + '=' + EncodingUtil.convertToHex(mac);

        return constantTimeEquals(expected, signature)
            ? pass()
            : fail('signature_mismatch');
    }

    public static Verdict verify(
        String rawBody, String signature, String timestamp, String signingSecret
    ) {
        return verify(rawBody, signature, timestamp, signingSecret, nowEpochSeconds());
    }

    /** Seconds since the epoch, which is the clock Slack signs against. */
    public static Long nowEpochSeconds() {
        return System.currentTimeMillis() / 1000;
    }

    /**
     * Compares without leaking where two values first differ.
     *
     * A comparison that stops at the first mismatched character takes measurably
     * longer the more leading characters are right, which is enough to recover a
     * valid signature one character at a time. Every character is compared here
     * whatever happens.
     */
    @TestVisible
    private static Boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null) {
            return false;
        }
        // Length is compared up front. It is not secret, and comparing unequal
        // lengths character by character would read past the end.
        if (a.length() != b.length()) {
            return false;
        }
        Integer difference = 0;
        for (Integer i = 0; i < a.length(); i++) {
            difference |= (a.charAt(i) ^ b.charAt(i));
        }
        return difference == 0;
    }

    /**
     * Parses an application/x-www-form-urlencoded body, which is what Slack
     * sends for slash commands and for the interactivity payload wrapper.
     */
    public static Map<String, String> parseForm(String rawBody) {
        Map<String, String> values = new Map<String, String>();
        if (String.isBlank(rawBody)) {
            return values;
        }
        for (String pair : rawBody.split('&')) {
            Integer split = pair.indexOf('=');
            if (split < 0) {
                continue;
            }
            String key = pair.substring(0, split);
            String value = pair.substring(split + 1);
            try {
                values.put(
                    EncodingUtil.urlDecode(key, 'UTF-8'),
                    EncodingUtil.urlDecode(value, 'UTF-8')
                );
            } catch (Exception e) {
                // A malformed pair is skipped rather than failing the request,
                // which would turn one bad field into a dead command.
                continue;
            }
        }
        return values;
    }
}
