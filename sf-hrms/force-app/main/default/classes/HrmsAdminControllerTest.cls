/**
 * Tests for HrmsAdminController: what the grid returns, and that a bulk apply
 * changes only what it was asked to.
 */
@isTest
private class HrmsAdminControllerTest {

    @TestSetup
    static void setupTestData() {
        TestDataFactory.createEmployees(4, true);
    }

    private static List<Employee__c> employees() {
        return [SELECT Id, Name, Employee_Code__c, Role__c, Reporting_Manager__c,
                       Department_Ref__c, Designation_Ref__c
                FROM Employee__c ORDER BY Employee_Code__c];
    }

    @isTest
    static void shouldReturnEveryActiveEmployeeWithItsOptions() {
        Test.startTest();
        HrmsAdminController.GridData data = HrmsAdminController.loadGrid(false);
        Test.stopTest();

        Assert.areEqual(4, data.employees.size(), 'Every active employee is listed');
        Assert.areEqual(3, data.roles.size(), 'Employee, HR and Admin');
        Assert.areEqual(4, data.employmentTypes.size(), 'Four employment types');
        Assert.areEqual(4, data.managers.size(), 'Any active employee can be a manager');
        Assert.isNotNull(data.departments, 'Department options are returned even when empty');
    }

    @isTest
    static void shouldFlagWhoCannotBeReachedOrSignIn() {
        // Nothing in the factory sets a password or a Slack id, so every row
        // should report both gaps. These are invisible until somebody complains,
        // which is the reason the grid surfaces them at all.
        Test.startTest();
        HrmsAdminController.GridData data = HrmsAdminController.loadGrid(false);
        Test.stopTest();

        for (HrmsAdminController.EmployeeRow row : data.employees) {
            Assert.isTrue(row.neverSignedIn, row.name + ' has no portal password');
            Assert.isTrue(row.slackUnlinked, row.name + ' has no Slack account linked');
        }
    }

    @isTest
    static void shouldDefaultABlankRoleToEmployee() {
        // Twenty of the twenty-eight real employees have no role set at all. A
        // blank must read as the least privileged option, never as unset.
        List<Employee__c> staff = employees();
        staff[0].Role__c = null;
        update staff[0];

        Test.startTest();
        HrmsAdminController.GridData data = HrmsAdminController.loadGrid(false);
        Test.stopTest();

        for (HrmsAdminController.EmployeeRow row : data.employees) {
            if (row.recordId == staff[0].Id) {
                Assert.areEqual('Employee', row.role, 'A blank role reads as Employee');
            }
        }
    }

    @isTest
    static void shouldApplyOneChangeToManyEmployees() {
        List<Employee__c> staff = employees();
        List<Id> targets = new List<Id>{ staff[0].Id, staff[1].Id, staff[2].Id };

        Test.startTest();
        List<String> failures = HrmsAdminController.applyToMany(
            targets, null, null, staff[3].Id, 'HR'
        );
        Test.stopTest();

        Assert.areEqual(0, failures.size(), 'Nothing should fail');
        for (Employee__c updated : [
            SELECT Id, Role__c, Reporting_Manager__c FROM Employee__c WHERE Id IN :targets
        ]) {
            Assert.areEqual('HR', updated.Role__c, 'The role was applied');
            Assert.areEqual(staff[3].Id, updated.Reporting_Manager__c, 'The manager was applied');
        }
    }

    @isTest
    static void shouldLeaveBlankFieldsAlone_RatherThanClearThem() {
        // A caller setting only the role must not wipe everyone's manager. This
        // is the difference between a useful bulk action and a destructive one.
        List<Employee__c> staff = employees();
        staff[0].Reporting_Manager__c = staff[3].Id;
        update staff[0];

        Test.startTest();
        HrmsAdminController.applyToMany(new List<Id>{ staff[0].Id }, null, null, null, 'Admin');
        Test.stopTest();

        Employee__c after = [
            SELECT Role__c, Reporting_Manager__c FROM Employee__c WHERE Id = :staff[0].Id
        ];
        Assert.areEqual('Admin', after.Role__c, 'The role changed');
        Assert.areEqual(staff[3].Id, after.Reporting_Manager__c,
            'The manager was left alone, not cleared');
    }

    @isTest
    static void shouldRefuseSomebodyReportingToThemselves() {
        // Self-management would leave the person with no possible approver,
        // because nobody may decide their own request.
        List<Employee__c> staff = employees();

        Test.startTest();
        try {
            HrmsAdminController.applyToMany(
                new List<Id>{ staff[0].Id }, null, null, staff[0].Id, null
            );
            Assert.fail('Expected the self-management guard to refuse this');
        } catch (Exception e) {
            Assert.isTrue(
                e.getMessage().contains('cannot report to themselves')
                    || e.getTypeName().contains('AuraHandledException'),
                'Refused for the right reason, was: ' + e.getMessage()
            );
        }
        Test.stopTest();
    }

    @isTest
    static void shouldIgnoreAnEmptyRequest() {
        Test.startTest();
        // "nulls" is reserved in Apex, from ORDER BY ... NULLS LAST.
        List<String> emptySelection = HrmsAdminController.applyToMany(new List<Id>(), null, null, null, null);
        List<String> nullSelection = HrmsAdminController.applyToMany(null, null, null, null, null);
        List<String> noRows = HrmsAdminController.saveGrid(null);
        Test.stopTest();

        Assert.areEqual(0, emptySelection.size(), 'An empty selection changes nothing');
        Assert.areEqual(0, nullSelection.size(), 'A null selection changes nothing');
        Assert.areEqual(0, noRows.size(), 'A null row list changes nothing');
    }

    @isTest
    static void shouldSaveRowEditsFromTheGrid() {
        List<Employee__c> staff = employees();
        HrmsAdminController.EmployeeRow row = new HrmsAdminController.EmployeeRow();
        row.recordId = staff[0].Id;
        row.name = staff[0].Name;
        row.role = 'HR';
        row.status = 'Active';

        Test.startTest();
        List<String> failures = HrmsAdminController.saveGrid(
            new List<HrmsAdminController.EmployeeRow>{ row }
        );
        Test.stopTest();

        Assert.areEqual(0, failures.size(), 'The edit should save');
        Assert.areEqual('HR',
            [SELECT Role__c FROM Employee__c WHERE Id = :staff[0].Id].Role__c,
            'The role was written');
    }
}
