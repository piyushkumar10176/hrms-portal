/**
 * Controller for the HRMS admin console.
 *
 * The console exists for the things Slack genuinely cannot do: editing many
 * people at once, and anything that needs a grid. Slack has no data table, so a
 * request to set the department on twelve people has no good answer there.
 *
 * Unlike the portal, which reaches Salesforce through a single integration user
 * and enforces permissions in its own layer, this runs as the signed-in
 * Salesforce user. That means the platform can do the enforcing: every query and
 * every write below is in user mode, so a user without access to a field simply
 * cannot read or write it through here, whatever the client sends.
 */
public with sharing class HrmsAdminController {

    /** A row in the employee grid. */
    public class EmployeeRow {
        @AuraEnabled public Id recordId;
        @AuraEnabled public String name;
        @AuraEnabled public String employeeCode;
        @AuraEnabled public String email;
        @AuraEnabled public String status;
        @AuraEnabled public String role;
        @AuraEnabled public String employmentType;
        @AuraEnabled public Id departmentId;
        @AuraEnabled public String departmentName;
        @AuraEnabled public Id designationId;
        @AuraEnabled public String designationName;
        @AuraEnabled public Id managerId;
        @AuraEnabled public String managerName;
        @AuraEnabled public Date joinedOn;
        /** True when the person has never set a portal password. */
        @AuraEnabled public Boolean neverSignedIn;
        /** True when no Slack account is linked, so they receive no notifications. */
        @AuraEnabled public Boolean slackUnlinked;
    }

    /** A picklist entry for the grid's lookups. */
    public class Choice {
        @AuraEnabled public String value;
        @AuraEnabled public String label;
        public Choice(String value, String label) {
            this.value = value;
            this.label = label;
        }
    }

    /** Everything the grid needs, in one call rather than four round trips. */
    public class GridData {
        @AuraEnabled public List<EmployeeRow> employees;
        @AuraEnabled public List<Choice> departments;
        @AuraEnabled public List<Choice> designations;
        @AuraEnabled public List<Choice> managers;
        @AuraEnabled public List<Choice> roles;
        @AuraEnabled public List<Choice> employmentTypes;
    }

    /**
     * Loads the grid.
     *
     * @param includeInactive whether people who have left are listed too
     * @return rows plus the option lists the editable columns need
     */
    @AuraEnabled(cacheable=true)
    public static GridData loadGrid(Boolean includeInactive) {
        try {
            GridData data = new GridData();
            data.employees = readEmployees(includeInactive == true);
            data.departments = readChoices('Department__c');
            data.designations = readChoices('Designation__c');
            data.managers = managerChoices(data.employees);
            data.roles = new List<Choice>{
                new Choice('Employee', 'Employee'),
                new Choice('HR', 'HR'),
                new Choice('Admin', 'Admin')
            };
            data.employmentTypes = new List<Choice>{
                new Choice('Full_Time', 'Full Time'),
                new Choice('Contract', 'Contract'),
                new Choice('Intern', 'Intern'),
                new Choice('Consultant', 'Consultant')
            };
            return data;
        } catch (Exception e) {
            throw asUserFacing(e, 'Could not load the employee list.');
        }
    }

    private static List<EmployeeRow> readEmployees(Boolean includeInactive) {
        String soql =
            'SELECT Id, Name, Employee_Code__c, Official_Email__c, Employee_Status__c, ' +
            'Department__c, Designation__c, ' +
            'Role__c, Employment_Type__c, Department_Ref__c, Department_Ref__r.Name, ' +
            'Designation_Ref__c, Designation_Ref__r.Name, ' +
            'Reporting_Manager__c, Reporting_Manager__r.Name, Date_of_Joining__c, ' +
            'Password_Hash__c, Slack_User_Id__c ' +
            'FROM Employee__c ';
        if (!includeInactive) {
            soql += 'WHERE Employee_Status__c = \'Active\' ';
        }
        soql += 'ORDER BY Employee_Code__c NULLS LAST LIMIT 2000';

        List<EmployeeRow> rows = new List<EmployeeRow>();
        for (Employee__c record : Database.query(soql, AccessLevel.USER_MODE)) {
            EmployeeRow row = new EmployeeRow();
            row.recordId = record.Id;
            row.name = record.Name;
            row.employeeCode = record.Employee_Code__c;
            row.email = record.Official_Email__c;
            row.status = record.Employee_Status__c;
            row.role = String.isBlank(record.Role__c) ? 'Employee' : record.Role__c;
            row.employmentType = record.Employment_Type__c;
            row.departmentId = record.Department_Ref__c;
            row.departmentName = record.Department_Ref__r == null
                ? record.Department__c
                : record.Department_Ref__r.Name;
            row.designationId = record.Designation_Ref__c;
            row.designationName = record.Designation_Ref__r == null
                ? record.Designation__c
                : record.Designation_Ref__r.Name;
            row.managerId = record.Reporting_Manager__c;
            row.managerName = record.Reporting_Manager__r == null
                ? null
                : record.Reporting_Manager__r.Name;
            row.joinedOn = record.Date_of_Joining__c;
            row.neverSignedIn = String.isBlank(record.Password_Hash__c);
            row.slackUnlinked = String.isBlank(record.Slack_User_Id__c);
            rows.add(row);
        }
        return rows;
    }

    /**
     * Name and id from any object with a Name field.
     *
     * Built dynamically because Department__c and Designation__c differ in
     * nothing but their API name, and two near-identical methods would be two
     * places to fix the same bug. The object name is never taken from the
     * client, so there is nothing here to inject into.
     */
    private static List<Choice> readChoices(String objectApiName) {
        List<Choice> choices = new List<Choice>();
        String soql = 'SELECT Id, Name FROM ' + objectApiName + ' ORDER BY Name LIMIT 1000';
        for (SObject record : Database.query(soql, AccessLevel.USER_MODE)) {
            choices.add(new Choice(String.valueOf(record.Id), String.valueOf(record.get('Name'))));
        }
        return choices;
    }

    /** Managers are drawn from the rows already loaded, so this costs no query. */
    private static List<Choice> managerChoices(List<EmployeeRow> employees) {
        List<Choice> choices = new List<Choice>();
        for (EmployeeRow row : employees) {
            if (row.status == 'Active') {
                choices.add(new Choice(
                    String.valueOf(row.recordId),
                    row.employeeCode == null ? row.name : row.name + ' (' + row.employeeCode + ')'
                ));
            }
        }
        return choices;
    }

    /**
     * Saves edits made across the grid.
     *
     * Partial success is deliberate. A grid of twenty rows where one breaks a
     * validation rule should save the other nineteen and say which failed,
     * rather than discarding an afternoon's work over a single bad cell.
     *
     * @param rows only the rows that were actually edited
     * @return one message per row that could not be saved; empty when all saved
     */
    /**
     * Applies one change to many employees at once.
     *
     * This is what the console is for. Setting the department on twelve people
     * is a row-selection job, not twelve cell edits, and it has no good answer
     * in Slack at all.
     *
     * A blank value means leave that field alone rather than clear it, so a
     * caller setting only the manager cannot wipe everyone's department.
     *
     * @param employeeIds who to change
     * @param departmentId new department, or blank to leave alone
     * @param designationId new designation, or blank to leave alone
     * @param managerId new reporting manager, or blank to leave alone
     * @param role new access level, or blank to leave alone
     * @return one message per employee that could not be saved
     */
    @AuraEnabled
    public static List<String> applyToMany(
        List<Id> employeeIds,
        Id departmentId,
        Id designationId,
        Id managerId,
        String role
    ) {
        if (employeeIds == null || employeeIds.isEmpty()) {
            return new List<String>();
        }
        Map<Id, Employee__c> byId = new Map<Id, Employee__c>(
            [SELECT Id, Name FROM Employee__c WHERE Id IN :employeeIds WITH USER_MODE]
        );

        List<Employee__c> updates = new List<Employee__c>();
        for (Id employeeId : employeeIds) {
            Employee__c record = new Employee__c(Id = employeeId);
            if (departmentId != null)  record.Department_Ref__c = departmentId;
            if (designationId != null) record.Designation_Ref__c = designationId;
            if (String.isNotBlank(role)) record.Role__c = role;
            if (managerId != null) {
                if (managerId == employeeId) {
                    throw new AuraHandledException(
                        byId.get(employeeId).Name + ' cannot report to themselves.'
                    );
                }
                record.Reporting_Manager__c = managerId;
            }
            updates.add(record);
        }

        List<String> failures = new List<String>();
        List<Database.SaveResult> results =
            Database.update(updates, false, AccessLevel.USER_MODE);
        for (Integer i = 0; i < results.size(); i++) {
            if (results[i].isSuccess()) continue;
            List<String> reasons = new List<String>();
            for (Database.Error error : results[i].getErrors()) {
                reasons.add(error.getMessage());
            }
            Employee__c who = byId.get(updates[i].Id);
            failures.add((who == null ? 'A row' : who.Name) + ': ' + String.join(reasons, '; '));
        }
        return failures;
    }

    @AuraEnabled
    public static List<String> saveGrid(List<EmployeeRow> rows) {
        if (rows == null || rows.isEmpty()) {
            return new List<String>();
        }

        Map<Id, EmployeeRow> rowById = new Map<Id, EmployeeRow>();
        List<Employee__c> updates = new List<Employee__c>();

        for (EmployeeRow row : rows) {
            if (row.recordId == null) {
                continue;
            }
            // Somebody reporting to themselves could never have a request
            // decided, because nobody may approve their own.
            if (row.managerId == row.recordId) {
                throw new AuraHandledException(
                    row.name + ' cannot report to themselves.'
                );
            }
            rowById.put(row.recordId, row);
            updates.add(new Employee__c(
                Id = row.recordId,
                Role__c = row.role,
                Employment_Type__c = row.employmentType,
                Department_Ref__c = row.departmentId,
                Designation_Ref__c = row.designationId,
                Reporting_Manager__c = row.managerId,
                Employee_Status__c = row.status
            ));
        }

        List<String> failures = new List<String>();
        List<Database.SaveResult> results =
            Database.update(updates, false, AccessLevel.USER_MODE);

        for (Integer i = 0; i < results.size(); i++) {
            if (results[i].isSuccess()) {
                continue;
            }
            EmployeeRow row = rowById.get(updates[i].Id);
            List<String> reasons = new List<String>();
            for (Database.Error error : results[i].getErrors()) {
                reasons.add(error.getMessage());
            }
            failures.add(
                (row == null ? 'A row' : row.name) + ': ' + String.join(reasons, '; ')
            );
        }
        return failures;
    }

    /**
     * Wraps a failure for the client without leaking internals.
     *
     * An AuraHandledException shows its message to the user, so the underlying
     * exception is logged rather than shown.
     */
    private static AuraHandledException asUserFacing(Exception e, String message) {
        System.debug(LoggingLevel.ERROR, message + ' :: ' + e.getTypeName() + ': ' + e.getMessage());
        AuraHandledException wrapped = new AuraHandledException(message);
        wrapped.setMessage(message);
        return wrapped;
    }
}
