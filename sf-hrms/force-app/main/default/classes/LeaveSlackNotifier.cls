/**
 * Sends a Slack message when a leave request is raised or decided.
 *
 * Runs as a Queueable because a trigger cannot make a callout inline. Failures
 * are logged and swallowed: Slack being unreachable must never stop an employee
 * submitting leave. While the HRMS_Slack_Setting__mdt Default record is
 * disabled, nothing is enqueued at all.
 */
public with sharing class LeaveSlackNotifier implements Queueable, Database.AllowsCallouts {
    private static final String SETTING_NAME = 'Default';

    private final Set<Id> leaveRequestIds;
    private final Boolean isNew;

    @TestVisible
    private LeaveSlackNotifier(Set<Id> leaveRequestIds, Boolean isNew) {
        this.leaveRequestIds = leaveRequestIds;
        this.isNew = isNew;
    }

    /**
     * Test seam. Custom Metadata cannot be inserted in a test, so the enabled
     * path is unreachable without this override.
     */
    @TestVisible
    private static HRMS_Slack_Setting__mdt settingOverride;

    /** Returns the Default settings record, or null when it is absent or disabled. */
    @TestVisible
    private static HRMS_Slack_Setting__mdt settings() {
        HRMS_Slack_Setting__mdt setting = settingOverride != null
            ? settingOverride
            : HRMS_Slack_Setting__mdt.getInstance(SETTING_NAME);
        if (setting == null || setting.Enabled__c != true) {
            return null;
        }
        return setting;
    }

    /**
     * Queues Slack notifications for the given requests.
     *
     * @param leaveRequestIds the requests to announce
     * @param isNew true for a newly submitted request, false for a status decision
     */
    public static void enqueue(Set<Id> leaveRequestIds, Boolean isNew) {
        if (leaveRequestIds == null || leaveRequestIds.isEmpty()) {
            return;
        }
        if (settings() == null) {
            return;
        }
        // A Queueable cannot be chained from a batch or from another queueable in
        // some contexts, and tests do not allow enqueuing inside a callout mock.
        if (System.isBatch() || System.isFuture()) {
            return;
        }
        System.enqueueJob(new LeaveSlackNotifier(leaveRequestIds, isNew));
    }

    public void execute(QueueableContext context) {
        HRMS_Slack_Setting__mdt setting = settings();
        if (setting == null) {
            return;
        }

        List<Leave_Request__c> requests = [
            SELECT Id, Name, Status__c, From_Date__c, To_Date__c, Days__c, Half_Day__c, Reason__c,
                   Employee__c, Employee__r.Name, Employee__r.Slack_User_Id__c,
                   Employee__r.Department__c, Employee__r.Designation__c,
                   Approver__c, Approver__r.Name, Approver__r.Slack_User_Id__c,
                   Leave_Type__r.Name
            FROM Leave_Request__c
            WHERE Id IN :leaveRequestIds
        ];
        if (requests.isEmpty()) {
            return;
        }

        List<String> hrRecipients = resolveHrRecipients(setting);

        for (Leave_Request__c request : requests) {
            String blocks = buildBlocks(request, isNew);
            String fallback = buildFallback(request, isNew);

            Set<String> targets = new Set<String>();
            if (isNew) {
                if (setting.Notify_Manager__c == true
                    && String.isNotBlank(request.Approver__r?.Slack_User_Id__c)) {
                    targets.add(request.Approver__r.Slack_User_Id__c);
                }
                if (setting.Notify_HR__c == true) {
                    targets.addAll(hrRecipients);
                }
            } else {
                // A decision goes back to the employee who asked.
                if (String.isNotBlank(request.Employee__r?.Slack_User_Id__c)) {
                    targets.add(request.Employee__r.Slack_User_Id__c);
                }
            }

            for (String target : targets) {
                SlackService.SendResult result =
                    SlackService.postMessage(setting.Named_Credential__c, target, fallback, blocks);
                if (!result.success) {
                    System.debug(
                        LoggingLevel.ERROR,
                        'Slack notify failed for ' + request.Name + ' -> ' + target +
                        ' : ' + result.errorCode
                    );
                }
            }
        }
    }

    /**
     * HR recipients: the configured channel when set, otherwise a direct message
     * to each active HR employee who has a Slack id.
     */
    private static List<String> resolveHrRecipients(HRMS_Slack_Setting__mdt setting) {
        if (String.isNotBlank(setting.HR_Channel_Id__c)) {
            return new List<String>{ setting.HR_Channel_Id__c };
        }
        String department = String.isBlank(setting.HR_Department_Name__c)
            ? 'HR'
            : setting.HR_Department_Name__c;

        List<String> recipients = new List<String>();
        for (Employee__c employee : [
            SELECT Slack_User_Id__c
            FROM Employee__c
            WHERE Department__c = :department
              AND Employee_Status__c = 'Active'
              AND Slack_User_Id__c != NULL
        ]) {
            recipients.add(employee.Slack_User_Id__c);
        }
        return recipients;
    }

    @TestVisible
    private static String buildFallback(Leave_Request__c request, Boolean isNew) {
        String employeeName = request.Employee__r == null ? 'An employee' : request.Employee__r.Name;
        if (isNew) {
            return employeeName + ' applied for ' + leaveTypeName(request) +
                   ' from ' + request.From_Date__c + ' to ' + request.To_Date__c;
        }
        return 'Your ' + leaveTypeName(request) + ' request is ' + request.Status__c;
    }

    private static String leaveTypeName(Leave_Request__c request) {
        return request.Leave_Type__r == null ? 'leave' : request.Leave_Type__r.Name;
    }

    /**
     * Block Kit payload. Kept well inside Slack's 50-block message ceiling.
     */
    @TestVisible
    private static String buildBlocks(Leave_Request__c request, Boolean isNew) {
        String employeeName = SlackService.escape(
            request.Employee__r == null ? 'Unknown' : request.Employee__r.Name
        );
        String heading = isNew
            ? ':palm_tree:  New leave request'
            : ':white_check_mark:  Leave request ' + request.Status__c;

        List<Object> blocks = new List<Object>();
        blocks.add(new Map<String, Object>{
            'type' => 'header',
            'text' => new Map<String, Object>{ 'type' => 'plain_text', 'text' => heading }
        });

        List<Object> fields = new List<Object>();
        fields.add(mrkdwn('*Employee*\n' + employeeName));
        fields.add(mrkdwn('*Leave type*\n' + SlackService.escape(leaveTypeName(request))));
        fields.add(mrkdwn('*From*\n' + String.valueOf(request.From_Date__c)));
        fields.add(mrkdwn('*To*\n' + String.valueOf(request.To_Date__c)));
        fields.add(mrkdwn('*Days*\n' + String.valueOf(request.Days__c) +
            (request.Half_Day__c == true ? ' (half day)' : '')));
        fields.add(mrkdwn('*Status*\n' + SlackService.escape(request.Status__c)));

        blocks.add(new Map<String, Object>{ 'type' => 'section', 'fields' => fields });

        if (String.isNotBlank(request.Reason__c)) {
            blocks.add(new Map<String, Object>{
                'type' => 'section',
                'text' => mrkdwn('*Reason*\n' + SlackService.escape(request.Reason__c))
            });
        }

        blocks.add(new Map<String, Object>{
            'type' => 'context',
            'elements' => new List<Object>{
                mrkdwn('Request ' + request.Name +
                    (request.Approver__r == null
                        ? ''
                        : '  |  Approver: ' + SlackService.escape(request.Approver__r.Name)))
            }
        });

        return JSON.serialize(blocks);
    }

    private static Map<String, Object> mrkdwn(String text) {
        return new Map<String, Object>{ 'type' => 'mrkdwn', 'text' => text };
    }
}
