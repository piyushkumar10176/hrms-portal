/**
 * Slash commands.
 *
 * The pattern every command follows is forced by Slack's three second budget:
 * acknowledge now, work afterwards. The acknowledgement is what stops Slack
 * showing the user a timeout, and the real answer is posted to the response_url
 * that came with the request, which stays usable for thirty minutes.
 *
 * Anything that can be answered from memory is answered inline instead, because
 * a reply that arrives instantly reads better than one that arrives twice.
 */
public with sharing class SlackCommandHandler {

    /** Commands the gateway knows. Anything else gets the help text. */
    private static final Set<String> KNOWN = new Set<String>{
        '/myleave', '/attendance', '/approvals', '/whosout', '/regularize', '/hrdash'
    };

    public static void handle(RestResponse response, Map<String, String> form, Long startedAt) {
        String command = (form.get('command') ?? '').toLowerCase();
        String slackUserId = form.get('user_id');
        String responseUrl = form.get('response_url');
        String text = (form.get('text') ?? '').trim().toLowerCase();

        if (!KNOWN.contains(command)) {
            reply(response, SlackBlocks.ephemeral(
                'That command is not one I know. Try `/myleave`, `/attendance`, ' +
                '`/approvals`, `/whosout` or `/regularize`.'
            ));
            return;
        }

        if (String.isBlank(slackUserId) || String.isBlank(responseUrl)) {
            reply(response, SlackBlocks.ephemeral('That request was missing something Slack usually sends.'));
            return;
        }

        // Hand the work off and answer immediately. Queueable is enqueued inside
        // this transaction and runs after it commits, so the acknowledgement is
        // not waiting on a query or a callout.
        System.enqueueJob(new SlackAsyncWorker(command, text, slackUserId, responseUrl));

        Long elapsed = System.currentTimeMillis() - startedAt;
        System.debug(LoggingLevel.INFO, 'Slack ' + command + ' acknowledged in ' + elapsed + 'ms');

        reply(response, SlackBlocks.ephemeral(':hourglass_flowing_sand: Working on it…'));
    }

    private static void reply(RestResponse response, String body) {
        response.statusCode = 200;
        response.responseBody = Blob.valueOf(body);
    }
}
