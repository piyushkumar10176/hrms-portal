/**
 * Tests for applying for and cancelling leave from Slack.
 *
 * The validation is the point. A request accepted here and silently rejected
 * later leaves somebody believing they have leave booked, so each refusal is
 * asserted by the field it blames as well as by the fact that nothing was
 * written.
 */
@isTest
private class SlackLeaveApplyTest {

    private static final String SLACK_ID = 'U0APPLY001';

    @TestSetup
    static void setupTestData() {
        List<Employee__c> staff = TestDataFactory.createEmployees(2, true);
        staff[0].Slack_User_Id__c = SLACK_ID;
        staff[0].Reporting_Manager__c = staff[1].Id;
        update staff;

        Leave_Type__c annual = TestDataFactory.createLeaveType('Annual Leave', 18, true);
        TestDataFactory.createLeaveBalances(
            new List<Employee__c>{ staff[0] }, annual, 0, 12, true
        );
    }

    private static Employee__c applicant() {
        return [
            SELECT Id, Name, First_Name__c, Role__c, Reporting_Manager__c, Slack_User_Id__c
            FROM Employee__c WHERE Slack_User_Id__c = :SLACK_ID LIMIT 1
        ];
    }

    private static Id annualLeaveId() {
        return [SELECT Id FROM Leave_Type__c LIMIT 1].Id;
    }

    /** The next Monday, so a range never lands on a weekend by accident. */
    private static Date nextMonday() {
        Date day = Date.today().addDays(1);
        while (dayName(day) != 'Mon') {
            day = day.addDays(1);
        }
        return day;
    }

    private static String dayName(Date day) {
        return DateTime.newInstanceGmt(day, Time.newInstance(12, 0, 0, 0)).formatGmt('EEE');
    }

    private static Map<String, String> form(Date fromDate, Date toDate, String halfDay) {
        return new Map<String, String>{
            'leave_type' => annualLeaveId(),
            'from_date' => SlackBlocks.dateText(fromDate),
            'to_date' => SlackBlocks.dateText(toDate),
            'half_day' => halfDay,
            'reason' => 'Family function'
        };
    }

    // ---- the form --------------------------------------------------------

    @isTest
    static void shouldOfferEveryLeaveTypeAndTheRunningBalance() {
        Test.startTest();
        Map<String, Object> view = SlackLeaveApply.applyModal(applicant());
        Test.stopTest();

        Assert.areEqual('modal', view.get('type'), 'The apply form should be a modal');
        Assert.areEqual(
            SlackLeaveApply.APPLY_CALLBACK, view.get('callback_id'),
            'The callback id is what routes the submission back'
        );
        String rendered = JSON.serialize(view);
        Assert.isTrue(
            rendered.contains('Annual Leave'),
            'The configured leave type should be offered'
        );
        Assert.isTrue(
            rendered.contains('You have left'),
            'The balance belongs on the form, where the decision is being made'
        );
    }

    @isTest
    static void shouldExplainRatherThanOfferAFormWhenNoLeaveTypesExist() {
        delete [SELECT Id FROM Leave_Balance__c];
        delete [SELECT Id FROM Leave_Type__c];

        Test.startTest();
        Map<String, Object> view = SlackLeaveApply.applyModal(applicant());
        Test.stopTest();

        Assert.isNull(
            view.get('submit'),
            'A form with nothing to pick should not offer a submit button'
        );
        Assert.isTrue(
            JSON.serialize(view).contains('No leave types are configured'),
            'It should say why there is nothing to fill in'
        );
    }

    // ---- accepting -------------------------------------------------------

    @isTest
    static void shouldRecordARequestAndRouteItToTheReportingManager() {
        Employee__c actor = applicant();
        Date monday = nextMonday();

        Test.startTest();
        SlackPeopleAdmin.Outcome outcome =
            SlackLeaveApply.submit(form(monday, monday.addDays(2), 'no'), actor);
        Test.stopTest();

        Assert.isTrue(outcome.ok, 'A clean three day request should be accepted');
        Leave_Request__c saved = [
            SELECT Days__c, Status__c, Approver__c, Half_Day__c, Reason__c
            FROM Leave_Request__c WHERE Employee__c = :actor.Id LIMIT 1
        ];
        Assert.areEqual(3, saved.Days__c, 'Monday to Wednesday is three working days');
        Assert.areEqual('Submitted', saved.Status__c, 'A new request is submitted, not approved');
        Assert.areEqual(
            actor.Reporting_Manager__c, saved.Approver__c,
            'The reporting manager is the approver'
        );
        Assert.areEqual('Family function', saved.Reason__c, 'The reason should be kept');
    }

    @isTest
    static void shouldNotCountWeekendsInsideTheRange() {
        Employee__c actor = applicant();
        Date monday = nextMonday();

        Test.startTest();
        // Monday to the following Monday spans a Saturday and a Sunday.
        SlackPeopleAdmin.Outcome outcome =
            SlackLeaveApply.submit(form(monday, monday.addDays(7), 'no'), actor);
        Test.stopTest();

        Assert.isTrue(outcome.ok, 'The request itself is valid');
        Assert.areEqual(
            6, [SELECT Days__c FROM Leave_Request__c LIMIT 1].Days__c,
            'Eight calendar days across one weekend is six working days'
        );
    }

    @isTest
    static void shouldNotCountAPublicHolidayInsideTheRange() {
        Employee__c actor = applicant();
        Date monday = nextMonday();
        insert new Holiday__c(Date__c = monday.addDays(1), Type__c = 'National');

        Test.startTest();
        SlackPeopleAdmin.Outcome outcome =
            SlackLeaveApply.submit(form(monday, monday.addDays(2), 'no'), actor);
        Test.stopTest();

        Assert.areEqual(
            2, [SELECT Days__c FROM Leave_Request__c LIMIT 1].Days__c,
            'A holiday inside the range is not leave, so three days cost two'
        );
    }

    @isTest
    static void shouldCostHalfADayForAHalfDay() {
        Employee__c actor = applicant();
        Date monday = nextMonday();

        Test.startTest();
        SlackPeopleAdmin.Outcome outcome =
            SlackLeaveApply.submit(form(monday, monday, 'First Half'), actor);
        Test.stopTest();

        Assert.isTrue(outcome.ok, 'A half day on a working day is valid');
        Leave_Request__c saved = [
            SELECT Days__c, Half_Day__c, Half_Day_Session__c FROM Leave_Request__c LIMIT 1
        ];
        Assert.areEqual(0.5, saved.Days__c, 'A half day costs half a day');
        Assert.isTrue(saved.Half_Day__c, 'It should be marked as a half day');
        Assert.areEqual(
            'First Half', saved.Half_Day_Session__c,
            'Which half was chosen has to survive, or the manager cannot plan around it'
        );
    }

    // ---- refusing --------------------------------------------------------

    @isTest
    static void shouldRefuseAnEndDateBeforeTheStart() {
        Date monday = nextMonday();

        Test.startTest();
        SlackPeopleAdmin.Outcome outcome =
            SlackLeaveApply.submit(form(monday.addDays(3), monday, 'no'), applicant());
        Test.stopTest();

        Assert.isFalse(outcome.ok, 'A backwards range is not a request');
        Assert.areEqual('to_date', outcome.blockId, 'The end date is the field at fault');
        Assert.areEqual(0, [SELECT COUNT() FROM Leave_Request__c], 'Nothing should be written');
    }

    @isTest
    static void shouldRefuseAHalfDayAcrossTwoDates() {
        Date monday = nextMonday();

        Test.startTest();
        SlackPeopleAdmin.Outcome outcome =
            SlackLeaveApply.submit(form(monday, monday.addDays(1), 'First Half'), applicant());
        Test.stopTest();

        Assert.isFalse(outcome.ok, 'There is no half of two different days');
        Assert.areEqual('to_date', outcome.blockId, 'The end date is what has to change');
    }

    @isTest
    static void shouldRefuseMoreDaysThanTheBalanceHolds() {
        Employee__c actor = applicant();
        Date monday = nextMonday();

        Test.startTest();
        // Twelve days of balance against six weeks of request.
        SlackPeopleAdmin.Outcome outcome =
            SlackLeaveApply.submit(form(monday, monday.addDays(41), 'no'), actor);
        Test.stopTest();

        Assert.isFalse(outcome.ok, 'Nobody may book leave they do not have');
        Assert.areEqual('leave_type', outcome.blockId, 'The type carries the balance');
        Assert.isTrue(
            outcome.message.contains('12'),
            'The refusal should say how much is actually left: ' + outcome.message
        );
        Assert.areEqual(0, [SELECT COUNT() FROM Leave_Request__c], 'Nothing should be written');
    }

    @isTest
    static void shouldRefuseARangeThatOverlapsAnExistingRequest() {
        Employee__c actor = applicant();
        Date monday = nextMonday();
        insert new Leave_Request__c(
            Employee__c = actor.Id,
            Leave_Type__c = annualLeaveId(),
            From_Date__c = monday,
            To_Date__c = monday.addDays(1),
            Days__c = 2,
            Status__c = 'Submitted'
        );

        Test.startTest();
        SlackPeopleAdmin.Outcome outcome =
            SlackLeaveApply.submit(form(monday.addDays(1), monday.addDays(2), 'no'), actor);
        Test.stopTest();

        Assert.isFalse(outcome.ok, 'Two requests covering one day is a double booking');
        Assert.areEqual('from_date', outcome.blockId, 'The start date is where the clash begins');
        Assert.areEqual(
            1, [SELECT COUNT() FROM Leave_Request__c],
            'The existing request should be the only one'
        );
    }

    @isTest
    static void shouldRefuseARangeOfNothingButWeekends() {
        Employee__c actor = applicant();
        Date saturday = nextMonday().addDays(5);

        Test.startTest();
        SlackPeopleAdmin.Outcome outcome =
            SlackLeaveApply.submit(form(saturday, saturday.addDays(1), 'no'), actor);
        Test.stopTest();

        Assert.isFalse(outcome.ok, 'A weekend costs no leave, so there is nothing to book');
        Assert.areEqual(0, [SELECT COUNT() FROM Leave_Request__c], 'Nothing should be written');
    }

    @isTest
    static void shouldRefuseADateAYearAhead() {
        Date monday = nextMonday();

        Test.startTest();
        SlackPeopleAdmin.Outcome outcome = SlackLeaveApply.submit(
            form(monday.addYears(2), monday.addYears(2).addDays(1), 'no'), applicant()
        );
        Test.stopTest();

        Assert.isFalse(outcome.ok, 'A year out is almost always a mistyped year');
        Assert.areEqual('from_date', outcome.blockId, 'The start date is the one to check');
    }

    @isTest
    static void shouldRefuseASubmissionWithNoLeaveType() {
        Date monday = nextMonday();
        Map<String, String> values = form(monday, monday, 'no');
        values.remove('leave_type');

        Test.startTest();
        SlackPeopleAdmin.Outcome outcome = SlackLeaveApply.submit(values, applicant());
        Test.stopTest();

        Assert.isFalse(outcome.ok, 'Leave has to be of some type');
        Assert.areEqual('leave_type', outcome.blockId, 'The type is what is missing');
    }

    // ---- cancelling ------------------------------------------------------

    @isTest
    static void shouldWithdrawTheApplicantsOwnPendingRequest() {
        Employee__c actor = applicant();
        Leave_Request__c request = new Leave_Request__c(
            Employee__c = actor.Id,
            Leave_Type__c = annualLeaveId(),
            From_Date__c = nextMonday(),
            To_Date__c = nextMonday(),
            Days__c = 1,
            Status__c = 'Submitted'
        );
        insert request;

        Test.startTest();
        SlackPeopleAdmin.Outcome outcome = SlackLeaveApply.cancel(request.Id, actor);
        Test.stopTest();

        Assert.isTrue(outcome.ok, 'Somebody may take back their own pending request');
        Leave_Request__c after = [
            SELECT Status__c, Cancellation_Reason__c FROM Leave_Request__c WHERE Id = :request.Id
        ];
        Assert.areEqual('Cancelled', after.Status__c, 'It should be cancelled, not deleted');
        Assert.isNotNull(
            after.Cancellation_Reason__c,
            'The record should say why, so the history reads on its own'
        );
    }

    @isTest
    static void shouldRefuseToCancelSomebodyElsesRequest() {
        Employee__c actor = applicant();
        Employee__c other = [
            SELECT Id FROM Employee__c WHERE Slack_User_Id__c = NULL LIMIT 1
        ];
        Leave_Request__c request = new Leave_Request__c(
            Employee__c = other.Id,
            Leave_Type__c = annualLeaveId(),
            From_Date__c = nextMonday(),
            To_Date__c = nextMonday(),
            Days__c = 1,
            Status__c = 'Submitted'
        );
        insert request;

        Test.startTest();
        SlackPeopleAdmin.Outcome outcome = SlackLeaveApply.cancel(request.Id, actor);
        Test.stopTest();

        Assert.isFalse(outcome.ok, 'A request belongs to the person who made it');
        Assert.areEqual(
            'Submitted',
            [SELECT Status__c FROM Leave_Request__c WHERE Id = :request.Id].Status__c,
            'Nothing should have changed'
        );
    }

    @isTest
    static void shouldRefuseToCancelSomethingAlreadyDecided() {
        Employee__c actor = applicant();
        Leave_Request__c request = new Leave_Request__c(
            Employee__c = actor.Id,
            Leave_Type__c = annualLeaveId(),
            From_Date__c = nextMonday(),
            To_Date__c = nextMonday(),
            Days__c = 1,
            Status__c = 'Approved'
        );
        insert request;

        Test.startTest();
        SlackPeopleAdmin.Outcome outcome = SlackLeaveApply.cancel(request.Id, actor);
        Test.stopTest();

        Assert.isFalse(outcome.ok, 'An approved request already counted against the balance');
        Assert.isTrue(
            outcome.message.contains('approver'),
            'It should point at who can reverse it: ' + outcome.message
        );
    }

    // ---- the list --------------------------------------------------------

    @isTest
    static void shouldOfferToCancelOnlyThePendingRequests() {
        Employee__c actor = applicant();
        insert new List<Leave_Request__c>{
            new Leave_Request__c(
                Employee__c = actor.Id, Leave_Type__c = annualLeaveId(),
                From_Date__c = nextMonday(), To_Date__c = nextMonday(),
                Days__c = 1, Status__c = 'Submitted'
            ),
            new Leave_Request__c(
                Employee__c = actor.Id, Leave_Type__c = annualLeaveId(),
                From_Date__c = nextMonday().addDays(20), To_Date__c = nextMonday().addDays(20),
                Days__c = 1, Status__c = 'Rejected'
            )
        };

        Test.startTest();
        String rendered = JSON.serialize(SlackLeaveApply.myRequests(actor));
        Test.stopTest();

        Assert.isTrue(rendered.contains('Rejected'), 'Every request should be listed');
        Assert.areEqual(
            1, rendered.split('hrms_cancel_leave').size() - 1,
            'Only the pending one should carry a cancel button'
        );
    }

    @isTest
    static void shouldOfferToApplyWhenThereAreNoRequestsYet() {
        Test.startTest();
        String rendered = JSON.serialize(SlackLeaveApply.myRequests(applicant()));
        Test.stopTest();

        Assert.isTrue(
            rendered.contains('hrms_apply_leave'),
            'An empty list is exactly when the apply button is most useful'
        );
    }
}
