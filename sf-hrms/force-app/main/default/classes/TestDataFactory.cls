/**
 * Shared test data builder for the HRMS objects.
 */
@isTest
public with sharing class TestDataFactory {
    /**
     * @param count number of employees to build
     * @param doInsert whether to insert them
     * @return the employees
     */
    public static List<Employee__c> createEmployees(Integer count, Boolean doInsert) {
        List<Employee__c> employees = new List<Employee__c>();
        for (Integer i = 0; i < count; i++) {
            employees.add(
                new Employee__c(
                    Name = 'Test Employee ' + i,
                    First_Name__c = 'Test',
                    Last_Name__c = 'Employee ' + i,
                    Employee_Code__c = 'TST' + String.valueOf(i).leftPad(4, '0'),
                    Official_Email__c = 'test.employee' + i + '@example.invalid',
                    Employee_Status__c = 'Active'
                )
            );
        }
        if (doInsert) {
            insert employees;
        }
        return employees;
    }

    /**
     * @param name leave type name
     * @param annualQuota the yearly entitlement
     * @param doInsert whether to insert it
     * @return the leave type
     */
    public static Leave_Type__c createLeaveType(String name, Decimal annualQuota, Boolean doInsert) {
        Leave_Type__c leaveType = new Leave_Type__c(
            Name = name,
            Code__c = name.left(2).toUpperCase(),
            Annual_Quota__c = annualQuota,
            Carry_Forward_Allowed__c = false
        );
        if (doInsert) {
            insert leaveType;
        }
        return leaveType;
    }

    /**
     * @param employees the employees to build balances for
     * @param leaveType the leave type
     * @param opening opening balance carried forward
     * @param accrued entitlement accrued this year
     * @param doInsert whether to insert them
     * @return the balances
     */
    public static List<Leave_Balance__c> createLeaveBalances(
        List<Employee__c> employees,
        Leave_Type__c leaveType,
        Decimal opening,
        Decimal accrued,
        Boolean doInsert
    ) {
        List<Leave_Balance__c> balances = new List<Leave_Balance__c>();
        for (Employee__c employee : employees) {
            balances.add(
                new Leave_Balance__c(
                    Employee__c = employee.Id,
                    Leave_Type__c = leaveType.Id,
                    Year__c = String.valueOf(Date.today().year()),
                    Opening_Balance__c = opening,
                    Accrued__c = accrued,
                    Availed__c = 0
                )
            );
        }
        if (doInsert) {
            insert balances;
        }
        return balances;
    }

    /**
     * @param employee the requesting employee
     * @param approver the approving employee
     * @param leaveType the leave type
     * @param days number of days requested
     * @param status the request status
     * @return an uninserted leave request
     */
    public static Leave_Request__c buildLeaveRequest(
        Employee__c employee,
        Employee__c approver,
        Leave_Type__c leaveType,
        Decimal days,
        String status
    ) {
        return new Leave_Request__c(
            Employee__c = employee.Id,
            Approver__c = approver == null ? null : approver.Id,
            Leave_Type__c = leaveType.Id,
            From_Date__c = Date.today().addDays(10),
            To_Date__c = Date.today().addDays(10 + Integer.valueOf(days) - 1),
            Days__c = days,
            Half_Day__c = false,
            Status__c = status
        );
    }

    /**
     * @param employee the employee punching
     * @param punchTime the punch instant
     * @param punchType "Check-In" or "Check-Out"
     * @return an uninserted punch
     */
    public static Attendance_Punch__c buildPunch(
        Employee__c employee,
        DateTime punchTime,
        String punchType
    ) {
        return new Attendance_Punch__c(
            Employee__c = employee.Id,
            Punch_DateTime__c = punchTime,
            Punch_Type__c = punchType,
            Source__c = 'Test'
        );
    }

    /**
     * Builds an instant from a date and an Asia/Kolkata wall-clock time.
     * IST is UTC+5:30 with no daylight saving, so the offset is constant.
     *
     * @param day the business date
     * @param hour hour in IST
     * @param minute minute in IST
     * @return the equivalent instant
     */
    public static DateTime istInstant(Date day, Integer hour, Integer minute) {
        Integer totalMinutes = hour * 60 + minute - 330;
        DateTime midnightUtc = DateTime.newInstanceGmt(day, Time.newInstance(0, 0, 0, 0));
        return midnightUtc.addMinutes(totalMinutes);
    }
}
