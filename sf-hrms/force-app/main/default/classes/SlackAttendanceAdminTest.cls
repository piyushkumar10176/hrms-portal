/**
 * Tests for attendance seen and corrected from Slack.
 *
 * The time zone is the part worth guarding. A punch added from Slack has to land
 * on the same day the biometric machine would have put it, and the guest user
 * this runs as is not in the office, so a test that only checked the hour would
 * pass while production wrote the wrong date.
 */
@isTest
private class SlackAttendanceAdminTest {

    private static final String ADMIN_SLACK_ID = 'U0ATTADM01';

    @TestSetup
    static void setupTestData() {
        List<Employee__c> staff = TestDataFactory.createEmployees(2, true);
        staff[0].Role__c = 'Admin';
        staff[0].Slack_User_Id__c = ADMIN_SLACK_ID;
        staff[1].Role__c = 'Employee';
        update staff;
    }

    private static Employee__c admin() {
        return [
            SELECT Id, Name, Role__c, Slack_User_Id__c FROM Employee__c
            WHERE Role__c = 'Admin' LIMIT 1
        ];
    }

    private static Employee__c ordinary() {
        return [
            SELECT Id, Name, Role__c FROM Employee__c WHERE Role__c = 'Employee' LIMIT 1
        ];
    }

    private static Date businessToday() {
        return AttendanceRollupService.businessDateOf(System.now());
    }

    // ---- the time zone ---------------------------------------------------

    @isTest
    static void shouldWriteAPunchAtTheOfficeWallClockNotTheServersOne() {
        Employee__c subject = ordinary();
        Date day = Date.newInstance(2026, 3, 10);

        Test.startTest();
        SlackPeopleAdmin.Outcome outcome = SlackAttendanceAdmin.addPunch(
            subject.Id, day,
            new Map<String, String>{ 'punch_time' => '09:30', 'punch_type' => 'Check-In' },
            admin()
        );
        Test.stopTest();

        Assert.isTrue(outcome.ok, 'An administrator may correct attendance: ' + outcome.message);
        Attendance_Punch__c saved = [
            SELECT Punch_DateTime__c, Source__c, Adjusted_By__c
            FROM Attendance_Punch__c WHERE Employee__c = :subject.Id LIMIT 1
        ];
        String zone = AttendanceRollupService.businessTimeZoneName();
        Assert.areEqual(
            '09:30', saved.Punch_DateTime__c.format('HH:mm', zone),
            'Half past nine in the picker means half past nine in the office'
        );
        Assert.areEqual(
            day, AttendanceRollupService.businessDateOf(saved.Punch_DateTime__c),
            'It has to land on the day that was chosen, not the day before'
        );
        Assert.areEqual(
            'Manual', saved.Source__c,
            'A corrected day has to be distinguishable from one somebody punched'
        );
        Assert.areEqual(
            admin().Id, saved.Adjusted_By__c, 'Who corrected it is part of the record'
        );
    }

    @isTest
    static void shouldRefuseAPunchFromAnybodyButAnAdministrator() {
        Test.startTest();
        SlackPeopleAdmin.Outcome outcome = SlackAttendanceAdmin.addPunch(
            ordinary().Id, businessToday(),
            new Map<String, String>{ 'punch_time' => '09:30', 'punch_type' => 'Check-In' },
            ordinary()
        );
        Test.stopTest();

        Assert.isFalse(outcome.ok, 'Nobody writes their own attendance by hand');
        Assert.areEqual(
            0, [SELECT COUNT() FROM Attendance_Punch__c], 'Nothing should have been written'
        );
    }

    @isTest
    static void shouldRefuseADirectionItDoesNotRecognise() {
        Test.startTest();
        SlackPeopleAdmin.Outcome outcome = SlackAttendanceAdmin.addPunch(
            ordinary().Id, businessToday(),
            new Map<String, String>{ 'punch_time' => '09:30', 'punch_type' => 'Teleported' },
            admin()
        );
        Test.stopTest();

        Assert.isFalse(
            outcome.ok,
            'The value comes back through the client, so it is checked rather than trusted'
        );
        Assert.areEqual(0, [SELECT COUNT() FROM Attendance_Punch__c], 'Nothing written');
    }

    @isTest
    static void shouldRefuseASubmissionMissingTheTime() {
        Test.startTest();
        SlackPeopleAdmin.Outcome outcome = SlackAttendanceAdmin.addPunch(
            ordinary().Id, businessToday(),
            new Map<String, String>{ 'punch_type' => 'Check-In' }, admin()
        );
        Test.stopTest();

        Assert.isFalse(outcome.ok, 'A punch with no time is not a punch');
    }

    // ---- clocking in and out ---------------------------------------------

    @isTest
    static void shouldClockSomebodyInAndThenOut() {
        Employee__c actor = ordinary();

        Test.startTest();
        SlackPeopleAdmin.Outcome clockedIn = SlackAttendanceAdmin.clock(actor, true);
        SlackPeopleAdmin.Outcome clockedOut = SlackAttendanceAdmin.clock(actor, false);
        Test.stopTest();

        Assert.isTrue(clockedIn.ok, 'Clocking in should work: ' + clockedIn.message);
        Assert.isTrue(clockedOut.ok, 'And clocking out after it: ' + clockedOut.message);
        List<Attendance_Punch__c> punches = [
            SELECT Punch_Type__c, Source__c FROM Attendance_Punch__c
            WHERE Employee__c = :actor.Id ORDER BY Punch_DateTime__c
        ];
        Assert.areEqual(2, punches.size(), 'Two punches should exist');
        Assert.areEqual('Check-In', punches[0].Punch_Type__c, 'In first');
        Assert.areEqual('Check-Out', punches[1].Punch_Type__c, 'Out second');
        Assert.areEqual(
            'Slack', punches[0].Source__c,
            'Marked as Slack so the notifier stays quiet and the tab is the confirmation'
        );
    }

    @isTest
    static void shouldRefuseClockingInTwiceInARow() {
        Employee__c actor = ordinary();

        Test.startTest();
        SlackAttendanceAdmin.clock(actor, true);
        SlackPeopleAdmin.Outcome second = SlackAttendanceAdmin.clock(actor, true);
        Test.stopTest();

        Assert.isFalse(
            second.ok,
            'Two clock-ins read as one unbroken stretch and nobody notices until payroll'
        );
        Assert.areEqual(
            'You are already clocked in.', second.message, 'And it should say plainly why'
        );
        Assert.areEqual(
            1, [SELECT COUNT() FROM Attendance_Punch__c], 'Only the first should exist'
        );
    }

    @isTest
    static void shouldRefuseClockingOutWithoutHavingClockedIn() {
        Test.startTest();
        SlackPeopleAdmin.Outcome outcome = SlackAttendanceAdmin.clock(ordinary(), false);
        Test.stopTest();

        Assert.isFalse(outcome.ok, 'There is nothing to clock out of');
        Assert.areEqual(
            'You have not clocked in today.', outcome.message,
            'Which is a different problem from being already clocked out'
        );
    }

    // ---- the views -------------------------------------------------------

    @isTest
    static void shouldShowTheDayWithTheBreakBetweenTheStretches() {
        Employee__c subject = ordinary();
        Date day = businessToday();
        insert new List<Attendance_Punch__c>{
            TestDataFactory.buildPunch(subject, TestDataFactory.istInstant(day, 10, 0), 'Check-In'),
            TestDataFactory.buildPunch(subject, TestDataFactory.istInstant(day, 10, 30), 'Check-Out'),
            TestDataFactory.buildPunch(subject, TestDataFactory.istInstant(day, 11, 15), 'Check-In')
        };

        Test.startTest();
        String rendered =
            JSON.serialize(SlackAttendanceAdmin.personDay(subject.Id, day, admin()));
        Test.stopTest();

        Assert.isTrue(rendered.contains('10:00'), 'The first clock-in should be listed');
        Assert.isTrue(
            rendered.contains('45m'),
            'The 45 minute gap between clocking out and back in is the break: ' + rendered
        );
        Assert.isTrue(
            rendered.contains('Still on the clock'),
            'Ending on a clock-in means they are still in'
        );
        Assert.isTrue(
            rendered.contains('hrms_add_punch'),
            'An administrator should be offered the correction'
        );
    }

    @isTest
    static void shouldSayWhenThereAreNoPunchesRatherThanShowAnEmptyTable() {
        Test.startTest();
        String rendered = JSON.serialize(
            SlackAttendanceAdmin.personDay(ordinary().Id, businessToday(), admin())
        );
        Test.stopTest();

        Assert.isTrue(
            rendered.contains('No punches recorded'),
            'An empty table reads as a broken screen'
        );
    }

    @isTest
    static void shouldRefuseSomebodyElsesAttendanceToAnOrdinaryEmployee() {
        Employee__c other = admin();

        Test.startTest();
        String day = JSON.serialize(
            SlackAttendanceAdmin.personDay(other.Id, businessToday(), ordinary())
        );
        String month = JSON.serialize(SlackAttendanceAdmin.personMonth(other.Id, ordinary()));
        String company = JSON.serialize(SlackAttendanceAdmin.todayAcrossCompany(ordinary()));
        Test.stopTest();

        Assert.isTrue(day.contains('only look at your own'), 'One day is refused');
        Assert.isTrue(month.contains('only look at your own'), 'A month too');
        Assert.isTrue(
            company.contains('Only HR and administrators'),
            'And the company-wide view is refused separately'
        );
    }

    @isTest
    static void shouldLetSomebodySeeTheirOwnAttendance() {
        Employee__c actor = ordinary();

        Test.startTest();
        String rendered =
            JSON.serialize(SlackAttendanceAdmin.personDay(actor.Id, businessToday(), actor));
        Test.stopTest();

        Assert.isFalse(
            rendered.contains('only look at your own'),
            'Your own attendance is always yours to read'
        );
        Assert.isFalse(
            rendered.contains('hrms_add_punch'),
            'But an ordinary employee does not get the correction button'
        );
    }

    @isTest
    static void shouldShowTheMonthAndCountTheFlaggedDays() {
        Employee__c subject = ordinary();
        Date day = businessToday();
        insert new List<Attendance_Punch__c>{
            TestDataFactory.buildPunch(subject, TestDataFactory.istInstant(day, 10, 0), 'Check-In'),
            TestDataFactory.buildPunch(subject, TestDataFactory.istInstant(day, 12, 0), 'Check-Out')
        };

        Test.startTest();
        String rendered = JSON.serialize(SlackAttendanceAdmin.personMonth(subject.Id, admin()));
        Test.stopTest();

        Assert.isTrue(
            rendered.contains('this month'), 'The month view should render: ' + rendered
        );
        Assert.isTrue(
            rendered.contains('10:00'),
            'The derived day should carry the first clock-in'
        );
    }

    @isTest
    static void shouldSayNobodyHasClockedInRatherThanShowAnEmptyCompanyTable() {
        Test.startTest();
        String rendered = JSON.serialize(SlackAttendanceAdmin.todayAcrossCompany(admin()));
        Test.stopTest();

        Assert.isTrue(
            rendered.contains('Nobody has clocked in yet today'),
            'An empty company view needs a sentence, not a blank table'
        );
    }

    @isTest
    static void shouldListEverybodyWithAttendanceToday() {
        Employee__c subject = ordinary();
        Date day = businessToday();
        insert TestDataFactory.buildPunch(
            subject, TestDataFactory.istInstant(day, 9, 45), 'Check-In'
        );

        Test.startTest();
        String rendered = JSON.serialize(SlackAttendanceAdmin.todayAcrossCompany(admin()));
        Test.stopTest();

        Assert.isTrue(rendered.contains('09:45'), 'Their clock-in should be listed');
        Assert.isTrue(
            rendered.contains('1 people have attendance recorded'),
            'The count should be stated: ' + rendered
        );
    }

    // ---- the modals ------------------------------------------------------

    @isTest
    static void shouldBuildTheAttendanceModalsWithTheirContextIntact() {
        Employee__c subject = SlackAdminData.employee(ordinary().Id);
        Date day = businessToday();

        Test.startTest();
        Map<String, Object> punchModal = SlackAttendanceAdmin.addPunchModal(subject, day);
        Map<String, Object> picker = SlackAttendanceAdmin.pickerModal();
        Test.stopTest();

        Assert.areEqual(
            SlackAttendanceAdmin.ADD_PUNCH_CALLBACK, punchModal.get('callback_id'),
            'The punch form routes back'
        );
        Assert.areEqual(
            subject.Id + '|' + SlackBlocks.dateText(day), punchModal.get('private_metadata'),
            'It has to remember both whose day and which day'
        );
        Assert.areEqual(
            SlackAttendanceAdmin.PICK_CALLBACK, picker.get('callback_id'),
            'The picker routes back'
        );
        Assert.isTrue(
            JSON.serialize(picker).contains('Test Employee'),
            'The picker should offer the active people'
        );
    }

    @isTest
    static void shouldReadBackTheEmployeeAndDayPackedIntoAButton() {
        Employee__c subject = ordinary();
        String packed = subject.Id + '|2026-03-10';

        Test.startTest();
        Id readId = SlackAttendanceAdmin.employeeIn(packed);
        Date readDate = SlackAttendanceAdmin.dateIn(packed);
        Date fallback = SlackAttendanceAdmin.dateIn('nonsense');
        Id rejected = SlackAttendanceAdmin.employeeIn('not-an-id|2026-03-10');
        Test.stopTest();

        Assert.areEqual(subject.Id, readId, 'The employee should come back');
        Assert.areEqual(Date.newInstance(2026, 3, 10), readDate, 'And the day');
        Assert.areEqual(
            businessToday(), fallback,
            'Unparseable input falls back to today rather than throwing at the reader'
        );
        Assert.isNull(rejected, 'Client-supplied text that is not an id is refused');
    }
}
