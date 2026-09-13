/**
 * The morning who-is-out post, sent by the Salesforce-native app.
 *
 * The older hosted app already sends one, through a Named Credential holding its
 * own bot token. This app has no part in that and cannot: a token belongs to one
 * Slack app, so a post made with the old one arrives from the old one. Somebody
 * reading Slack HRMS would never see it.
 *
 * Both may run while the two apps run side by side. Turning one off is a matter
 * of clearing the channel on one side, which is why the channel is what enables
 * this rather than a separate switch: a digest with nowhere to go is not sent.
 *
 * Schedulable and Queueable in one class because a Schedulable cannot call out.
 * The scheduled half does nothing but hand the work to the half that can.
 */
/**
 * SHARING NOTE
 *
 * Reports across the whole company by design, and runs unattended rather than on
 * behalf of a reader. Whoever scheduled it is incidental, so the view must not
 * depend on what that person can see.
 */
public without sharing class SlackDailyDigest implements Schedulable, Queueable, Database.AllowsCallouts {

    /** 09:00 in the business time zone, Monday to Friday. */
    public static final String JOB_NAME = 'Slack HRMS daily digest';

    public void execute(SchedulableContext context) {
        System.enqueueJob(new SlackDailyDigest());
    }

    public void execute(QueueableContext context) {
        try {
            send();
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR,
                'Daily digest failed: ' + e.getTypeName() + ': ' + e.getMessage());
        }
    }

    /** Builds and posts the digest. Public so it can be run by hand to check it. */
    public static Boolean send() {
        Slack_Config__c config = Slack_Config__c.getOrgDefaults();
        String channel = config == null ? null : config.Digest_Channel_Id__c;
        if (String.isBlank(channel)) {
            // Not configured is not a failure. It is how this is switched off.
            return false;
        }

        Date today = AttendanceRollupService.businessDateOf(System.now());
        List<LeaveDigestService.Absence> absences = LeaveDigestService.absencesOn(today);
        List<Leave_Request__c> waiting = LeaveDigestService.pendingRequests();

        List<Object> blocks = new List<Object>{
            SlackBlocks.header('Out today · ' + dayLabel(today))
        };

        List<String> away = new List<String>();
        List<String> remote = new List<String>();
        for (LeaveDigestService.Absence absence : absences) {
            String who = SlackBlocks.escape(absence.employeeName) +
                (absence.isHalfDay == true ? ' (half day)' : '');
            if (isRemote(absence.leaveType)) {
                remote.add(who);
            } else {
                away.add(who);
            }
        }

        if (away.isEmpty() && remote.isEmpty()) {
            blocks.add(SlackBlocks.section(':white_check_mark: Everybody is in today.'));
        } else {
            if (!away.isEmpty()) {
                blocks.add(SlackBlocks.section(
                    ':palm_tree: *Away* · ' + away.size() + '\n' + String.join(away, ', ')
                ));
            }
            if (!remote.isEmpty()) {
                blocks.add(SlackBlocks.section(
                    ':house: *Working remotely* · ' + remote.size() + '\n' +
                    String.join(remote, ', ')
                ));
            }
        }

        // Said in the same post rather than a second one, because a channel that
        // gets two messages every morning is a channel people mute.
        if (!waiting.isEmpty()) {
            blocks.add(SlackBlocks.divider());
            blocks.add(SlackBlocks.section(
                ':hourglass: *' + waiting.size() + ' request' +
                (waiting.size() == 1 ? '' : 's') + ' awaiting a decision*'
            ));
            List<List<String>> rows = new List<List<String>>();
            for (Leave_Request__c request : waiting) {
                rows.add(new List<String>{
                    request.Employee__r == null ? 'Unknown' : request.Employee__r.Name,
                    request.Leave_Type__r == null ? 'Leave' : request.Leave_Type__r.Name,
                    SlackBlocks.dateText(request.From_Date__c),
                    request.Approver__r == null ? 'unassigned' : request.Approver__r.Name
                });
            }
            blocks.add(SlackBlocks.table(
                new List<String>{ 'Who', 'Type', 'From', 'Approver' }, rows, 10
            ));
            blocks.add(SlackBlocks.context(
                'Approvers: use `/hrms-approvals` to decide yours.'
            ));
        }

        SlackApi.Result result = SlackApi.postMessage(
            channel,
            away.isEmpty() && remote.isEmpty()
                ? 'Everybody is in today'
                : (away.size() + remote.size()) + ' out today',
            SlackBlocks.capped(blocks, SlackBlocks.MAX_MESSAGE_BLOCKS, null)
        );
        if (!result.ok) {
            System.debug(LoggingLevel.ERROR, 'Daily digest refused: ' + result.error);
        }
        return result.ok;
    }

    /** Work from home is leave in the data model, but it is not absence. */
    private static Boolean isRemote(String leaveType) {
        String name = (leaveType ?? '').toLowerCase();
        return name.contains('work from home') || name.contains('remote') || name == 'wfh';
    }

    private static String dayLabel(Date day) {
        return DateTime.newInstanceGmt(day, Time.newInstance(12, 0, 0, 0))
            .formatGmt('EEEE d MMMM');
    }
}
