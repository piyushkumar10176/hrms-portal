/**
 * Buttons and modal submissions.
 *
 * Tighter than a slash command. A modal must be opened with the trigger_id
 * inside about three seconds of the click and the token is single use, so that
 * callout happens inline rather than being handed to a Queueable. A modal
 * submission must also be answered on the same response, because Slack decides
 * whether to close or keep the modal from what comes back.
 */
public with sharing class SlackInteractivityHandler {

    public static void handle(RestResponse response, String rawBody) {
        Map<String, String> form = SlackRequestVerifier.parseForm(rawBody);
        String raw = form.get('payload');
        if (String.isBlank(raw)) {
            reply(response, 400, '{"error":"no_payload"}');
            return;
        }

        Map<String, Object> payload = (Map<String, Object>) JSON.deserializeUntyped(raw);
        String type = String.valueOf(payload.get('type'));

        if (type == 'view_submission') {
            // An empty object closes the modal. Validation errors would name the
            // offending blocks instead, and both must be on this response.
            reply(response, 200, '{}');
            return;
        }

        reply(response, 200, '');
    }

    private static void reply(RestResponse response, Integer status, String body) {
        response.statusCode = status;
        response.responseBody = Blob.valueOf(body);
    }
}
