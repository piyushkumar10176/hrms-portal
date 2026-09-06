/**
 * Tests for LeaveRequestTriggerHandler: balance recalculation, notification creation
 * and bulk safety.
 */
@isTest
private class LeaveRequestTriggerHandlerTest {
    private static final Decimal OPENING = 5;
    private static final Decimal ACCRUED = 12;

    @TestSetup
    static void setupTestData() {
        List<Employee__c> employees = TestDataFactory.createEmployees(251, true);
        Leave_Type__c leaveType = TestDataFactory.createLeaveType('Casual Leave', ACCRUED, true);
        TestDataFactory.createLeaveBalances(employees, leaveType, OPENING, ACCRUED, true);
    }

    private static Leave_Type__c getLeaveType() {
        return [SELECT Id, Annual_Quota__c FROM Leave_Type__c LIMIT 1];
    }

    private static List<Employee__c> getEmployees(Integer count) {
        return [SELECT Id FROM Employee__c ORDER BY Employee_Code__c LIMIT :count];
    }

    @isTest
    static void shouldSetAvailedAndClosingBalance_WhenRequestSubmitted() {
        // Given
        List<Employee__c> employees = getEmployees(1);
        Leave_Type__c leaveType = getLeaveType();
        Leave_Request__c request = TestDataFactory.buildLeaveRequest(
            employees[0], null, leaveType, 3, 'Submitted'
        );

        // When
        Test.startTest();
        insert request;
        Test.stopTest();

        // Then
        Leave_Balance__c balance = [
            SELECT Availed__c, Closing_Balance__c
            FROM Leave_Balance__c
            WHERE Employee__c = :employees[0].Id
        ];
        Assert.areEqual(3, balance.Availed__c, 'Availed should equal the submitted days');
        Assert.areEqual(
            OPENING + ACCRUED - 3,
            balance.Closing_Balance__c,
            'Closing balance should be opening plus accrued minus availed'
        );
    }

    @isTest
    static void shouldCountApprovedAndSubmitted_WhenBothExist() {
        // Given
        List<Employee__c> employees = getEmployees(1);
        Leave_Type__c leaveType = getLeaveType();
        List<Leave_Request__c> requests = new List<Leave_Request__c>{
            TestDataFactory.buildLeaveRequest(employees[0], null, leaveType, 2, 'Submitted'),
            TestDataFactory.buildLeaveRequest(employees[0], null, leaveType, 4, 'Approved')
        };

        // When
        Test.startTest();
        insert requests;
        Test.stopTest();

        // Then
        Leave_Balance__c balance = [
            SELECT Availed__c, Closing_Balance__c
            FROM Leave_Balance__c
            WHERE Employee__c = :employees[0].Id
        ];
        Assert.areEqual(6, balance.Availed__c, 'Both submitted and approved days count');
        Assert.areEqual(
            OPENING + ACCRUED - 6,
            balance.Closing_Balance__c,
            'Closing balance should reflect both requests'
        );
    }

    @isTest
    static void shouldExcludeRejected_WhenStatusChangedToRejected() {
        // Given
        List<Employee__c> employees = getEmployees(1);
        Leave_Type__c leaveType = getLeaveType();
        Leave_Request__c request = TestDataFactory.buildLeaveRequest(
            employees[0], null, leaveType, 3, 'Submitted'
        );
        insert request;

        // When
        Test.startTest();
        request.Status__c = 'Rejected';
        update request;
        Test.stopTest();

        // Then
        Leave_Balance__c balance = [
            SELECT Availed__c, Closing_Balance__c
            FROM Leave_Balance__c
            WHERE Employee__c = :employees[0].Id
        ];
        Assert.areEqual(0, balance.Availed__c, 'Rejected leave should not consume balance');
        Assert.areEqual(
            OPENING + ACCRUED,
            balance.Closing_Balance__c,
            'Closing balance should return to the full entitlement'
        );
    }

    @isTest
    static void shouldRestoreBalance_WhenRequestDeleted() {
        // Given
        List<Employee__c> employees = getEmployees(1);
        Leave_Type__c leaveType = getLeaveType();
        Leave_Request__c request = TestDataFactory.buildLeaveRequest(
            employees[0], null, leaveType, 5, 'Approved'
        );
        insert request;

        // When
        Test.startTest();
        delete request;
        Test.stopTest();

        // Then
        Leave_Balance__c balance = [
            SELECT Availed__c, Closing_Balance__c
            FROM Leave_Balance__c
            WHERE Employee__c = :employees[0].Id
        ];
        Assert.areEqual(0, balance.Availed__c, 'Deleting a request should release the days');
        Assert.areEqual(
            OPENING + ACCRUED,
            balance.Closing_Balance__c,
            'Closing balance should be restored after delete'
        );
    }

    @isTest
    static void shouldNotifyApprover_WhenRequestInserted() {
        // Given
        List<Employee__c> employees = getEmployees(2);
        Leave_Type__c leaveType = getLeaveType();
        Leave_Request__c request = TestDataFactory.buildLeaveRequest(
            employees[0], employees[1], leaveType, 2, 'Submitted'
        );

        // When
        Test.startTest();
        insert request;
        Test.stopTest();

        // Then
        List<Notification__c> notifications = [
            SELECT Employee__c, Type__c, Is_Read__c, Related_Record_Id__c
            FROM Notification__c
        ];
        Assert.areEqual(1, notifications.size(), 'One notification should be raised');
        Assert.areEqual(
            employees[1].Id,
            notifications[0].Employee__c,
            'The approver should be notified'
        );
        Assert.areEqual('Leave', notifications[0].Type__c, 'Type should be Leave');
        Assert.isFalse(notifications[0].Is_Read__c, 'New notifications start unread');
        Assert.areEqual(
            request.Id,
            notifications[0].Related_Record_Id__c,
            'Notification should link back to the request'
        );
    }

    @isTest
    static void shouldNotifyEmployee_WhenStatusChanges() {
        // Given
        List<Employee__c> employees = getEmployees(2);
        Leave_Type__c leaveType = getLeaveType();
        Leave_Request__c request = TestDataFactory.buildLeaveRequest(
            employees[0], employees[1], leaveType, 2, 'Submitted'
        );
        insert request;
        delete [SELECT Id FROM Notification__c];

        // When
        Test.startTest();
        request.Status__c = 'Approved';
        update request;
        Test.stopTest();

        // Then
        List<Notification__c> notifications = [
            SELECT Employee__c, Message__c FROM Notification__c
        ];
        Assert.areEqual(1, notifications.size(), 'One status notification should be raised');
        Assert.areEqual(
            employees[0].Id,
            notifications[0].Employee__c,
            'The requesting employee should be notified'
        );
        Assert.isTrue(
            notifications[0].Message__c.contains('Approved'),
            'Message should name the new status'
        );
    }

    @isTest
    static void shouldNotNotify_WhenStatusUnchanged() {
        // Given
        List<Employee__c> employees = getEmployees(2);
        Leave_Type__c leaveType = getLeaveType();
        Leave_Request__c request = TestDataFactory.buildLeaveRequest(
            employees[0], employees[1], leaveType, 2, 'Submitted'
        );
        insert request;
        delete [SELECT Id FROM Notification__c];

        // When
        Test.startTest();
        request.Reason__c = 'Updated reason only';
        update request;
        Test.stopTest();

        // Then
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Notification__c],
            'No notification when status did not change'
        );
    }

    @isTest
    static void shouldRecalculateAllBalances_WhenBulkInserted() {
        // Given
        List<Employee__c> employees = getEmployees(251);
        Leave_Type__c leaveType = getLeaveType();
        List<Leave_Request__c> requests = new List<Leave_Request__c>();
        for (Employee__c employee : employees) {
            requests.add(
                TestDataFactory.buildLeaveRequest(employee, null, leaveType, 2, 'Approved')
            );
        }

        // When
        Test.startTest();
        insert requests;
        Test.stopTest();

        // Then
        List<Leave_Balance__c> balances = [
            SELECT Availed__c, Closing_Balance__c FROM Leave_Balance__c
        ];
        Assert.areEqual(251, balances.size(), 'All balance rows should exist');
        for (Leave_Balance__c balance : balances) {
            Assert.areEqual(2, balance.Availed__c, 'Every employee availed two days');
            Assert.areEqual(
                OPENING + ACCRUED - 2,
                balance.Closing_Balance__c,
                'Every closing balance should be recalculated'
            );
        }
    }

    @isTest
    static void shouldNotFail_WhenEmployeeHasNoBalanceRow() {
        // Given
        Leave_Type__c orphanType = TestDataFactory.createLeaveType('Sabbatical', 30, true);
        List<Employee__c> employees = getEmployees(1);
        Leave_Request__c request = TestDataFactory.buildLeaveRequest(
            employees[0], null, orphanType, 3, 'Submitted'
        );

        // When
        Test.startTest();
        insert request;
        Test.stopTest();

        // Then
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM Leave_Request__c WHERE Leave_Type__c = :orphanType.Id],
            'Request should still be created when no balance row exists'
        );
    }
}
