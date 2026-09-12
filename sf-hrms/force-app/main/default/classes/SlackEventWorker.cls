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
                return;
            }
            if (type == 'app_home_opened') {
                // The user field is a plain member id on this event, unlike
                // team_join where it is an object.
                refreshHome(String.valueOf(event.get('user')));
            }
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR,
                'Slack event failed: ' + e.getTypeName() + ': ' + e.getMessage());
        }
    }

    /**
     * Redraws somebody's Home tab.
     *
     * Rebuilt on every open rather than cached, so it is never stale. An
     * unlinked account still gets a coherent tab explaining why it is empty.
     */
    public static void refreshHome(String slackUserId) {
        if (String.isBlank(slackUserId)) {
            return;
        }
        Employee__c employee = SlackEmployeeLookup.forSlackUser(slackUserId);
        SlackApi.publishHome(
            slackUserId,
            employee == null ? SlackHomeView.buildUnlinked() : SlackHomeView.build(employee)
        );
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
