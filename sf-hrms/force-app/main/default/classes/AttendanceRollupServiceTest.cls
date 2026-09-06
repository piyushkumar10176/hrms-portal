/**
 * Tests for AttendanceRollupService: daily rollup from punches, time-zone
 * bucketing, status derivation, lateness and bulk behaviour.
 */
@isTest
private class AttendanceRollupServiceTest {
    /** A Wednesday, so it is neither a weekend nor a seeded holiday. */
    private static final Date WORKDAY = Date.newInstance(2026, 9, 9);

    @TestSetup
    static void setupTestData() {
        TestDataFactory.createEmployees(3, true);
    }

    private static Employee__c firstEmployee() {
        return [SELECT Id FROM Employee__c ORDER BY Employee_Code__c LIMIT 1];
    }

    private static Attendance__c attendanceFor(Id employeeId, Date day) {
        List<Attendance__c> rows = [
            SELECT Id, Date__c, Check_In__c, Check_Out__c, Total_Hours__c,
                   Late_By_Minutes__c, Status__c
            FROM Attendance__c
            WHERE Employee__c = :employeeId AND Date__c = :day
        ];
        return rows.isEmpty() ? null : rows[0];
    }

    @isTest
    static void shouldCreateAttendance_WhenCheckInAndOutRecorded() {
        // Given
        Employee__c employee = firstEmployee();
        List<Attendance_Punch__c> punches = new List<Attendance_Punch__c>{
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 9, 30), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 18, 30), 'Check-Out')
        };

        // When
        Test.startTest();
        insert punches;
        Test.stopTest();

        // Then
        Attendance__c row = attendanceFor(employee.Id, WORKDAY);
        Assert.isNotNull(row, 'A daily attendance row should be created');
        Assert.areEqual(9, row.Total_Hours__c, 'Nine hours between check-in and check-out');
        Assert.areEqual('Present', row.Status__c, 'Nine hours is a full day');
        Assert.areEqual(0, row.Late_By_Minutes__c, 'Arriving at the shift start is not late');
    }

    @isTest
    static void shouldBucketByBusinessTimeZone_NotRunningUserTimeZone() {
        // Given an evening IST punch, which falls on the previous day in UTC-8
        Employee__c employee = firstEmployee();
        List<Attendance_Punch__c> punches = new List<Attendance_Punch__c>{
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 10, 0), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 23, 30), 'Check-Out')
        };

        // When
        Test.startTest();
        insert punches;
        Test.stopTest();

        // Then
        Assert.isNotNull(
            attendanceFor(employee.Id, WORKDAY),
            'The row must be filed against the IST date, not the running user date'
        );
        Assert.isNull(
            attendanceFor(employee.Id, WORKDAY.addDays(-1)),
            'No row should be filed against the previous day'
        );
    }

    @isTest
    static void shouldMarkHalfDay_WhenHoursBetweenHalfAndFull() {
        // Given
        Employee__c employee = firstEmployee();
        List<Attendance_Punch__c> punches = new List<Attendance_Punch__c>{
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 9, 30), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 14, 30), 'Check-Out')
        };

        // When
        Test.startTest();
        insert punches;
        Test.stopTest();

        // Then
        Attendance__c row = attendanceFor(employee.Id, WORKDAY);
        Assert.areEqual(5, row.Total_Hours__c, 'Five hours worked');
        Assert.areEqual('Half Day', row.Status__c, 'Five hours is between the half and full day thresholds');
    }

    @isTest
    static void shouldMarkAbsent_WhenHoursBelowHalfDay() {
        // Given
        Employee__c employee = firstEmployee();
        List<Attendance_Punch__c> punches = new List<Attendance_Punch__c>{
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 9, 30), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 11, 0), 'Check-Out')
        };

        // When
        Test.startTest();
        insert punches;
        Test.stopTest();

        // Then
        Assert.areEqual('Absent', attendanceFor(employee.Id, WORKDAY).Status__c,
            'Ninety minutes does not reach the half day threshold');
    }

    @isTest
    static void shouldRecordLateness_WhenArrivingAfterGrace() {
        // Given a 10:30 arrival against a 09:30 start with 15 minutes grace
        Employee__c employee = firstEmployee();
        List<Attendance_Punch__c> punches = new List<Attendance_Punch__c>{
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 10, 30), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 19, 0), 'Check-Out')
        };

        // When
        Test.startTest();
        insert punches;
        Test.stopTest();

        // Then
        Assert.areEqual(45, attendanceFor(employee.Id, WORKDAY).Late_By_Minutes__c,
            'Sixty minutes late less fifteen minutes grace');
    }

    @isTest
    static void shouldUseEarliestInAndLatestOut_WhenMultiplePunches() {
        // Given
        Employee__c employee = firstEmployee();
        List<Attendance_Punch__c> punches = new List<Attendance_Punch__c>{
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 9, 0), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 13, 0), 'Check-Out'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 14, 0), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 18, 0), 'Check-Out')
        };

        // When
        Test.startTest();
        insert punches;
        Test.stopTest();

        // Then
        Attendance__c row = attendanceFor(employee.Id, WORKDAY);
        Assert.areEqual(9, row.Total_Hours__c, 'Span runs from the first in to the last out');
    }

    @isTest
    static void shouldMarkWeekOff_WhenPunchesFallOnSaturday() {
        // Given 2026-09-12 is a Saturday
        Employee__c employee = firstEmployee();
        Date saturday = Date.newInstance(2026, 9, 12);
        List<Attendance_Punch__c> punches = new List<Attendance_Punch__c>{
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(saturday, 10, 0), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(saturday, 19, 0), 'Check-Out')
        };

        // When
        Test.startTest();
        insert punches;
        Test.stopTest();

        // Then
        Assert.areEqual('Week Off', attendanceFor(employee.Id, saturday).Status__c,
            'Saturday is a week off even when worked');
    }

    @isTest
    static void shouldMarkHoliday_WhenDateIsAHoliday() {
        // Given
        Employee__c employee = firstEmployee();
        insert new Holiday__c(Name = 'Test Holiday', Date__c = WORKDAY, Type__c = 'National');
        List<Attendance_Punch__c> punches = new List<Attendance_Punch__c>{
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 10, 0), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 19, 0), 'Check-Out')
        };

        // When
        Test.startTest();
        insert punches;
        Test.stopTest();

        // Then
        Assert.areEqual('Holiday', attendanceFor(employee.Id, WORKDAY).Status__c,
            'A seeded holiday takes precedence over hours worked');
    }

    @isTest
    static void shouldRemoveAttendance_WhenAllPunchesDeleted() {
        // Given
        Employee__c employee = firstEmployee();
        List<Attendance_Punch__c> punches = new List<Attendance_Punch__c>{
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 9, 30), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 18, 30), 'Check-Out')
        };
        insert punches;
        Assert.isNotNull(attendanceFor(employee.Id, WORKDAY), 'Row exists before delete');

        // When
        Test.startTest();
        delete punches;
        Test.stopTest();

        // Then
        Assert.isNull(attendanceFor(employee.Id, WORKDAY),
            'Removing every punch should remove the derived day');
    }

    @isTest
    static void shouldLeaveHoursNull_WhenCheckOutMissing() {
        // Given
        Employee__c employee = firstEmployee();

        // When
        Test.startTest();
        insert TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 9, 30), 'Check-In');
        Test.stopTest();

        // Then
        Attendance__c row = attendanceFor(employee.Id, WORKDAY);
        Assert.isNotNull(row, 'A row is still created for an open day');
        Assert.isNull(row.Total_Hours__c, 'Hours cannot be computed without a check-out');
        Assert.areEqual('Present', row.Status__c, 'An open day counts as present');
    }

    @isTest
    static void shouldRollUpAllEmployees_WhenBulkInserted() {
        // Given
        List<Employee__c> employees = [SELECT Id FROM Employee__c];
        List<Attendance_Punch__c> punches = new List<Attendance_Punch__c>();
        for (Employee__c employee : employees) {
            for (Integer dayOffset = 0; dayOffset < 5; dayOffset++) {
                Date day = WORKDAY.addDays(dayOffset);
                punches.add(TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(day, 9, 30), 'Check-In'));
                punches.add(TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(day, 18, 30), 'Check-Out'));
            }
        }

        // When
        Test.startTest();
        insert punches;
        Test.stopTest();

        // Then
        Assert.areEqual(
            employees.size() * 5,
            [SELECT COUNT() FROM Attendance__c],
            'One attendance row per employee per day'
        );
    }

    @isTest
    static void shouldTreatPunchTypeAliasesAsCheckIn() {
        // Given the punch type is free text and older rows used "Check In"
        Employee__c employee = firstEmployee();
        List<Attendance_Punch__c> punches = new List<Attendance_Punch__c>{
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 9, 30), 'Check In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 18, 30), 'Check-Out')
        };

        // When
        Test.startTest();
        insert punches;
        Test.stopTest();

        // Then
        Assert.areEqual(9, attendanceFor(employee.Id, WORKDAY).Total_Hours__c,
            'The unhyphenated legacy spelling must still count as a check-in');
    }
}
