/**
 * Thin wrapper over the Slack Web API.
 *
 * The bot token lives in a Named Credential, never in code or metadata. Passing a
 * Slack member id as `channel` opens a direct message, so the same call serves
 * both channel posts and DMs.
 *
 * Slack answers HTTP 200 even when it refuses the request, so the JSON `ok`
 * field is what decides success.
 */
public with sharing class SlackService {
    private static final String POST_MESSAGE_PATH = '/api/chat.postMessage';
    private static final Integer TIMEOUT_MS = 20000;

    public class SlackException extends Exception {}

    /** Outcome of a single postMessage call. */
    public class SendResult {
        public Boolean success;
        public String channel;
        public String errorCode;

        public SendResult(Boolean success, String channel, String errorCode) {
            this.success = success;
            this.channel = channel;
            this.errorCode = errorCode;
        }
    }

    /**
     * Posts a Block Kit message.
     *
     * @param namedCredential developer name of the Named Credential holding the bot token
     * @param channel a channel id, or a member id to open a direct message
     * @param fallbackText plain text shown in notifications and by clients that cannot render blocks
     * @param blocksJson a JSON array of Block Kit blocks, or null for a plain text message
     * @return the outcome; never throws for a Slack-level refusal
     */
    public static SendResult postMessage(
        String namedCredential,
        String channel,
        String fallbackText,
        String blocksJson
    ) {
        if (String.isBlank(namedCredential) || String.isBlank(channel)) {
            return new SendResult(false, channel, 'missing_configuration');
        }

        Map<String, Object> payload = new Map<String, Object>{
            'channel' => channel,
            'text' => fallbackText
        };
        if (String.isNotBlank(blocksJson)) {
            payload.put('blocks', (List<Object>) JSON.deserializeUntyped(blocksJson));
        }

        HttpRequest request = new HttpRequest();
        request.setEndpoint('callout:' + namedCredential + POST_MESSAGE_PATH);
        request.setMethod('POST');
        request.setHeader('Content-Type', 'application/json; charset=utf-8');
        request.setTimeout(TIMEOUT_MS);
        request.setBody(JSON.serialize(payload));

        try {
            HttpResponse response = new Http().send(request);
            if (response.getStatusCode() != 200) {
                return new SendResult(false, channel, 'http_' + response.getStatusCode());
            }
            Map<String, Object> body =
                (Map<String, Object>) JSON.deserializeUntyped(response.getBody());
            Boolean ok = body.get('ok') == true;
            String error = ok ? null : String.valueOf(body.get('error'));
            return new SendResult(ok, channel, error);
        } catch (Exception e) {
            return new SendResult(false, channel, e.getTypeName() + ': ' + e.getMessage());
        }
    }

    /** Escapes the three characters Slack requires escaping inside message text. */
    public static String escape(String value) {
        if (String.isBlank(value)) {
            return '';
        }
        return value.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;');
    }
}
