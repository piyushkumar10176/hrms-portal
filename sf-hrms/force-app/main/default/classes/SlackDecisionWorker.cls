/**
 * Announces a leave decision that has already been recorded.
 *
 * This used to record the decision as well, and that was the bug. Apex cannot
 * call out once DML has run in the same transaction, so the update succeeded and
 * the message rewrite threw a CalloutException that this class's own catch
 * swallowed. The approver saw a button that did nothing, pressed it again, and
 * the second press reported the decision already made. The deciding now happens
 * in the request that carried the click, and only the talking happens here.
 *
 * Three people need to know, and each by a different route: the approver's
 * message is rewritten in place so the buttons disappear and the same request
 * cannot be decided twice from a message somebody still has open; the person who
 * asked is sent a direct message, because a message written earlier cannot
 * change itself and their own list still reads "Submitted"; and both Home tabs
 * are redrawn, since the balances and the waiting-on-you count have moved.
 */
/**
 * SHARING NOTE
 *
 * This runs as the Salesforce Site guest user, which has no identity of its own.
 * Salesforce forces guest users to private record access whatever the org-wide
 * default says, so "with sharing" here means seeing nothing at all.
 *
 * Identity comes from the signed Slack payload, and the authorisation decision
 * was made explicitly against the employee it named before this was enqueued.
 */
public without sharing class SlackDecisionWorker implements Queueable, Database.AllowsCallouts {

    private final String approverText;
    private final String requesterText;
    private final String requesterSlackId;
    private final String approverSlackId;
    private final String responseUrl;

    public SlackDecisionWorker(
        SlackLeaveDecision.Announcement announcement, String approverSlackId, String responseUrl
    ) {
        this.approverText = announcement.toApprover;
        this.requesterText = announcement.toRequester;
        this.requesterSlackId = announcement.requesterSlackId;
        this.approverSlackId = approverSlackId;
        this.responseUrl = responseUrl;
    }

    public void execute(QueueableContext context) {
        try {
            tellApprover();
            tellRequester();
            redrawTabs();
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR,
                'Announcing a leave decision failed: ' + e.getTypeName() + ': ' + e.getMessage());
        }
    }

    /**
     * Rewrites the message the button was on.
     *
     * replace_original removes the buttons with it. A Home tab press carries no
     * response_url, that channel existing only for messages, so there the
     * outcome is sent directly instead of being dropped.
     */
    private void tellApprover() {
        if (String.isBlank(approverText)) {
            return;
        }
        if (String.isBlank(responseUrl)) {
            SlackApi.postMessage(approverSlackId, approverText, null);
            return;
        }
        HttpRequest request = new HttpRequest();
        request.setEndpoint(responseUrl);
        request.setMethod('POST');
        request.setHeader('Content-Type', 'application/json');
        request.setTimeout(20000);
        request.setBody(JSON.serialize(new Map<String, Object>{
            'replace_original' => true,
            'response_type' => 'ephemeral',
            'text' => approverText,
            'blocks' => new List<Object>{ SlackBlocks.section(approverText) }
        }));
        try {
            HttpResponse response = new Http().send(request);
            if (response.getStatusCode() != 200) {
                System.debug(LoggingLevel.ERROR,
                    'response_url refused: ' + response.getStatusCode());
            }
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'response_url unreachable: ' + e.getMessage());
        }
    }

    private void tellRequester() {
        if (String.isBlank(requesterText) || String.isBlank(requesterSlackId)) {
            return;
        }
        SlackApi.postMessage(requesterSlackId, requesterText, null);
    }

    /** Both tabs are now out of date: one lost a decision, one gained a balance. */
    private void redrawTabs() {
        if (String.isNotBlank(requesterSlackId)) {
            SlackEventWorker.refreshHome(requesterSlackId);
        }
        if (String.isNotBlank(approverSlackId) && approverSlackId != requesterSlackId) {
            SlackEventWorker.refreshHome(approverSlackId);
        }
    }
}
