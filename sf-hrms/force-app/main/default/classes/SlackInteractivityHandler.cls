/**
 * Buttons and modal submissions.
 *
 * Tighter than a slash command. Slack decides whether to keep or close a modal
 * from what comes back on this very response, so a submission is answered here
 * rather than later. A button is acknowledged immediately and the work handed
 * to a Queueable, because Apex cannot call out after DML in the same
 * transaction and the message has to be rewritten once the record has changed.
 */
public inherited sharing class SlackInteractivityHandler {

    public static void handle(RestResponse response, String raw) {
        if (String.isBlank(raw)) {
            reply(response, 400, '{"error":"no_payload"}');
            return;
        }

        Map<String, Object> payload;
        try {
            payload = (Map<String, Object>) JSON.deserializeUntyped(raw);
        } catch (Exception e) {
            reply(response, 400, '{"error":"bad_payload"}');
            return;
        }

        String type = String.valueOf(payload.get('type'));

        if (type == 'view_submission') {
            // An empty object closes the modal. Validation errors would name the
            // blocks at fault instead, and both have to be on this response.
            reply(response, 200, '{}');
            return;
        }

        if (type == 'block_actions') {
            handleButton(response, payload);
            return;
        }

        // Anything else is acknowledged rather than refused, so Slack does not
        // retry something this app simply does not handle.
        reply(response, 200, '');
    }

    private static void handleButton(RestResponse response, Map<String, Object> payload) {
        List<Object> actions = (List<Object>) payload.get('actions');
        if (actions == null || actions.isEmpty()) {
            reply(response, 200, '');
            return;
        }

        Map<String, Object> action = (Map<String, Object>) actions[0];
        String actionId = String.valueOf(action.get('action_id'));
        String value = String.valueOf(action.get('value'));
        Map<String, Object> user = (Map<String, Object>) payload.get('user');
        String slackUserId = user == null ? null : String.valueOf(user.get('id'));
        String responseUrl = String.valueOf(payload.get('response_url'));

        if (actionId == 'approve_leave' || actionId == 'reject_leave') {
            Id requestId = asId(value);
            if (requestId == null) {
                reply(response, 200, SlackBlocks.ephemeral('That request could not be identified.'));
                return;
            }
            System.enqueueJob(new SlackDecisionWorker(
                requestId, actionId == 'approve_leave', slackUserId, responseUrl
            ));
            // Acknowledged with an empty body so Slack leaves the message alone;
            // the worker replaces it once the decision is recorded.
            reply(response, 200, '');
            return;
        }

        reply(response, 200, '');
    }

    /** A button value is supplied by the client, so it is never trusted as an id. */
    private static Id asId(String value) {
        if (String.isBlank(value)) {
            return null;
        }
        try {
            Id parsed = Id.valueOf(value);
            return parsed.getSobjectType() == Leave_Request__c.SObjectType ? parsed : null;
        } catch (Exception e) {
            return null;
        }
    }

    private static void reply(RestResponse response, Integer status, String body) {
        response.statusCode = status;
        response.responseBody = Blob.valueOf(body);
    }
}
