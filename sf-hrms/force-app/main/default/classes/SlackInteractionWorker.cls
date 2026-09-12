/**
 * Everything a button or a submission needs done after Slack has been answered.
 *
 * Two things force this split. Slack gives three seconds before it shows the
 * user an error, and Apex cannot call out after DML in the same transaction. So
 * the request that carried the click does the deciding and the writing, and this
 * does the rendering and the talking afterwards.
 *
 * A Home tab interaction carries no response_url; that channel exists only for
 * messages. So everything here answers by direct message and by redrawing the
 * tab, which works from both surfaces rather than only one.
 */
/**
 * SHARING NOTE
 *
 * This runs as the Salesforce Site guest user, which has no identity of its own.
 * Salesforce forces guest users to private record access whatever the org-wide
 * default says, so "with sharing" here means seeing nothing at all, and every
 * view renders as if the data were not there.
 *
 * Identity comes from the signed Slack payload, and every authorisation decision
 * is made explicitly against the employee it names, before this is ever
 * enqueued. Record sharing for the guest is meaningless rather than protective.
 */
public without sharing class SlackInteractionWorker implements Queueable, Database.AllowsCallouts {

    // What to do once the acknowledgement has gone.
    public static final String SAY = 'say';
    public static final String PROFILE = 'profile';
    public static final String SEARCH = 'search';
    public static final String PERSON_DAY = 'person_day';
    public static final String PERSON_MONTH = 'person_month';
    public static final String TODAY = 'today';
    public static final String PUNCH_LOG = 'punch_log';
    public static final String MY_REQUESTS = 'my_requests';
    public static final String LINK_SLACK = 'link_slack';
    public static final String CLOCKED = 'clocked';

    private final String kind;
    private final String argument;
    private final String slackUserId;
    private final String message;
    private final Boolean refreshHome;

    public SlackInteractionWorker(String kind, String argument, String slackUserId) {
        this(kind, argument, slackUserId, null, true);
    }

    /**
     * @param message said first, before whatever the kind renders. A submission
     *        composes this while it still has the record in hand.
     */
    public SlackInteractionWorker(
        String kind, String argument, String slackUserId, String message, Boolean refreshHome
    ) {
        this.kind = kind;
        this.argument = argument;
        this.slackUserId = slackUserId;
        this.message = message;
        this.refreshHome = refreshHome;
    }

    public void execute(QueueableContext context) {
        try {
            if (String.isNotBlank(message)) {
                SlackApi.postMessage(slackUserId, strip(message), null);
            }

            Employee__c actor = SlackEmployeeLookup.forSlackUser(slackUserId);
            if (actor != null) {
                render(actor);
            }

            // Whatever just happened, the tab is now out of date. Done last so a
            // failure rendering one thing does not leave the tab stale too.
            if (refreshHome == true) {
                SlackEventWorker.refreshHome(slackUserId);
            }
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR,
                'Slack ' + kind + ' failed: ' + e.getTypeName() + ': ' + e.getMessage() +
                '\n' + e.getStackTraceString());
            SlackApi.postMessage(
                slackUserId, 'Something went wrong reaching Salesforce. Please try again.', null
            );
        }
    }

    private void render(Employee__c actor) {
        if (kind == SAY || kind == CLOCKED) {
            // The message was the whole point; nothing else to draw.
            return;
        }
        if (kind == LINK_SLACK) {
            linkByEmail(actor);
            return;
        }
        if (kind == PROFILE) {
            Employee__c subject = SlackAdminData.employee(
                SlackModalValues.asId(argument, Employee__c.SObjectType)
            );
            post(subject == null
                ? new List<Object>{ SlackBlocks.section('That employee no longer exists.') }
                : SlackEmployeeModals.profile(subject, actor),
                subject == null ? 'Not found' : subject.Name);
            return;
        }
        if (kind == SEARCH) {
            post(SlackPeopleAdmin.searchResults(argument, actor), 'Directory search');
            return;
        }
        if (kind == PERSON_DAY) {
            Id subjectId = SlackAttendanceAdmin.employeeIn(argument);
            post(
                SlackAttendanceAdmin.personDay(
                    subjectId, SlackAttendanceAdmin.dateIn(argument), actor
                ),
                'Attendance'
            );
            return;
        }
        if (kind == PERSON_MONTH) {
            Id subjectId = SlackModalValues.asId(argument, Employee__c.SObjectType);
            post(SlackAttendanceAdmin.personMonth(subjectId, actor), 'Attendance this month');
            return;
        }
        if (kind == TODAY) {
            post(SlackAttendanceAdmin.todayAcrossCompany(actor), 'Attendance today');
            return;
        }
        if (kind == PUNCH_LOG) {
            post(
                SlackAttendanceAdmin.personDay(
                    actor.Id, AttendanceRollupService.businessDateOf(System.now()), actor
                ),
                'Today'
            );
            return;
        }
        if (kind == MY_REQUESTS) {
            post(SlackLeaveApply.myRequests(actor), 'Your leave requests');
        }
    }

    /**
     * Connects an employee record to the Slack account with the same work email.
     *
     * The order here is deliberate: look up, say what happened, then write. Apex
     * cannot call out after DML in the same transaction, so the message has to go
     * before the update rather than after it.
     */
    private void linkByEmail(Employee__c actor) {
        if (!SlackAuthz.canManageEmployees(actor)) {
            SlackApi.postMessage(slackUserId, 'Only an administrator can link accounts.', null);
            return;
        }
        Employee__c subject = SlackAdminData.employee(
            SlackModalValues.asId(argument, Employee__c.SObjectType)
        );
        if (subject == null) {
            SlackApi.postMessage(slackUserId, 'That employee no longer exists.', null);
            return;
        }
        if (String.isBlank(subject.Official_Email__c)) {
            SlackApi.postMessage(
                slackUserId,
                SlackBlocks.escape(subject.Name) + ' has no email address on record, so there ' +
                'is nothing to match a Slack account against.',
                null
            );
            return;
        }

        String found = SlackApi.lookupUserIdByEmail(subject.Official_Email__c);
        if (String.isBlank(found)) {
            SlackApi.postMessage(
                slackUserId,
                'Nobody in this workspace uses ' + subject.Official_Email__c + '. ' +
                'They will link automatically when they join, or correct the address and try again.',
                null
            );
            return;
        }
        if (found == subject.Slack_User_Id__c) {
            SlackApi.postMessage(
                slackUserId,
                SlackBlocks.escape(subject.Name) + ' is already linked to that Slack account.',
                null
            );
            return;
        }

        SlackApi.postMessage(
            slackUserId,
            ':link: Linked *' + SlackBlocks.escape(subject.Name) + '* to <@' + found + '>. ' +
            'They can use the HRMS commands and the Home tab now.',
            null
        );
        // Last, because nothing may call out after this.
        update new Employee__c(Id = subject.Id, Slack_User_Id__c = found);
    }

    private void post(List<Object> blocks, String fallbackText) {
        SlackApi.postMessage(
            slackUserId, fallbackText,
            SlackBlocks.capped(blocks, SlackBlocks.MAX_MESSAGE_BLOCKS, null)
        );
    }

    /** Message text is composed where the record was, so it may be long. */
    private String strip(String text) {
        return text.length() <= 3000 ? text : text.substring(0, 2999);
    }
}
