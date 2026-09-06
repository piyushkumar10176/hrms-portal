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
                   Gross_Hours__c, Break_Minutes__c,
                   Late_By_Minutes__c, Status__c, Penalty__c, Penalty_Reason__c
            FROM Attendance__c
            WHERE Employee__c = :employeeId AND Date__c = :day
        ];
        return rows.isEmpty() ? null : rows[0];
    }

    @isTest
    static void shouldCreateAttendance_WhenCheckInAndOutRecorded() {
        // Given a 09:30 arrival, comfortably before the 10:00 shift start
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
        // The shift runs 10:00 to 19:00 with 15 minutes grace, so a 10:45 arrival
        // is 45 minutes past the start and 30 minutes past the grace period. It is
        // still before the 11:00 penalty cutoff, which keeps this test about
        // lateness alone.
        Employee__c employee = firstEmployee();
        List<Attendance_Punch__c> punches = new List<Attendance_Punch__c>{
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 10, 45), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 20, 0), 'Check-Out')
        };

        // When
        Test.startTest();
        insert punches;
        Test.stopTest();

        // Then
        Attendance__c row = attendanceFor(employee.Id, WORKDAY);
        Assert.areEqual(30, row.Late_By_Minutes__c,
            'Forty-five minutes past the 10:00 start, less fifteen minutes grace');
        Assert.isFalse(row.Penalty__c, 'Arriving before 11:00 and working a full shift is not a breach');
    }

    @isTest
    static void shouldSeparateGrossFromEffective_WhenMultiplePunches() {
        // Given a one-hour lunch taken in the middle of a nine-hour presence
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
        Assert.areEqual(9, row.Gross_Hours__c, 'Gross spans the first in to the last out');
        Assert.areEqual(60, row.Break_Minutes__c, 'The 13:00 to 14:00 gap is the break');
        Assert.areEqual(8, row.Total_Hours__c, 'Effective hours exclude the break');
        Assert.isFalse(row.Penalty__c, 'Eight effective hours meets the policy');
    }

    @isTest
    static void shouldSumEveryGap_WhenBreakTakenInPieces() {
        // The worked example: in at 10:00, out at 10:30, back at 11:15 is
        // forty-five minutes. A second short gap later in the day adds to it.
        Employee__c employee = firstEmployee();
        List<Attendance_Punch__c> punches = new List<Attendance_Punch__c>{
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 10, 0), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 10, 30), 'Check-Out'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 11, 15), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 16, 0), 'Check-Out'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 16, 15), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 19, 0), 'Check-Out')
        };

        // When
        Test.startTest();
        insert punches;
        Test.stopTest();

        // Then
        Attendance__c row = attendanceFor(employee.Id, WORKDAY);
        Assert.areEqual(60, row.Break_Minutes__c, 'Forty-five minutes plus fifteen');
        Assert.areEqual(9, row.Gross_Hours__c, '10:00 to 19:00 on premises');
        Assert.areEqual(8, row.Total_Hours__c, 'Nine hours less the hour of break');
        Assert.areEqual('Present', row.Status__c, 'Eight effective hours is a full day');
        Assert.isFalse(row.Penalty__c, 'The full break allowance was used, and the work was done');
    }

    @isTest
    static void shouldReportZeroBreak_WhenNeverClockedOutMidDay() {
        // Given
        Employee__c employee = firstEmployee();
        List<Attendance_Punch__c> punches = new List<Attendance_Punch__c>{
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 10, 0), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 19, 0), 'Check-Out')
        };

        // When
        Test.startTest();
        insert punches;
        Test.stopTest();

        // Then
        Attendance__c row = attendanceFor(employee.Id, WORKDAY);
        Assert.areEqual(0, row.Break_Minutes__c, 'No mid-day gap means no break');
        Assert.areEqual(row.Gross_Hours__c, row.Total_Hours__c,
            'With no break, effective hours equal gross hours');
    }

    @isTest
    static void shouldPenaliseLongBreak_WhenItPushesEffectiveHoursShort() {
        // Given a two-hour break inside the same nine-hour presence
        Employee__c employee = firstEmployee();
        List<Attendance_Punch__c> punches = new List<Attendance_Punch__c>{
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 10, 0), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 13, 0), 'Check-Out'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 15, 0), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 19, 0), 'Check-Out')
        };

        // When
        Test.startTest();
        insert punches;
        Test.stopTest();

        // Then
        Attendance__c row = attendanceFor(employee.Id, WORKDAY);
        Assert.areEqual(120, row.Break_Minutes__c, 'Two hours away from the desk');
        Assert.areEqual(7, row.Total_Hours__c, 'Nine hours present less two hours of break');
        Assert.isTrue(row.Penalty__c, 'Seven effective hours is short of the eight required');
        Assert.isTrue(
            row.Penalty_Reason__c.contains('2h break'),
            'The reason should name the break that caused the shortfall, was: ' + row.Penalty_Reason__c
        );
        Assert.isTrue(
            row.Penalty_Reason__c.contains('over the 1h allowance'),
            'The reason should call out the overrun, was: ' + row.Penalty_Reason__c
        );
    }

    @isTest
    static void shouldNotCountLeadingCheckOutAsBreak_WhenDayOpensWithAnOut() {
        // A device that fires a stray check-out before the first check-in must not
        // open a break that swallows the whole morning.
        Employee__c employee = firstEmployee();
        List<Attendance_Punch__c> punches = new List<Attendance_Punch__c>{
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 9, 0), 'Check-Out'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 10, 0), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 19, 0), 'Check-Out')
        };

        // When
        Test.startTest();
        insert punches;
        Test.stopTest();

        // Then
        Attendance__c row = attendanceFor(employee.Id, WORKDAY);
        Assert.areEqual(0, row.Break_Minutes__c, 'A check-out before any check-in is not a break');
    }

    @isTest
    static void shouldIgnoreRepeatedCheckOut_WhenDeviceFiresTwice() {
        // Given the break opens at the first check-out of the run, not the last
        Employee__c employee = firstEmployee();
        List<Attendance_Punch__c> punches = new List<Attendance_Punch__c>{
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 10, 0), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 13, 0), 'Check-Out'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 13, 1), 'Check-Out'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 14, 0), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 19, 0), 'Check-Out')
        };

        // When
        Test.startTest();
        insert punches;
        Test.stopTest();

        // Then
        Assert.areEqual(60, attendanceFor(employee.Id, WORKDAY).Break_Minutes__c,
            'The duplicate check-out must not shorten the break to fifty-nine minutes');
    }

    @isTest
    static void shouldCountCompletedWork_WhenBackFromBreakButStillWorking() {
        // Mid-afternoon state: back from a 45 minute lunch and still at the desk.
        // Subtracting break from the first-in-to-last-out span would report a
        // negative day here, because the break ran past the last check-out.
        Employee__c employee = firstEmployee();
        List<Attendance_Punch__c> punches = new List<Attendance_Punch__c>{
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 10, 0), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 10, 30), 'Check-Out'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 11, 15), 'Check-In')
        };

        // When
        Test.startTest();
        insert punches;
        Test.stopTest();

        // Then
        Attendance__c row = attendanceFor(employee.Id, WORKDAY);
        Assert.areEqual(45, row.Break_Minutes__c, 'The 10:30 to 11:15 gap is the break');
        Assert.areEqual(0.5, row.Total_Hours__c, 'Only the completed 10:00 to 10:30 stretch counts');
        Assert.areEqual(1.25, row.Gross_Hours__c, 'Elapsed since arriving, break included');
        Assert.areEqual(
            row.Gross_Hours__c,
            row.Total_Hours__c + (row.Break_Minutes__c / 60),
            'Worked plus break must account for the whole elapsed day'
        );
    }

    @isTest
    static void shouldRebuildCleanly_WhenDayIsUnchanged() {
        // Replaying the same punches must be a no-op rather than an error. The
        // change comparison reads fields the query has to select, and a missing
        // one stays hidden until exactly this case: a rebuild with nothing to
        // change, where the comparison runs to the end instead of short-circuiting.
        Employee__c employee = firstEmployee();
        List<Attendance_Punch__c> punches = new List<Attendance_Punch__c>{
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 10, 0), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 13, 0), 'Check-Out'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 14, 0), 'Check-In'),
            TestDataFactory.buildPunch(employee, TestDataFactory.istInstant(WORKDAY, 19, 0), 'Check-Out')
        };
        insert punches;
        Attendance__c before = attendanceFor(employee.Id, WORKDAY);

        // When the same punches are rolled up a second time
        Test.startTest();
        AttendanceRollupService.rebuild([
            SELECT Id, Employee__c, Punch_DateTime__c, Punch_Type__c
            FROM Attendance_Punch__c WHERE Employee__c = :employee.Id
        ]);
        Test.stopTest();

        // Then
        Attendance__c after = attendanceFor(employee.Id, WORKDAY);
        Assert.areEqual(before.Id, after.Id, 'The same row is kept, not replaced');
        Assert.areEqual(60, after.Break_Minutes__c, 'The break is unchanged');
        Assert.areEqual(8, after.Total_Hours__c, 'Effective hours are unchanged');
    }

    @isTest
    static void shouldFormatMinutes_ForEveryShape() {
        Assert.areEqual('0m', AttendanceRollupService.minutesText(0), 'Zero reads as 0m');
        Assert.areEqual('45m', AttendanceRollupService.minutesText(45), 'Under an hour omits the hour');
        Assert.areEqual('1h', AttendanceRollupService.minutesText(60), 'A whole hour omits the minutes');
        Assert.areEqual('1h 15m', AttendanceRollupService.minutesText(75), 'Both parts are shown');
        Assert.areEqual('0m', AttendanceRollupService.minutesText(null), 'Null is treated as no break');
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
        // Given a 09:30 arrival, comfortably before the 10:00 shift start
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
