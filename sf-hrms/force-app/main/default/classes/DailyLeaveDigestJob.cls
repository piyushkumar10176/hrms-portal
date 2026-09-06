/**
 * Posts the daily who-is-out digest to Slack.
 *
 * A Queueable rather than doing the work in the Schedulable, because the
 * callout needs Database.AllowsCallouts and a scheduled context is a poor place
 * to hold an HTTP connection open.
 */
public with sharing class DailyLeaveDigestJob implements Queueable, Database.AllowsCallouts {
    private static final String SETTING_NAME = 'Default';

    @TestVisible
    private static HRMS_Slack_Setting__mdt settingOverride;

    @TestVisible
    private final Date onDate;

    public DailyLeaveDigestJob() {
        this(null);
    }

    /**
     * @param onDate the date to report on, or null for today in the business time zone
     */
    @TestVisible
    private DailyLeaveDigestJob(Date onDate) {
        this.onDate = onDate;
    }

    private static HRMS_Slack_Setting__mdt settings() {
        HRMS_Slack_Setting__mdt setting = settingOverride != null
            ? settingOverride
            : HRMS_Slack_Setting__mdt.getInstance(SETTING_NAME);
        if (setting == null || setting.Enabled__c != true) {
            return null;
        }
        return setting;
    }

    /** Today in the HRMS business time zone, not the running user's. */
    @TestVisible
    private static Date businessToday() {
        String zone = String.isBlank(Label.HRMS_Business_Time_Zone)
            ? 'Asia/Kolkata'
            : Label.HRMS_Business_Time_Zone.trim();
        return Date.valueOf(System.now().format('yyyy-MM-dd', zone));
    }

    public void execute(QueueableContext context) {
        HRMS_Slack_Setting__mdt setting = settings();
        if (setting == null) {
            return;
        }

        String channel = String.isNotBlank(setting.Digest_Channel_Id__c)
            ? setting.Digest_Channel_Id__c
            : setting.HR_Channel_Id__c;
        if (String.isBlank(channel)) {
            System.debug(LoggingLevel.ERROR, 'Leave digest skipped: no digest or HR channel configured.');
            return;
        }

        Date reportDate = onDate != null ? onDate : businessToday();
        List<LeaveDigestService.Absence> absences = LeaveDigestService.absencesOn(reportDate);
        List<Leave_Request__c> pending = LeaveDigestService.pendingRequests();

        String holidayName = null;
        for (Holiday__c holiday : [SELECT Name FROM Holiday__c WHERE Date__c = :reportDate LIMIT 1]) {
            holidayName = holiday.Name;
        }

        String blocks = LeaveDigestService.buildBlocks(reportDate, absences, pending, holidayName);
        String fallback = absences.isEmpty()
            ? 'Nobody is on leave today.'
            : String.valueOf(absences.size()) + ' on leave today.';

        SlackService.SendResult result = SlackService.postMessage(
            setting.Named_Credential__c, channel, fallback, blocks, setting.Workspace_Team_Id__c
        );
        if (!result.success) {
            System.debug(LoggingLevel.ERROR, 'Leave digest post failed: ' + result.errorCode);
        }
    }
}
