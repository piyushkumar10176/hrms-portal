/**
 * Tests for EmployeeTriggerHandler: onboarding task generation from templates
 * when a new active employee is created.
 */
@isTest
private class EmployeeTriggerHandlerTest {
    private static Onboarding_Template__c buildTemplate(Id departmentId, Id designationId) {
        return new Onboarding_Template__c(
            Active__c = true,
            Department__c = departmentId,
            Designation__c = designationId
        );
    }

    private static void addTasks(Onboarding_Template__c template, Integer count, String assigneeRole) {
        List<Onboarding_Template_Task__c> tasks = new List<Onboarding_Template_Task__c>();
        for (Integer i = 0; i < count; i++) {
            tasks.add(new Onboarding_Template_Task__c(
                Onboarding_Template__c = template.Id,
                Task_Name__c = 'Task ' + i,
                Assignee_Role__c = assigneeRole,
                Due_Days_After_Joining__c = i + 1
            ));
        }
        insert tasks;
    }

    @isTest
    static void shouldCreateTasks_WhenGenericTemplateExists() {
        // Given a template that targets neither a department nor a designation
        Onboarding_Template__c template = buildTemplate(null, null);
        insert template;
        addTasks(template, 3, 'HR');

        // When
        Test.startTest();
        Employee__c employee = new Employee__c(
            Name = 'Onboarding Target',
            First_Name__c = 'Onboarding',
            Last_Name__c = 'Target',
            Official_Email__c = 'onboarding.target@example.invalid',
            Employee_Status__c = 'Active',
            Date_of_Joining__c = Date.today()
        );
        insert employee;
        Test.stopTest();

        // Then
        List<Onboarding_Task__c> tasks = [
            SELECT Id, Status__c, Due_Date__c FROM Onboarding_Task__c WHERE Employee__c = :employee.Id
        ];
        Assert.areEqual(3, tasks.size(), 'One task per template task');
        for (Onboarding_Task__c task : tasks) {
            Assert.areEqual('Pending', task.Status__c, 'New tasks start pending');
            Assert.isNotNull(task.Due_Date__c, 'Due date is derived from the joining date');
        }
    }

    @isTest
    static void shouldNotCreateTasks_WhenEmployeeInactive() {
        // Given
        Onboarding_Template__c template = buildTemplate(null, null);
        insert template;
        addTasks(template, 2, 'HR');

        // When
        Test.startTest();
        Employee__c employee = new Employee__c(
            Name = 'Inactive Hire',
            First_Name__c = 'Inactive',
            Last_Name__c = 'Hire',
            Official_Email__c = 'inactive.hire@example.invalid',
            Employee_Status__c = 'Inactive',
            Date_of_Joining__c = Date.today()
        );
        insert employee;
        Test.stopTest();

        // Then
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Onboarding_Task__c WHERE Employee__c = :employee.Id],
            'An inactive employee should not be onboarded'
        );
    }

    @isTest
    static void shouldAssignToManager_WhenTemplateTaskTargetsManager() {
        // Given
        List<Employee__c> managers = TestDataFactory.createEmployees(1, true);
        Onboarding_Template__c template = buildTemplate(null, null);
        insert template;
        addTasks(template, 1, 'Manager');

        // When
        Test.startTest();
        Employee__c employee = new Employee__c(
            Name = 'Managed Hire',
            First_Name__c = 'Managed',
            Last_Name__c = 'Hire',
            Official_Email__c = 'managed.hire@example.invalid',
            Employee_Status__c = 'Active',
            Date_of_Joining__c = Date.today(),
            Reporting_Manager__c = managers[0].Id
        );
        insert employee;
        Test.stopTest();

        // Then
        Onboarding_Task__c task = [
            SELECT Assignee__c FROM Onboarding_Task__c WHERE Employee__c = :employee.Id LIMIT 1
        ];
        Assert.areEqual(managers[0].Id, task.Assignee__c, 'Manager tasks go to the reporting manager');
    }

    @isTest
    static void shouldAssignToSelf_WhenTemplateTaskTargetsSelf() {
        // Given
        Onboarding_Template__c template = buildTemplate(null, null);
        insert template;
        addTasks(template, 1, 'Self');

        // When
        Test.startTest();
        Employee__c employee = new Employee__c(
            Name = 'Self Hire',
            First_Name__c = 'Self',
            Last_Name__c = 'Hire',
            Official_Email__c = 'self.hire@example.invalid',
            Employee_Status__c = 'Active',
            Date_of_Joining__c = Date.today()
        );
        insert employee;
        Test.stopTest();

        // Then
        Onboarding_Task__c task = [
            SELECT Assignee__c FROM Onboarding_Task__c WHERE Employee__c = :employee.Id LIMIT 1
        ];
        Assert.areEqual(employee.Id, task.Assignee__c, 'Self tasks are assigned to the new employee');
    }

    @isTest
    static void shouldNotCreateTasks_WhenNoTemplateActive() {
        // Given an inactive template only
        Onboarding_Template__c template = buildTemplate(null, null);
        template.Active__c = false;
        insert template;
        addTasks(template, 2, 'HR');

        // When
        Test.startTest();
        Employee__c employee = new Employee__c(
            Name = 'No Template',
            First_Name__c = 'No',
            Last_Name__c = 'Template',
            Official_Email__c = 'no.template@example.invalid',
            Employee_Status__c = 'Active',
            Date_of_Joining__c = Date.today()
        );
        insert employee;
        Test.stopTest();

        // Then
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Onboarding_Task__c WHERE Employee__c = :employee.Id],
            'An inactive template must not generate tasks'
        );
    }

    @isTest
    static void shouldHandleBulkInsert_WithoutGovernorFailure() {
        // Given
        Onboarding_Template__c template = buildTemplate(null, null);
        insert template;
        addTasks(template, 2, 'HR');

        List<Employee__c> newHires = new List<Employee__c>();
        for (Integer i = 0; i < 251; i++) {
            newHires.add(new Employee__c(
                Name = 'Bulk Hire ' + i,
                First_Name__c = 'Bulk',
                Last_Name__c = 'Hire ' + i,
                Official_Email__c = 'bulk.hire' + i + '@example.invalid',
                Employee_Status__c = 'Active',
                Date_of_Joining__c = Date.today()
            ));
        }

        // When
        Test.startTest();
        insert newHires;
        Test.stopTest();

        // Then
        Assert.areEqual(
            251 * 2,
            [SELECT COUNT() FROM Onboarding_Task__c],
            'Every new hire receives every template task'
        );
    }
}
