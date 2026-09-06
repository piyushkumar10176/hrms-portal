/**
 * Tests for the regularization allowance and for the attendance penalty rules.
 */
@isTest
private class RegularizationServiceTest {
    /** A Wednesday, so neither a weekend nor a seeded holiday. Used for attendance. */
    private static final Date WORKDAY = Date.newInstance(2026, 9, 9);

    /**
     * A past weekday. Regularization carries a Past_Date_Only validation rule,
     * so its test data must be behind today rather than a fixed future date.
     */
    private static Date pastWorkday() {
        Date candidate = Date.today().addDays(-1);
        while (candidate.toStartOfWeek() == candidate || candidate.daysBetween(candidate.toStartOfWeek()) == -6) {
            candidate = candidate.addDays(-1);
        }
        return candidate;
    }

    @TestSetup
    static void setupTestData() {
        TestDataFactory.createEmployees(2, true);
    }

    private static Employee__c firstEmployee() {
        return [SELECT Id FROM Employee__c ORDER BY Employee_Code__c LIMIT 1];
    }

    private static void raiseRegularization(Id employeeId, Date onDate, String status) {
        insert new Regularization_Request__c(
            Employee__c = employeeId,
            Date__c = onDate,
            Reason__c = 'Test',
            Status__c = status
        );
    }

    @isTest
    static void shouldAllow_WhenUnderTheMonthlyLimit() {
        Employee__c employee = firstEmployee();
        Date day = pastWorkday();
        raiseRegularization(employee.Id, day, 'Submitted');

        Test.startTest();
        RegularizationService.PolicyResult result = RegularizationService.check(employee.Id, day);
        Test.stopTest();

        Assert.isTrue(result.allowed, 'One of three used is still allowed');
        Assert.areEqual(1, result.used, 'One request counted');
        Assert.areEqual(3, result.allowance, 'Allowance comes from the label');
    }

    @isTest
    static void shouldRefuse_WhenMonthlyLimitReached() {
        Employee__c employee = firstEmployee();
        Date day = pastWorkday();
        for (Integer i = 0; i < 3; i++) {
            raiseRegularization(employee.Id, day.addDays(-i), 'Submitted');
        }

        Test.startTest();
        RegularizationService.PolicyResult result = RegularizationService.check(employee.Id, day);
        Test.stopTest();

        Assert.isFalse(result.allowed, 'The fourth request in a month is refused');
        Assert.areEqual(3, result.used, 'All three counted');
        Assert.isTrue(result.reason.contains('used all 3'), 'The refusal explains itself');
    }

    @isTest
    static void shouldCountRejectedAgainstTheAllowance() {
        // A rejected request still consumes the allowance: the limit exists to stop
        // regularization substituting for attendance, not to reward refusal.
        Employee__c employee = firstEmployee();
        Date day = pastWorkday();
        raiseRegularization(employee.Id, day, 'Rejected');

        Test.startTest();
        Integer used = RegularizationService.usedInMonth(employee.Id, day);
        Test.stopTest();

        Assert.areEqual(1, used, 'A rejected request still counts');
    }

    @isTest
    static void shouldNotCountOtherMonths() {
        Employee__c employee = firstEmployee();
        Date day = pastWorkday();
        raiseRegularization(employee.Id, day.addMonths(-1), 'Approved');

        Test.startTest();
        Integer used = RegularizationService.usedInMonth(employee.Id, day);
        Test.stopTest();

        Assert.areEqual(0, used, 'Last month does not consume this month');
    }

    @isTest
    static void shouldRefuseFutureDates() {
        Employee__c employee = firstEmployee();

        Test.startTest();
        RegularizationService.PolicyResult result =
            RegularizationService.check(employee.Id, Date.today().addDays(5));
        Test.stopTest();

        Assert.isFalse(result.allowed, 'A future day cannot be regularized');
    }

    @isTest
    static void shouldPenaliseLateArrival() {
        // Arriving at 11:30 IST, after the 11:00 cutoff, but working a full day.
        Employee__c employee = firstEmployee();
        List<Attendance_Punch__c> punches = new List<Attendance_Punch__c>{
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 11, 30), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 21, 0), 'Check-Out')
        };

        Test.startTest();
        insert punches;
        Test.stopTest();

        Attendance__c row = [
            SELECT Penalty__c, Penalty_Reason__c, Total_Hours__c
            FROM Attendance__c WHERE Employee__c = :employee.Id AND Date__c = :WORKDAY
        ];
        Assert.areEqual(9.5, row.Total_Hours__c, 'A full shift was worked');
        Assert.isTrue(row.Penalty__c, 'Arriving after the cutoff is penalised');
        Assert.isTrue(row.Penalty_Reason__c.contains('11:00'), 'The reason names the cutoff');
    }

    @isTest
    static void shouldPenaliseShortShift() {
        // On time, but only seven effective hours worked against the eight the
        // nine-hour shift contains once its one-hour break is taken out.
        Employee__c employee = firstEmployee();
        List<Attendance_Punch__c> punches = new List<Attendance_Punch__c>{
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 9, 30), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 16, 30), 'Check-Out')
        };

        Test.startTest();
        insert punches;
        Test.stopTest();

        Attendance__c row = [
            SELECT Penalty__c, Penalty_Reason__c FROM Attendance__c
            WHERE Employee__c = :employee.Id AND Date__c = :WORKDAY
        ];
        Assert.isTrue(row.Penalty__c, 'Leaving before a full shift is penalised');
        Assert.isTrue(row.Penalty_Reason__c.contains('of 8 effective hours'),
            'The reason names the shortfall, was: ' + row.Penalty_Reason__c);
    }

    @isTest
    static void shouldNotPenalise_WhenOnTimeAndFullShift() {
        Employee__c employee = firstEmployee();
        List<Attendance_Punch__c> punches = new List<Attendance_Punch__c>{
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 9, 30), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 18, 45), 'Check-Out')
        };

        Test.startTest();
        insert punches;
        Test.stopTest();

        Attendance__c row = [
            SELECT Penalty__c, Total_Hours__c FROM Attendance__c
            WHERE Employee__c = :employee.Id AND Date__c = :WORKDAY
        ];
        Assert.areEqual(9.25, row.Total_Hours__c, 'Just over nine hours');
        Assert.isFalse(row.Penalty__c, 'A compliant day carries no penalty');
    }

    @isTest
    static void shouldNotPenaliseWeekend() {
        // 2026-09-12 is a Saturday: a short day there is not a breach.
        Employee__c employee = firstEmployee();
        Date saturday = Date.newInstance(2026, 9, 12);
        List<Attendance_Punch__c> punches = new List<Attendance_Punch__c>{
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(saturday, 12, 0), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(saturday, 14, 0), 'Check-Out')
        };

        Test.startTest();
        insert punches;
        Test.stopTest();

        Attendance__c row = [
            SELECT Penalty__c, Status__c FROM Attendance__c
            WHERE Employee__c = :employee.Id AND Date__c = :saturday
        ];
        Assert.areEqual('Week Off', row.Status__c, 'Saturday is a week off');
        Assert.isFalse(row.Penalty__c, 'A week off is never penalised');
    }

    @isTest
    static void shouldClearPenalty_WhenPunchesCorrected() {
        Employee__c employee = firstEmployee();
        Attendance_Punch__c checkIn =
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 11, 30), 'Check-In');
        Attendance_Punch__c checkOut =
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 21, 0), 'Check-Out');
        insert new List<Attendance_Punch__c>{ checkIn, checkOut };

        Attendance__c before = [
            SELECT Penalty__c FROM Attendance__c
            WHERE Employee__c = :employee.Id AND Date__c = :WORKDAY
        ];
        Assert.isTrue(before.Penalty__c, 'Late arrival penalised to begin with');

        Test.startTest();
        checkIn.Punch_DateTime__c = TestDataFactory.istInstant(WORKDAY, 9, 30);
        update checkIn;
        Test.stopTest();

        Attendance__c after = [
            SELECT Penalty__c FROM Attendance__c
            WHERE Employee__c = :employee.Id AND Date__c = :WORKDAY
        ];
        Assert.isFalse(after.Penalty__c, 'Correcting the punch clears the penalty; it is derived, not sticky');
    }

    @isTest
    static void shouldListPenalisedDaysForTheMonth() {
        Employee__c employee = firstEmployee();
        insert new List<Attendance_Punch__c>{
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 11, 30), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 21, 0), 'Check-Out')
        };

        Test.startTest();
        List<Attendance__c> penalised = RegularizationService.penalisedDays(employee.Id, WORKDAY);
        Test.stopTest();

        Assert.areEqual(1, penalised.size(), 'The penalised day is offered for regularization');
    }
}
