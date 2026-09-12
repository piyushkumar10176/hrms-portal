/**
 * Approving and rejecting from a Slack button.
 *
 * The decision runs here rather than in the request that carried the click,
 * because Apex cannot call out after DML in the same transaction and the
 * message has to be rewritten once the record has changed. Slack is
 * acknowledged first, then the work happens, then the message is replaced.
 *
 * Who may decide is re-checked here, never inferred from the button. A button's
 * action and value come from the client, so they are a convenience and never the
 * authorisation boundary.
 */
/**
 * SHARING NOTE
 *
 * This runs as the Salesforce Site guest user, which has no identity of its own.
 * Salesforce forces guest users to private record access whatever the org-wide
 * default says, so "with sharing" here means seeing nothing at all, and the Home
 * tab renders as if nobody is linked.
 *
 * Identity comes from the signed Slack payload, and every authorisation decision
 * is made explicitly against the employee it names. Record sharing for the guest
 * is therefore meaningless rather than protective.
 */
public without sharing class SlackDecisionWorker implements Queueable, Database.AllowsCallouts {

    private final Id requestId;
    private final Boolean approving;
    private final String slackUserId;
    private final String responseUrl;

    public SlackDecisionWorker(Id requestId, Boolean approving, String slackUserId, String responseUrl) {
        this.requestId = requestId;
        this.approving = approving;
        this.slackUserId = slackUserId;
        this.responseUrl = responseUrl;
    }

    public void execute(QueueableContext context) {
        try {
            Employee__c actor = SlackEmployeeLookup.forSlackUser(slackUserId);
            if (actor == null) {
                replace(':no_entry: Your Slack account is not linked to an employee record.');
                return;
            }
            replace(decide(actor));
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR,
                'Slack decision failed: ' + e.getTypeName() + ': ' + e.getMessage());
            replace(':warning: Something went wrong recording that decision. Nothing was changed.');
        }
    }

    /**
     * Records the decision, or explains why it cannot be made.
     *
     * @return the text that replaces the original message
     */
    private String decide(Employee__c actor) {
        List<Leave_Request__c> found = [
            SELECT Id, Name, Status__c, Employee__c, Employee__r.Name, Approver__c,
                   Leave_Type__r.Name, From_Date__c, To_Date__c, Days__c
            FROM Leave_Request__c
            WHERE Id = :requestId
            LIMIT 1
        ];
        if (found.isEmpty()) {
            return ':grey_question: That request no longer exists.';
        }
        Leave_Request__c request = found[0];

        // Already decided. Two people pressing at once is the normal case here,
        // not an edge case, because the request is visible to both the manager
        // and everyone in the HR channel.
        if (request.Status__c != 'Submitted') {
            return ':information_source: Already *' + request.Status__c.toLowerCase() +
                   '*. Nothing was changed.';
        }

        // The one rule with no exception, including for HR and administrators.
        if (request.Employee__c == actor.Id) {
            return ':no_entry: You cannot decide your own request.';
        }

        Boolean isApprover = request.Approver__c == actor.Id;
        Boolean isOverride = !isApprover && SlackEmployeeLookup.isHrOrAdmin(actor);
        if (!isApprover && !isOverride) {
            return ':no_entry: You are not the approver for that request.';
        }

        request.Status__c = approving ? 'Approved' : 'Rejected';
        // The trigger recalculates the balance and notifies the employee, so
        // nothing of that belongs here.
        update request;

        String who = SlackBlocks.escape(
            request.Employee__r == null ? 'the employee' : request.Employee__r.Name
        );
        String decision = approving ? ':white_check_mark: *Approved*' : ':x: *Rejected*';
        String leaveType = request.Leave_Type__r == null ? 'leave' : request.Leave_Type__r.Name;

        return decision + '  ·  ' + who + '\n' +
               leaveType + ', ' + SlackBlocks.dateText(request.From_Date__c) +
               ' to ' + SlackBlocks.dateText(request.To_Date__c) +
               '  ·  ' + request.Days__c + ' day' + (request.Days__c == 1 ? '' : 's') +
               '\n_Decided by ' + SlackBlocks.escape(actor.Name) +
               (isOverride ? ' on behalf of the approver' : '') + '._';
    }

    /**
     * Rewrites the original message.
     *
     * replace_original removes the buttons along with it, so the same request
     * cannot be decided twice from a message somebody still has open.
     */
    private void replace(String text) {
        if (String.isBlank(responseUrl)) {
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
            'text' => text,
            'blocks' => new List<Object>{ SlackBlocks.section(text) }
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
}
