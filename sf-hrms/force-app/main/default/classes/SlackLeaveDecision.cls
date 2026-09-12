/**
 * Approving and rejecting a leave request.
 *
 * The decision runs in the request that carried the click, not in a job
 * afterwards, and that placement is the whole point of this class existing.
 * Apex cannot call out once DML has run in the same transaction, so a worker
 * that both recorded the decision and rewrote the Slack message could only do
 * the first: the callout threw, its own catch swallowed it, and the approver saw
 * a button that appeared to do nothing. They pressed it again, and the second
 * press correctly reported the decision already made. Deciding here and
 * announcing afterwards removes that shape entirely.
 *
 * Who may decide comes from one place. The named approver may. HR and admin may
 * decide anything, so cover is never blocked by a manager being away. Nobody may
 * decide their own request, and that rule has no exception, including for HR.
 */
public inherited sharing class SlackLeaveDecision {

    /** What to say, and to whom, once the decision is recorded. */
    public class Announcement {
        /** Replaces the approver's message, or is sent to them directly. */
        public String toApprover;
        /** Sent to the person who asked. Null when there is nothing to tell them. */
        public String toRequester;
        public String requesterSlackId;
        public Boolean changedAnything;

        private Announcement(String toApprover, String toRequester, String requesterSlackId, Boolean changed) {
            this.toApprover = toApprover;
            this.toRequester = toRequester;
            this.requesterSlackId = requesterSlackId;
            this.changedAnything = changed;
        }
    }

    private static Announcement onlyApprover(String text) {
        return new Announcement(text, null, null, false);
    }

    /**
     * Records a decision.
     *
     * @param requestId the request, already proven to be one
     * @param approving true to approve, false to reject
     * @param actor the employee behind the Slack account that pressed the button
     */
    public static Announcement decide(Id requestId, Boolean approving, Employee__c actor) {
        List<Leave_Request__c> found = [
            SELECT Id, Name, Status__c, Employee__c, Employee__r.Name,
                   Employee__r.Slack_User_Id__c, Approver__c,
                   Leave_Type__r.Name, From_Date__c, To_Date__c, Days__c
            FROM Leave_Request__c
            WHERE Id = :requestId
            LIMIT 1
        ];
        if (found.isEmpty()) {
            return onlyApprover(':grey_question: That request no longer exists.');
        }
        Leave_Request__c request = found[0];

        // Already decided. Two people pressing at once is the ordinary case
        // here, not an edge case, because a request is visible to the manager
        // and to everyone in the HR channel at the same time.
        if (request.Status__c != 'Submitted') {
            return onlyApprover(
                ':information_source: Already *' + request.Status__c.toLowerCase() +
                '*. Nothing was changed.'
            );
        }
        if (request.Employee__c == actor.Id) {
            return onlyApprover(':no_entry: You cannot decide your own request.');
        }

        Boolean isApprover = request.Approver__c == actor.Id;
        Boolean isOverride = !isApprover && SlackAuthz.isHrOrAdmin(actor);
        if (!isApprover && !isOverride) {
            return onlyApprover(':no_entry: You are not the approver for that request.');
        }

        try {
            // The trigger recalculates the balance from here, so none of that
            // belongs in this class.
            update new Leave_Request__c(
                Id = requestId, Status__c = approving ? 'Approved' : 'Rejected'
            );
        } catch (DmlException e) {
            return onlyApprover(
                ':warning: Salesforce refused that decision: ' + e.getDmlMessage(0)
            );
        }

        return new Announcement(
            forApprover(request, actor, approving, isOverride),
            forRequester(request, approving),
            request.Employee__r?.Slack_User_Id__c,
            true
        );
    }

    private static String forApprover(
        Leave_Request__c request, Employee__c actor, Boolean approving, Boolean isOverride
    ) {
        return (approving ? ':white_check_mark: *Approved*' : ':x: *Rejected*') + '  ·  ' +
            SlackBlocks.escape(
                request.Employee__r == null ? 'the employee' : request.Employee__r.Name
            ) + '\n' + describe(request) +
            '\n_Decided by ' + SlackBlocks.escape(actor.Name) +
            (isOverride ? ' on behalf of the approver' : '') + '._';
    }

    /**
     * The message the person who asked receives.
     *
     * Sent because a Slack message written earlier cannot change itself: their
     * own list still reads "Submitted" with a cancel button on it, and without
     * this they would have no way of learning otherwise until they asked again.
     */
    private static String forRequester(Leave_Request__c request, Boolean approving) {
        if (String.isBlank(request.Employee__r?.Slack_User_Id__c)) {
            return null;
        }
        return (approving
            ? ':white_check_mark: Your leave has been *approved*.'
            : ':x: Your leave request was *rejected*.') + '\n' + describe(request) +
            (approving
                ? ''
                : '\nSpeak to your approver if you think that is wrong. You can apply again ' +
                  'from the Home tab.');
    }

    private static String describe(Leave_Request__c request) {
        return (request.Leave_Type__r == null ? 'Leave' : request.Leave_Type__r.Name) +
            ', ' + SlackBlocks.dateText(request.From_Date__c) +
            ' to ' + SlackBlocks.dateText(request.To_Date__c) +
            '  ·  ' + request.Days__c + ' day' + (request.Days__c == 1 ? '' : 's');
    }
}
