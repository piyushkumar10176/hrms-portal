/**
 * Buttons and modal submissions.
 *
 * Tighter than a slash command. Slack decides whether to keep or close a modal
 * from what comes back on this very response, so a submission is validated and
 * written here rather than handed away and answered later.
 *
 * That leaves three shapes of work, and which one applies is decided by a single
 * rule: Apex cannot call out after DML in the same transaction.
 *
 *   Opening a modal is a read and a callout, and the trigger_id it needs lives
 *   about three seconds, so it happens here, synchronously, or not at all.
 *
 *   Deciding and writing happen here too, because the answer depends on them.
 *
 *   Anything that has to speak to Slack after a write goes to a Queueable.
 *
 * Authority is re-checked inside each branch. An action id and a value are
 * supplied by the client, so a button is a convenience and never the boundary.
 */
public inherited sharing class SlackInteractivityHandler {

    public static void handle(RestResponse response, String raw) {
        if (String.isBlank(raw)) {
            reply(response, 400, '{"error":"no_payload"}');
            return;
        }

        Map<String, Object> payload;
        try {
            payload = (Map<String, Object>) JSON.deserializeUntyped(raw);
        } catch (Exception e) {
            reply(response, 400, '{"error":"bad_payload"}');
            return;
        }

        String type = String.valueOf(payload.get('type'));

        if (type == 'view_submission') {
            reply(response, 200, onSubmission(payload));
            return;
        }
        if (type == 'block_actions') {
            onAction(response, payload);
            return;
        }

        // Anything else is acknowledged rather than refused, so Slack does not
        // retry something this app simply does not handle.
        reply(response, 200, '');
    }

    // ---- buttons ---------------------------------------------------------

    private static void onAction(RestResponse response, Map<String, Object> payload) {
        List<Object> actions = (List<Object>) payload.get('actions');
        if (actions == null || actions.isEmpty()) {
            reply(response, 200, '');
            return;
        }

        Map<String, Object> action = (Map<String, Object>) actions[0];
        String actionId = String.valueOf(action.get('action_id'));
        String value = action.get('value') == null ? '' : String.valueOf(action.get('value'));
        Map<String, Object> user = (Map<String, Object>) payload.get('user');
        String slackUserId = user == null ? null : String.valueOf(user.get('id'));
        String triggerId = payload.get('trigger_id') == null
            ? null : String.valueOf(payload.get('trigger_id'));
        String responseUrl = payload.get('response_url') == null
            ? null : String.valueOf(payload.get('response_url'));

        Employee__c actor = SlackEmployeeLookup.forSlackUser(slackUserId);
        if (actor == null) {
            // A Home tab press carries no response_url, so this cannot be
            // answered inline on every surface. A direct message reaches both.
            enqueue(SlackInteractionWorker.SAY, null, slackUserId,
                'Your Slack account is not linked to an employee record yet. Ask HR to link it.',
                false);
            reply(response, 200, '');
            return;
        }

        // Decisions are recorded here rather than in the worker. A worker that
        // both wrote and announced could not do the second: Apex forbids a
        // callout after DML, so the message never changed and the button looked
        // broken. The worker that follows only talks.
        if (actionId == 'approve_leave' || actionId == 'reject_leave') {
            Id requestId = SlackModalValues.asId(value, Leave_Request__c.SObjectType);
            if (requestId == null) {
                reply(response, 200, SlackBlocks.ephemeral('That request could not be identified.'));
                return;
            }
            SlackLeaveDecision.Announcement announcement =
                SlackLeaveDecision.decide(requestId, actionId == 'approve_leave', actor);
            System.enqueueJob(
                new SlackDecisionWorker(announcement, slackUserId, responseUrl)
            );
            reply(response, 200, '');
            return;
        }

        if (openedModal(actionId, value, triggerId, actor)) {
            reply(response, 200, '');
            return;
        }
        if (wrote(actionId, value, slackUserId, actor)) {
            reply(response, 200, '');
            return;
        }
        deferred(actionId, value, slackUserId);
        reply(response, 200, '');
    }

    /**
     * Anything that opens a modal, done now because the trigger_id expires in
     * about three seconds and a Queueable cannot promise to start inside that.
     *
     * @return true when the action belonged here
     */
    private static Boolean openedModal(
        String actionId, String value, String triggerId, Employee__c actor
    ) {
        if (String.isBlank(triggerId)) {
            return false;
        }
        Boolean admin = SlackAuthz.canManageEmployees(actor);

        if (actionId == SlackLeaveApply.APPLY_CALLBACK) {
            SlackApi.openView(triggerId, SlackLeaveApply.applyModal(actor));
            return true;
        }
        if (actionId == SlackEmployeeModals.FIND_CALLBACK) {
            if (SlackAuthz.canSeeCompanyWideData(actor)) {
                SlackApi.openView(triggerId, SlackEmployeeModals.findEmployee());
            }
            return true;
        }
        if (actionId == SlackAttendanceAdmin.PICK_CALLBACK) {
            if (SlackAuthz.canSeeCompanyWideData(actor)) {
                SlackApi.openView(triggerId, SlackAttendanceAdmin.pickerModal());
            }
            return true;
        }
        if (actionId == SlackEmployeeModals.ADD_CALLBACK) {
            if (admin) {
                SlackApi.openView(triggerId, SlackEmployeeModals.addEmployee());
            }
            return true;
        }
        if (actionId == 'hrms_edit_employee') {
            Employee__c subject = admin ? subjectOf(value) : null;
            if (subject != null) {
                SlackApi.openView(triggerId, SlackEmployeeModals.editEmployee(subject));
            }
            return true;
        }
        if (actionId == 'hrms_offboard') {
            Employee__c subject = admin ? subjectOf(value) : null;
            if (subject != null) {
                SlackApi.openView(triggerId, SlackEmployeeModals.offboard(subject));
            }
            return true;
        }
        if (actionId == SlackAttendanceAdmin.ADD_PUNCH_CALLBACK) {
            Employee__c subject = admin
                ? SlackAdminData.employee(SlackAttendanceAdmin.employeeIn(value)) : null;
            if (subject != null) {
                SlackApi.openView(triggerId, SlackAttendanceAdmin.addPunchModal(
                    subject, SlackAttendanceAdmin.dateIn(value)
                ));
            }
            return true;
        }
        return false;
    }

    /**
     * Anything that writes. The write happens here and the talking afterwards,
     * because nothing may call out once DML has run in this transaction.
     *
     * @return true when the action belonged here
     */
    private static Boolean wrote(
        String actionId, String value, String slackUserId, Employee__c actor
    ) {
        if (actionId == 'home_clock_in' || actionId == 'home_clock_out') {
            SlackPeopleAdmin.Outcome outcome =
                SlackAttendanceAdmin.clock(actor, actionId == 'home_clock_in');
            enqueue(SlackInteractionWorker.CLOCKED, null, slackUserId, outcome.message, true);
            return true;
        }
        if (actionId == SlackLeaveApply.CANCEL_CALLBACK) {
            Id requestId = SlackModalValues.asId(value, Leave_Request__c.SObjectType);
            SlackPeopleAdmin.Outcome outcome = requestId == null
                ? SlackPeopleAdmin.outcomeFor(false, 'That request could not be identified.', null)
                : SlackLeaveApply.cancel(requestId, actor);
            enqueue(SlackInteractionWorker.SAY, null, slackUserId, outcome.message, true);
            return true;
        }
        return false;
    }

    /** Anything that only has to render and post, which is slow enough to defer. */
    private static void deferred(String actionId, String value, String slackUserId) {
        if (actionId == 'hrms_view_profile') {
            enqueue(SlackInteractionWorker.PROFILE, value, slackUserId, null, false);
        } else if (actionId == 'hrms_view_attendance') {
            enqueue(SlackInteractionWorker.PERSON_MONTH, value, slackUserId, null, false);
        } else if (actionId == 'hrms_today_attendance') {
            enqueue(SlackInteractionWorker.TODAY, value, slackUserId, null, false);
        } else if (actionId == 'hrms_link_slack') {
            enqueue(SlackInteractionWorker.LINK_SLACK, value, slackUserId, null, true);
        } else if (actionId == 'home_view_punches') {
            enqueue(SlackInteractionWorker.PUNCH_LOG, value, slackUserId, null, false);
        } else if (actionId == 'home_my_requests') {
            enqueue(SlackInteractionWorker.MY_REQUESTS, value, slackUserId, null, false);
        } else if (actionId == 'home_open_approvals') {
            enqueue(SlackInteractionWorker.SAY, null, slackUserId,
                'Use `/hrms-approvals` to see everything waiting on you, with Approve and ' +
                'Reject buttons on each one.', false);
        }
        // Anything else is ignored deliberately: an unknown action is a stale
        // message from an older version of this app, not an error to report.
    }

    // ---- modal submissions -----------------------------------------------

    /**
     * @return the body Slack expects: an empty object closes the modal, an
     *         errors object keeps it open with the fault against the field
     */
    private static String onSubmission(Map<String, Object> payload) {
        Map<String, Object> view = (Map<String, Object>) payload.get('view');
        Map<String, Object> user = (Map<String, Object>) payload.get('user');
        String slackUserId = user == null ? null : String.valueOf(user.get('id'));

        String callbackId = SlackModalValues.callbackIdOf(view);
        String metadata = SlackModalValues.metadataOf(view);
        Map<String, String> values = SlackModalValues.read(view);

        Employee__c actor = SlackEmployeeLookup.forSlackUser(slackUserId);
        if (actor == null) {
            return SlackViewBuilder.CLOSE;
        }

        if (callbackId == SlackLeaveApply.APPLY_CALLBACK) {
            SlackPeopleAdmin.Outcome outcome = SlackLeaveApply.submit(values, actor);
            if (!outcome.ok) {
                return refusal(outcome, slackUserId);
            }
            // Only the confirmation. Listing every past request afterwards
            // buries the one thing they wanted to know under a history they did
            // not ask for; `/hrms-leave` is there for when they do.
            enqueue(SlackInteractionWorker.SAY, null, slackUserId,
                ':white_check_mark: Leave requested. Your approver has been notified.', true);
            return SlackViewBuilder.CLOSE;
        }

        if (callbackId == SlackEmployeeModals.ADD_CALLBACK) {
            SlackPeopleAdmin.Outcome outcome = SlackPeopleAdmin.create(values, actor);
            if (!outcome.ok) {
                return refusal(outcome, slackUserId);
            }
            // Linking their Slack account is the onboarding step that matters in
            // a Slack-only product, and it is a callout, so it goes to the worker.
            enqueue(SlackInteractionWorker.LINK_SLACK, outcome.recordId, slackUserId,
                outcome.message, true);
            return SlackViewBuilder.CLOSE;
        }

        if (callbackId == SlackEmployeeModals.EDIT_CALLBACK) {
            SlackPeopleAdmin.Outcome outcome = SlackPeopleAdmin.save(
                SlackModalValues.asId(metadata, Employee__c.SObjectType), values, actor
            );
            if (!outcome.ok) {
                return refusal(outcome, slackUserId);
            }
            enqueue(SlackInteractionWorker.PROFILE, outcome.recordId, slackUserId,
                outcome.message, false);
            return SlackViewBuilder.CLOSE;
        }

        if (callbackId == SlackEmployeeModals.OFFBOARD_CALLBACK) {
            SlackPeopleAdmin.Outcome outcome = SlackPeopleAdmin.offboard(
                SlackModalValues.asId(metadata, Employee__c.SObjectType), values, actor
            );
            enqueue(SlackInteractionWorker.SAY, null, slackUserId, outcome.message, true);
            return SlackViewBuilder.CLOSE;
        }

        if (callbackId == SlackAttendanceAdmin.ADD_PUNCH_CALLBACK) {
            SlackPeopleAdmin.Outcome outcome = SlackAttendanceAdmin.addPunch(
                SlackAttendanceAdmin.employeeIn(metadata),
                SlackAttendanceAdmin.dateIn(metadata),
                values, actor
            );
            // The corrected day is worth showing straight back, so the admin can
            // see the flag clear rather than take it on trust.
            enqueue(
                outcome.ok ? SlackInteractionWorker.PERSON_DAY : SlackInteractionWorker.SAY,
                metadata, slackUserId, outcome.message, false
            );
            return SlackViewBuilder.CLOSE;
        }

        if (callbackId == SlackEmployeeModals.FIND_CALLBACK) {
            String term = values.get('term') ?? '';
            if (term.length() < 2) {
                return SlackViewBuilder.error('term', 'Type at least two characters.');
            }
            enqueue(SlackInteractionWorker.SEARCH, term, slackUserId, null, false);
            return SlackViewBuilder.CLOSE;
        }

        if (callbackId == SlackAttendanceAdmin.PICK_CALLBACK) {
            String subjectId = values.get('employee') ?? '';
            String day = values.get('day');
            if (String.isBlank(day)) {
                enqueue(SlackInteractionWorker.PERSON_MONTH, subjectId, slackUserId, null, false);
            } else {
                enqueue(
                    SlackInteractionWorker.PERSON_DAY, subjectId + '|' + day,
                    slackUserId, null, false
                );
            }
            return SlackViewBuilder.CLOSE;
        }

        return SlackViewBuilder.CLOSE;
    }

    /**
     * A refusal with a field to blame stays in the modal next to the question.
     * One without has nowhere to go there, so it is said by message instead.
     */
    private static String refusal(SlackPeopleAdmin.Outcome outcome, String slackUserId) {
        if (String.isNotBlank(outcome.blockId)) {
            return SlackViewBuilder.error(outcome.blockId, outcome.message);
        }
        enqueue(SlackInteractionWorker.SAY, null, slackUserId, outcome.message, false);
        return SlackViewBuilder.CLOSE;
    }

    // ---- helpers ---------------------------------------------------------

    private static Employee__c subjectOf(String value) {
        return SlackAdminData.employee(
            SlackModalValues.asId(value, Employee__c.SObjectType)
        );
    }

    private static void enqueue(
        String kind, String argument, String slackUserId, String message, Boolean refreshHome
    ) {
        if (String.isBlank(slackUserId)) {
            return;
        }
        System.enqueueJob(new SlackInteractionWorker(
            kind, argument, slackUserId, message, refreshHome
        ));
    }

    private static void reply(RestResponse response, Integer status, String body) {
        response.statusCode = status;
        response.responseBody = Blob.valueOf(body);
    }
}
