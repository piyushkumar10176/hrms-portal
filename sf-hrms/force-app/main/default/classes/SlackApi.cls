/**
 * Calls this org starts against Slack.
 *
 * Distinct from replying to a slash command, which needs no token because the
 * response_url Slack supplies is itself the credential. Drawing a Home tab,
 * opening a modal or sending a direct message are all calls we initiate, and
 * those need the bot token.
 *
 * The token comes from the Slack Config protected custom setting rather than
 * the Named Credential, so the Salesforce-native app and the older hosted one
 * can run side by side without sharing one.
 *
 * Slack answers HTTP 200 even when it refuses, so the JSON ok field decides.
 * Nothing here throws: a Slack failure must never take down the work that
 * triggered it.
 */
public with sharing class SlackApi {

    private static final String BASE = 'https://slack.com/api/';
    private static final Integer TIMEOUT_MS = 20000;

    public class Result {
        public Boolean ok;
        public String error;
        public Map<String, Object> body;
        private Result(Boolean ok, String error, Map<String, Object> body) {
            this.ok = ok;
            this.error = error;
            this.body = body;
        }
    }

    private static String botToken() {
        Slack_Config__c config = Slack_Config__c.getOrgDefaults();
        return config == null ? null : config.Bot_Token__c;
    }

    private static Result call(String method, Map<String, Object> payload) {
        String token = botToken();
        if (String.isBlank(token)) {
            System.debug(LoggingLevel.ERROR, method + ' skipped: no bot token configured');
            return new Result(false, 'missing_bot_token', null);
        }

        HttpRequest request = new HttpRequest();
        request.setEndpoint(BASE + method);
        request.setMethod('POST');
        request.setHeader('Authorization', 'Bearer ' + token);
        request.setHeader('Content-Type', 'application/json; charset=utf-8');
        request.setTimeout(TIMEOUT_MS);
        request.setBody(JSON.serialize(payload));

        try {
            HttpResponse response = new Http().send(request);
            if (response.getStatusCode() != 200) {
                return new Result(false, 'http_' + response.getStatusCode(), null);
            }
            Map<String, Object> body =
                (Map<String, Object>) JSON.deserializeUntyped(response.getBody());
            Boolean ok = body.get('ok') == true;
            if (!ok) {
                System.debug(LoggingLevel.WARN, method + ' refused: ' + body.get('error'));
            }
            return new Result(ok, ok ? null : String.valueOf(body.get('error')), body);
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, method + ' failed: ' + e.getMessage());
            return new Result(false, e.getMessage(), null);
        }
    }

    /** Replaces somebody's Home tab. Safe to call on every app_home_opened. */
    public static Result publishHome(String slackUserId, List<Object> blocks) {
        return call('views.publish', new Map<String, Object>{
            'user_id' => slackUserId,
            'view' => new Map<String, Object>{ 'type' => 'home', 'blocks' => blocks }
        });
    }

    /**
     * Opens a modal.
     *
     * The trigger_id is single use and lives about three seconds, so this has to
     * be called on the interaction that produced it, never after awaiting
     * anything slow.
     */
    public static Result openView(String triggerId, Map<String, Object> view) {
        return call('views.open', new Map<String, Object>{
            'trigger_id' => triggerId, 'view' => view
        });
    }

    /** Posts a message. A member id as the channel opens a direct message. */
    public static Result postMessage(String channel, String text, List<Object> blocks) {
        Map<String, Object> payload = new Map<String, Object>{
            'channel' => channel, 'text' => text
        };
        if (blocks != null && !blocks.isEmpty()) {
            payload.put('blocks', blocks);
        }
        return call('chat.postMessage', payload);
    }
}
