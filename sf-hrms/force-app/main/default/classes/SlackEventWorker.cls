/**
 * Handles a Slack event after its acknowledgement has gone.
 *
 * team_join is the one that matters today: it links a new workspace member to
 * their employee record by email, which is otherwise a manual step nobody
 * remembers until somebody reports receiving nothing.
 */
public with sharing class SlackEventWorker implements Queueable, Database.AllowsCallouts {

    private final String payload;

    public SlackEventWorker(String payload) {
        this.payload = payload;
    }

    public void execute(QueueableContext context) {
        try {
            Map<String, Object> event = (Map<String, Object>) JSON.deserializeUntyped(payload);
            String type = String.valueOf(event.get('type'));

            if (type == 'team_join') {
                linkNewMember((Map<String, Object>) event.get('user'));
            }
            // app_home_opened draws the Home tab, which arrives with the port of
            // the Home view. Acknowledged already, so nothing is retried.
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR,
                'Slack event failed: ' + e.getTypeName() + ': ' + e.getMessage());
        }
    }

    /** Matches a new member to an employee by email and records the id. */
    private void linkNewMember(Map<String, Object> user) {
        if (user == null || user.get('is_bot') == true || user.get('deleted') == true) {
            return;
        }
        String slackUserId = String.valueOf(user.get('id'));
        Map<String, Object> profile = (Map<String, Object>) user.get('profile');
        String email = profile == null ? null : String.valueOf(profile.get('email'));

        if (String.isBlank(slackUserId) || String.isBlank(email) || email == 'null') {
            System.debug(LoggingLevel.WARN,
                'team_join carried no email. Grant the app users:read.email to link automatically.');
            return;
        }

        List<Employee__c> matches = [
            SELECT Id, Name, Slack_User_Id__c FROM Employee__c
            WHERE Official_Email__c = :email.toLowerCase()
              AND Employee_Status__c = 'Active'
            LIMIT 1
        ];
        if (matches.isEmpty() || matches[0].Slack_User_Id__c == slackUserId) {
            return;
        }
        matches[0].Slack_User_Id__c = slackUserId;
        update matches[0];
        System.debug(LoggingLevel.INFO, 'Linked ' + matches[0].Name + ' to ' + slackUserId);
    }
}
