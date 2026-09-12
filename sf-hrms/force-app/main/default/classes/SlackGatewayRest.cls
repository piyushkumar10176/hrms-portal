/**
 * The public endpoint Slack calls.
 *
 * This is the whole point of the Apex rewrite: Slack talks to Salesforce
 * directly, with nothing hosted anywhere else. It is reached through a
 * Salesforce Site, which means it is open to the internet, so the first thing it
 * does and the only thing it trusts is the request signature.
 *
 * The three second rule shapes everything here. Slack gives up after three
 * seconds and shows the user an error, so this method must answer inside that
 * budget whatever the work turns out to be. Anything that might take longer is
 * handed to a Queueable and the answer is posted afterwards to the response_url
 * Slack supplies, which stays valid for thirty minutes.
 *
 * Runs without sharing deliberately. The guest user that reaches this owns
 * nothing and can see nothing; the employee whose request this is has already
 * been identified from the Slack member id, and every authorisation decision is
 * made against that employee rather than against the guest.
 */
@RestResource(urlMapping='/slack/*')
global without sharing class SlackGatewayRest {

    /** Slack never sends anything but POST. */
    @HttpPost
    global static void handle() {
        Long startedAt = System.currentTimeMillis();
        RestRequest request = RestContext.request;
        RestResponse response = RestContext.response;
        response.addHeader('Content-Type', 'application/json');

        try {
            Slack_Config__c config = Slack_Config__c.getOrgDefaults();

            if (config == null || config.Gateway_Enabled__c != true) {
                // Inert until deliberately switched on, so deploying the class
                // does not by itself open a public door.
                reply(response, 503, '{"error":"gateway_disabled"}');
                return;
            }

            String rawBody = request.requestBody == null
                ? null
                : request.requestBody.toString();

            SlackRequestVerifier.Verdict verdict = SlackRequestVerifier.verify(
                rawBody,
                header(request, 'X-Slack-Signature'),
                header(request, 'X-Slack-Request-Timestamp'),
                config.Signing_Secret__c
            );

            if (!verdict.ok) {
                System.debug(LoggingLevel.WARN, 'Slack request refused: ' + verdict.reason);
                reply(response, 401, '{"error":"unauthorized"}');
                return;
            }

            route(request, response, rawBody, startedAt);

        } catch (Exception e) {
            // A 500 makes Slack retry, which would repeat whatever half happened.
            // Answering 200 with an apology stops the retry and keeps the error
            // where an engineer can see it rather than the whole workspace.
            System.debug(LoggingLevel.ERROR,
                'Slack gateway failed: ' + e.getTypeName() + ': ' + e.getMessage()
                + '\n' + e.getStackTraceString());
            reply(response, 200,
                '{"response_type":"ephemeral","text":"Something went wrong reaching Salesforce. Please try again."}');
        }
    }

    /** Sends the request to the right handler based on the path Slack called. */
    private static void route(
        RestRequest request, RestResponse response, String rawBody, Long startedAt
    ) {
        String path = request.requestURI == null ? '' : request.requestURI.toLowerCase();

        if (path.endsWith('/events')) {
            handleEvent(response, rawBody);
            return;
        }
        if (path.endsWith('/interactivity')) {
            SlackInteractivityHandler.handle(response, rawBody);
            return;
        }
        if (path.endsWith('/commands')) {
            SlackCommandHandler.handle(response, SlackRequestVerifier.parseForm(rawBody), startedAt);
            return;
        }
        reply(response, 404, '{"error":"unknown_endpoint"}');
    }

    /**
     * The Events API.
     *
     * Slack proves it owns this URL by asking for a challenge to be echoed back,
     * and that exchange happens before any event is ever delivered.
     */
    private static void handleEvent(RestResponse response, String rawBody) {
        Map<String, Object> payload =
            (Map<String, Object>) JSON.deserializeUntyped(rawBody);

        if (payload.get('type') == 'url_verification') {
            reply(response, 200, JSON.serialize(
                new Map<String, Object>{ 'challenge' => payload.get('challenge') }
            ));
            return;
        }

        Map<String, Object> event = (Map<String, Object>) payload.get('event');
        if (event != null) {
            SlackEventHandler.enqueue(event);
        }
        // Acknowledged immediately. Slack redelivers anything not answered
        // within three seconds, and a retry storm is worse than a missed redraw.
        reply(response, 200, '{"ok":true}');
    }

    private static String header(RestRequest request, String name) {
        if (request.headers == null) {
            return null;
        }
        // Header names arrive with inconsistent casing depending on the proxy.
        for (String key : request.headers.keySet()) {
            if (key.equalsIgnoreCase(name)) {
                return request.headers.get(key);
            }
        }
        return null;
    }

    private static void reply(RestResponse response, Integer status, String body) {
        response.statusCode = status;
        response.responseBody = Blob.valueOf(body);
    }
}
