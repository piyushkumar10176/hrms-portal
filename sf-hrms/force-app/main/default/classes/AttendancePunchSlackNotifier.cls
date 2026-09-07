/**
 * Direct messages an employee in Slack when a clock-in or clock-out is recorded.
 *
 * A punch reaches Salesforce from three places: the web portal, a biometric
 * device pushing to the API, and the Slack command itself. The first two used to
 * be silent, so the only confirmation an employee ever saw was on the screen they
 * had just clocked in from. Notifying from the trigger covers all three sources
 * at once, because every source writes the same Attendance_Punch__c row.
 *
 * Slack-sourced punches are deliberately skipped: the slash command already
 * answers the person who typed it, and a direct message on top of that reply
 * would say the same thing twice.
 *
 * Runs as a Queueable because a trigger cannot call out inline. Failures are
 * logged and swallowed: Slack being unreachable must never stop a punch being
 * recorded.
 */
public with sharing class AttendancePunchSlackNotifier implements Queueable, Database.AllowsCallouts {
    private static final String SETTING_NAME = 'Default';
    private static final String SOURCE_SLACK = 'Slack';

    private final Set<Id> punchIds;

    /**
     * Test seam. Custom Metadata cannot be inserted in a test, so the enabled
     * path is unreachable without this override.
     */
    @TestVisible
    private static HRMS_Slack_Setting__mdt settingOverride;

    @TestVisible
    private AttendancePunchSlackNotifier(Set<Id> punchIds) {
        this.punchIds = punchIds;
    }

    /** Returns the Default settings record, or null when punch notices are off. */
    @TestVisible
    private static HRMS_Slack_Setting__mdt settings() {
        HRMS_Slack_Setting__mdt setting = settingOverride != null
            ? settingOverride
            : HRMS_Slack_Setting__mdt.getInstance(SETTING_NAME);
        if (setting == null || setting.Enabled__c != true || setting.Notify_Punch__c != true) {
            return null;
        }
        return setting;
    }

    /**
     * Queues a direct message for each punch that did not come from Slack.
     *
     * @param punches newly inserted punches, typically Trigger.new
     */
    public static void enqueue(List<Attendance_Punch__c> punches) {
        if (punches == null || punches.isEmpty() || settings() == null) {
            return;
        }
        if (System.isBatch() || System.isFuture() || System.isQueueable()) {
            return;
        }

        Set<Id> candidates = new Set<Id>();
        for (Attendance_Punch__c punch : punches) {
            if (punch.Id == null || punch.Employee__c == null || punch.Punch_DateTime__c == null) {
                continue;
            }
            if (SOURCE_SLACK.equalsIgnoreCase(punch.Source__c)) {
                continue;
            }
            candidates.add(punch.Id);
        }
        if (candidates.isEmpty()) {
            return;
        }
        System.enqueueJob(new AttendancePunchSlackNotifier(candidates));
    }

    public void execute(QueueableContext context) {
        HRMS_Slack_Setting__mdt setting = settings();
        if (setting == null) {
            return;
        }

        List<Attendance_Punch__c> punches = [
            SELECT Id, Punch_DateTime__c, Punch_Type__c, Source__c,
                   Employee__c, Employee__r.Name, Employee__r.Employee_Code__c,
                   Employee__r.Slack_User_Id__c
            FROM Attendance_Punch__c
            WHERE Id IN :punchIds
            ORDER BY Punch_DateTime__c ASC
        ];
        if (punches.isEmpty()) {
            return;
        }

        Map<String, Attendance__c> dayByKey = loadDays(punches);

        for (Attendance_Punch__c punch : punches) {
            String slackUserId = punch.Employee__r?.Slack_User_Id__c;
            if (String.isBlank(slackUserId)) {
                // Nothing to notify to. Employees are linked to Slack ids by the
                // mapping script; an unlinked one simply gets no message.
                continue;
            }

            Attendance__c day = dayByKey.get(
                dayKey(punch.Employee__c, AttendanceRollupService.businessDateOf(punch.Punch_DateTime__c))
            );

            SlackService.SendResult result = SlackService.postMessage(
                setting.Named_Credential__c,
                slackUserId,
                buildFallback(punch),
                buildBlocks(punch, day),
                setting.Workspace_Team_Id__c
            );
            if (!result.success) {
                System.debug(
                    LoggingLevel.ERROR,
                    'Slack punch notify failed for ' + punch.Id + ' -> ' +
                    slackUserId + ' : ' + result.errorCode
                );
            }
        }
    }

    /**
     * Loads the rolled-up Attendance__c row behind each punch so a clock-out can
     * report the day's totals. The rollup runs in the same transaction as the
     * insert, so by the time this Queueable executes the row is committed.
     */
    private static Map<String, Attendance__c> loadDays(List<Attendance_Punch__c> punches) {
        Set<Id> employeeIds = new Set<Id>();
        Set<Date> dates = new Set<Date>();
        for (Attendance_Punch__c punch : punches) {
            employeeIds.add(punch.Employee__c);
            dates.add(AttendanceRollupService.businessDateOf(punch.Punch_DateTime__c));
        }

        Map<String, Attendance__c> dayByKey = new Map<String, Attendance__c>();
        for (Attendance__c day : [
            SELECT Id, Employee__c, Date__c, Check_In__c, Check_Out__c,
                   Total_Hours__c, Gross_Hours__c, Break_Minutes__c,
                   Late_By_Minutes__c, Status__c, Penalty__c, Penalty_Reason__c
            FROM Attendance__c
            WHERE Employee__c IN :employeeIds
              AND Date__c IN :dates
        ]) {
            dayByKey.put(dayKey(day.Employee__c, day.Date__c), day);
        }
        return dayByKey;
    }

    private static String dayKey(Id employeeId, Date businessDate) {
        return String.valueOf(employeeId) + '|' + String.valueOf(businessDate);
    }

    @TestVisible
    private static String buildFallback(Attendance_Punch__c punch) {
        return employeeName(punch) +
               (isCheckIn(punch) ? ' clocked in at ' : ' clocked out at ') +
               punchTime(punch);
    }

    /** The name on the punch, for messages that must say whose punch this is. */
    private static String employeeName(Attendance_Punch__c punch) {
        return punch.Employee__r == null || String.isBlank(punch.Employee__r.Name)
            ? 'Unknown employee'
            : punch.Employee__r.Name;
    }

    private static String employeeCode(Attendance_Punch__c punch) {
        return punch.Employee__r == null ? null : punch.Employee__r.Employee_Code__c;
    }

    /**
     * Block Kit payload: one confirmation block, plus the day so far on a
     * clock-out so the employee can see break and effective hours without
     * opening the portal.
     */
    @TestVisible
    private static String buildBlocks(Attendance_Punch__c punch, Attendance__c day) {
        Boolean checkIn = isCheckIn(punch);

        List<Object> blocks = new List<Object>();
        blocks.add(new Map<String, Object>{
            'type' => 'section',
            'text' => mrkdwn(
                (checkIn ? ':large_green_circle:  ' : ':red_circle:  ') +
                '*' + SlackService.escape(employeeName(punch)) + '*' +
                (checkIn ? ' clocked in at *' : ' clocked out at *') +
                punchTime(punch) + '*'
            )
        });

        if (day != null) {
            List<Object> fields = dayFields(day);
            if (!fields.isEmpty()) {
                blocks.add(new Map<String, Object>{ 'type' => 'section', 'fields' => fields });
            }
            // A breach is only worth raising on the way out; part way through the
            // day it is not yet a breach, only an incomplete one.
            if (!checkIn && day.Penalty__c == true && String.isNotBlank(day.Penalty_Reason__c)) {
                blocks.add(new Map<String, Object>{
                    'type' => 'section',
                    'text' => mrkdwn(':warning:  *Flagged:* ' + SlackService.escape(day.Penalty_Reason__c))
                });
            }
        }

        blocks.add(new Map<String, Object>{
            'type' => 'context',
            'elements' => new List<Object>{
                mrkdwn(
                    (String.isBlank(employeeCode(punch))
                        ? ''
                        : SlackService.escape(employeeCode(punch)) + '  |  ') +
                    'Recorded from ' + SlackService.escape(
                        String.isBlank(punch.Source__c) ? 'an unnamed source' : punch.Source__c
                    ) + '  |  `/attendance today` for the full log'
                )
            }
        });

        return JSON.serialize(blocks);
    }

    /** The day so far, as Block Kit fields: clock times, break and effective hours. */
    private static List<Object> dayFields(Attendance__c day) {
        List<Object> fields = new List<Object>();
        if (day.Check_In__c != null) {
            fields.add(mrkdwn('*First clock-in*\n' + timeText(day.Check_In__c)));
        }
        if (day.Check_Out__c != null) {
            fields.add(mrkdwn('*Last clock-out*\n' + timeText(day.Check_Out__c)));
        }
        if (day.Break_Minutes__c != null) {
            fields.add(mrkdwn('*Break so far*\n' + breakText(day.Break_Minutes__c)));
        }
        if (day.Total_Hours__c != null) {
            fields.add(mrkdwn(
                '*Effective hours*\n' + day.Total_Hours__c.setScale(2) +
                ' of ' + AttendanceRollupService.minimumEffectiveHours()
            ));
        }
        return fields;
    }

    /** Break taken, flagged when it has run past the allowance. */
    private static String breakText(Decimal breakMinutes) {
        Decimal allowance = AttendanceRollupService.breakAllowanceMinutes();
        String text = AttendanceRollupService.minutesText(breakMinutes);
        return breakMinutes > allowance
            ? text + '  :warning: over ' + AttendanceRollupService.minutesText(allowance)
            : text;
    }

    private static Boolean isCheckIn(Attendance_Punch__c punch) {
        return AttendanceRollupService.isCheckInType(punch.Punch_Type__c);
    }

    private static String punchTime(Attendance_Punch__c punch) {
        return timeText(punch.Punch_DateTime__c);
    }

    private static String timeText(DateTime instant) {
        return instant == null
            ? '--:--'
            : instant.format('HH:mm', AttendanceRollupService.businessTimeZoneName());
    }

    private static Map<String, Object> mrkdwn(String text) {
        return new Map<String, Object>{ 'type' => 'mrkdwn', 'text' => text };
    }
}
