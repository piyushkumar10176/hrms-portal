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

    // ---- Attendance ------------------------------------------------------

    /** One person's day on the attendance tab. */
    public class AttendanceRow {
        @AuraEnabled public Id employeeId;
        @AuraEnabled public String name;
        @AuraEnabled public String employeeCode;
        @AuraEnabled public String department;
        @AuraEnabled public String checkIn;
        @AuraEnabled public String checkOut;
        @AuraEnabled public Decimal workedHours;
        @AuraEnabled public Decimal breakMinutes;
        @AuraEnabled public String status;
        @AuraEnabled public Boolean penalty;
        @AuraEnabled public String penaltyReason;
    }

    public class AttendanceDay {
        @AuraEnabled public String forDate;
        @AuraEnabled public List<AttendanceRow> rows;
        @AuraEnabled public Integer present;
        @AuraEnabled public Integer halfDay;
        @AuraEnabled public Integer flagged;
        @AuraEnabled public Integer headcount;
        /** Active employees with no attendance record on that date at all. */
        @AuraEnabled public Integer noShow;
    }

    /**
     * Attendance for everybody on one day.
     *
     * @param forDate the business date, or null for today
     */
    @AuraEnabled(cacheable=true)
    public static AttendanceDay loadAttendance(Date forDate) {
        try {
            Date target = forDate == null
                ? AttendanceRollupService.businessDateOf(System.now())
                : forDate;
            String zone = AttendanceRollupService.businessTimeZoneName();

            AttendanceDay day = new AttendanceDay();
            day.forDate = String.valueOf(target);
            day.rows = new List<AttendanceRow>();
            day.present = 0;
            day.halfDay = 0;
            day.flagged = 0;

            for (Attendance__c record : [
                SELECT Employee__c, Employee__r.Name, Employee__r.Employee_Code__c,
                       Employee__r.Department__c, Check_In__c, Check_Out__c,
                       Total_Hours__c, Break_Minutes__c, Status__c,
                       Penalty__c, Penalty_Reason__c
                FROM Attendance__c
                WHERE Date__c = :target
                WITH USER_MODE
                ORDER BY Employee__r.Name
                LIMIT 2000
            ]) {
                AttendanceRow row = new AttendanceRow();
                row.employeeId = record.Employee__c;
                row.name = record.Employee__r == null ? 'Unknown' : record.Employee__r.Name;
                row.employeeCode = record.Employee__r == null ? null : record.Employee__r.Employee_Code__c;
                row.department = record.Employee__r == null ? null : record.Employee__r.Department__c;
                // Rendered here rather than in the browser so every reader sees
                // the business time zone, not whatever their laptop is set to.
                row.checkIn = record.Check_In__c == null ? null : record.Check_In__c.format('HH:mm', zone);
                row.checkOut = record.Check_Out__c == null ? null : record.Check_Out__c.format('HH:mm', zone);
                row.workedHours = record.Total_Hours__c;
                row.breakMinutes = record.Break_Minutes__c;
                row.status = record.Status__c;
                row.penalty = record.Penalty__c;
                row.penaltyReason = record.Penalty_Reason__c;
                day.rows.add(row);

                if (record.Status__c == 'Present') day.present++;
                if (record.Status__c == 'Half Day') day.halfDay++;
                if (record.Penalty__c == true) day.flagged++;
            }

            day.headcount = [
                SELECT COUNT() FROM Employee__c WHERE Employee_Status__c = 'Active' WITH USER_MODE
            ];
            day.noShow = day.headcount - day.rows.size();
            if (day.noShow < 0) day.noShow = 0;
            return day;
        } catch (Exception e) {
            throw asUserFacing(e, 'Could not load attendance for that day.');
        }
    }

    // ---- Leave -----------------------------------------------------------

    public class LeaveRow {
        @AuraEnabled public String name;
        @AuraEnabled public String employeeCode;
        @AuraEnabled public String department;
        @AuraEnabled public String leaveType;
        @AuraEnabled public Date fromDate;
        @AuraEnabled public Date toDate;
        @AuraEnabled public Decimal days;
        @AuraEnabled public Boolean halfDay;
        /** Work from home is leave in the data model, but it is not absence. */
        @AuraEnabled public Boolean remote;
    }

    public class LeaveToday {
        @AuraEnabled public String forDate;
        @AuraEnabled public List<LeaveRow> away;
        @AuraEnabled public List<LeaveRow> remote;
        @AuraEnabled public List<LeaveRow> upcoming;
    }

    /**
     * Who is off today, who is working remotely, and what is coming up.
     *
     * @param forDate the business date, or null for today
     */
    @AuraEnabled(cacheable=true)
    public static LeaveToday loadLeave(Date forDate) {
        try {
            Date target = forDate == null
                ? AttendanceRollupService.businessDateOf(System.now())
                : forDate;

            LeaveToday result = new LeaveToday();
            result.forDate = String.valueOf(target);
            result.away = new List<LeaveRow>();
            result.remote = new List<LeaveRow>();
            result.upcoming = new List<LeaveRow>();

            Date horizon = target.addDays(14);

            for (Leave_Request__c request : [
                SELECT Employee__r.Name, Employee__r.Employee_Code__c, Employee__r.Department__c,
                       Leave_Type__r.Name, Leave_Type__r.Code__c,
                       From_Date__c, To_Date__c, Days__c, Half_Day__c
                FROM Leave_Request__c
                WHERE Status__c = 'Approved'
                  AND To_Date__c >= :target
                  AND From_Date__c <= :horizon
                WITH USER_MODE
                ORDER BY From_Date__c, Employee__r.Name
                LIMIT 500
            ]) {
                LeaveRow row = new LeaveRow();
                row.name = request.Employee__r == null ? 'Unknown' : request.Employee__r.Name;
                row.employeeCode = request.Employee__r == null ? null : request.Employee__r.Employee_Code__c;
                row.department = request.Employee__r == null ? null : request.Employee__r.Department__c;
                row.leaveType = request.Leave_Type__r == null ? 'Leave' : request.Leave_Type__r.Name;
                row.fromDate = request.From_Date__c;
                row.toDate = request.To_Date__c;
                row.days = request.Days__c;
                row.halfDay = request.Half_Day__c;
                row.remote = isRemote(request.Leave_Type__r);

                Boolean activeToday =
                    request.From_Date__c <= target && request.To_Date__c >= target;
                if (activeToday) {
                    if (row.remote) result.remote.add(row);
                    else result.away.add(row);
                } else {
                    result.upcoming.add(row);
                }
            }
            return result;
        } catch (Exception e) {
            throw asUserFacing(e, 'Could not load the leave list.');
        }
    }

    private static Boolean isRemote(Leave_Type__c leaveType) {
        if (leaveType == null) return false;
        String code = leaveType.Code__c == null ? '' : leaveType.Code__c.toUpperCase();
        String name = leaveType.Name == null ? '' : leaveType.Name.toLowerCase();
        return code == 'WFH' || name.contains('work from home') || name.contains('remote');
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
