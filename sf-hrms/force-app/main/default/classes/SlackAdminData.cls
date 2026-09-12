/**
 * Queries the admin surfaces need.
 *
 * Kept apart from the command classes so the leave and attendance flows that
 * already work are not touched. Everything here is a read; writes live with the
 * handler that decides whether they are allowed.
 *
 * Every filter is bound rather than concatenated. A search term arrives from a
 * modal the client controls, so a LIKE built by hand would be an injection
 * point; binding removes the question entirely.
 */
public inherited sharing class SlackAdminData {

    /** Slack caps a static select at 100 options. */
    public static final Integer OPTION_LIMIT = 100;

    // ---- employees -------------------------------------------------------

    /**
     * One employee, with everything any Slack surface might show.
     *
     * The sensitive fields are selected here and withheld at render time by
     * SlackAuthz, rather than being selected conditionally: one query shape is
     * easier to reason about than four, and nothing leaves this org unless a
     * view asks for it.
     */
    public static Employee__c employee(Id employeeId) {
        if (employeeId == null) {
            return null;
        }
        List<Employee__c> found = [
            SELECT Id, Name, Employee_Code__c, First_Name__c, Last_Name__c,
                   Official_Email__c, Mobile__c, Department__c, Designation__c,
                   Department_Ref__c, Department_Ref__r.Name,
                   Designation_Ref__c, Designation_Ref__r.Name,
                   Employee_Status__c, Employment_Type__c, Role__c,
                   Date_of_Joining__c, DOB__c, LWD__c, Resignation_Date__c,
                   Work_Location__c, Slack_User_Id__c, Password_Hash__c,
                   Reporting_Manager__c, Reporting_Manager__r.Name,
                   Bank_Account_Number__c, IFSC_Code__c, PAN__c, Aadhaar__c
            FROM Employee__c
            WHERE Id = :employeeId
            LIMIT 1
        ];
        return found.isEmpty() ? null : found[0];
    }

    /** Active people as select options, newest-joined last so the list reads alphabetically. */
    public static List<SlackViewBuilder.Choice> employeeChoices() {
        List<SlackViewBuilder.Choice> choices = new List<SlackViewBuilder.Choice>();
        for (Employee__c row : [
            SELECT Id, Name, Employee_Code__c FROM Employee__c
            WHERE Employee_Status__c = 'Active'
            ORDER BY Name
            LIMIT 100
        ]) {
            choices.add(new SlackViewBuilder.Choice(
                String.isBlank(row.Employee_Code__c)
                    ? row.Name
                    : row.Name + ' (' + row.Employee_Code__c + ')',
                row.Id
            ));
        }
        return choices;
    }

    /**
     * True when there are more active people than a select can hold.
     *
     * Said out loud on the modal rather than silently truncating, because an
     * admin who cannot find somebody in the list needs to know the list is the
     * problem.
     */
    public static Boolean moreEmployeesThanFit() {
        return [SELECT COUNT() FROM Employee__c WHERE Employee_Status__c = 'Active'] > OPTION_LIMIT;
    }

    /** Free text across name, code and email. */
    public static List<Employee__c> search(String term) {
        String trimmed = (term ?? '').trim();
        if (trimmed.length() < 2) {
            return new List<Employee__c>();
        }
        // Bound, so the wildcards are data rather than query syntax.
        String pattern = '%' + escapeLike(trimmed) + '%';
        return [
            SELECT Id, Name, Employee_Code__c, First_Name__c, Official_Email__c,
                   Department__c, Department_Ref__r.Name, Employee_Status__c,
                   Slack_User_Id__c, Role__c
            FROM Employee__c
            WHERE Name LIKE :pattern
               OR Employee_Code__c LIKE :pattern
               OR Official_Email__c LIKE :pattern
            ORDER BY Employee_Status__c, Name
            LIMIT 20
        ];
    }

    /** An exact email match, used to refuse a duplicate before creating one. */
    public static Employee__c byEmail(String email) {
        if (String.isBlank(email)) {
            return null;
        }
        String normalized = email.trim().toLowerCase();
        List<Employee__c> found = [
            SELECT Id, Name, Employee_Status__c, Slack_User_Id__c
            FROM Employee__c
            WHERE Official_Email__c = :normalized
            LIMIT 1
        ];
        return found.isEmpty() ? null : found[0];
    }

    /**
     * Underscore and percent are wildcards inside a bound LIKE, so a search for
     * "a_b" would otherwise match "axb".
     */
    private static String escapeLike(String term) {
        return term.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_');
    }

    public static List<SlackViewBuilder.Choice> departmentChoices() {
        List<SlackViewBuilder.Choice> choices = new List<SlackViewBuilder.Choice>();
        for (Department__c row : [SELECT Id, Name FROM Department__c ORDER BY Name LIMIT 100]) {
            choices.add(new SlackViewBuilder.Choice(row.Name, row.Id));
        }
        return choices;
    }

    public static List<SlackViewBuilder.Choice> designationChoices() {
        List<SlackViewBuilder.Choice> choices = new List<SlackViewBuilder.Choice>();
        for (Designation__c row : [SELECT Id, Name FROM Designation__c ORDER BY Name LIMIT 100]) {
            choices.add(new SlackViewBuilder.Choice(row.Name, row.Id));
        }
        return choices;
    }

    public static List<SlackViewBuilder.Choice> leaveTypeChoices() {
        List<SlackViewBuilder.Choice> choices = new List<SlackViewBuilder.Choice>();
        for (Leave_Type__c row : [SELECT Id, Name, Code__c FROM Leave_Type__c ORDER BY Name LIMIT 100]) {
            choices.add(new SlackViewBuilder.Choice(row.Name, row.Id));
        }
        return choices;
    }

    /**
     * The next code in the EMPnnn sequence.
     *
     * Employee_Code__c is unique text rather than an auto number, so it has to be
     * generated. Two people onboarding in the same second could reach for the
     * same code; the uniqueness constraint turns that into a clean refusal rather
     * than a duplicate, which is why nothing here tries to lock.
     *
     * Ordering by the text field puts EMP9 above EMP10, so the number is parsed
     * from every candidate rather than trusting the first row.
     */
    public static String nextEmployeeCode() {
        Integer highest = 0;
        for (Employee__c row : [
            SELECT Employee_Code__c FROM Employee__c
            WHERE Employee_Code__c LIKE 'EMP%'
            ORDER BY CreatedDate DESC
            LIMIT 500
        ]) {
            Integer digits = numberIn(row.Employee_Code__c);
            if (digits > highest) {
                highest = digits;
            }
        }
        return 'EMP' + String.valueOf(highest + 1).leftPad(3, '0');
    }

    private static Integer numberIn(String code) {
        if (String.isBlank(code) || code.length() < 4) {
            return 0;
        }
        String tail = code.substring(3);
        if (!Pattern.matches('\\d+', tail)) {
            return 0;
        }
        try {
            return Integer.valueOf(tail);
        } catch (Exception e) {
            return 0;
        }
    }

    // ---- attendance ------------------------------------------------------

    /**
     * One person's punches on one business date, in order.
     *
     * Bounded by instants rather than by DAY_ONLY(convertTimezone(...)), because
     * that function converts into the running user's time zone and this runs as
     * the Site guest user, whose zone is GMT. The office is Asia/Kolkata, so the
     * two disagree for the first five and a half hours of every business day:
     * an early punch would be filtered as belonging to yesterday, and the Home
     * tab would show somebody an empty morning they had already clocked in for.
     */
    public static List<Attendance_Punch__c> punchesOn(Id employeeId, Date businessDate) {
        DateTime dayStart = startOfBusinessDay(businessDate);
        DateTime dayEnd = startOfBusinessDay(businessDate.addDays(1));
        return [
            SELECT Id, Punch_DateTime__c, Punch_Type__c, Source__c
            FROM Attendance_Punch__c
            WHERE Employee__c = :employeeId
              AND Punch_DateTime__c >= :dayStart
              AND Punch_DateTime__c < :dayEnd
            ORDER BY Punch_DateTime__c ASC
            LIMIT 100
        ];
    }

    /** Midnight at the start of a business date, as the instant it names. */
    public static DateTime startOfBusinessDay(Date businessDate) {
        DateTime asIfUtc = DateTime.newInstanceGmt(businessDate, Time.newInstance(0, 0, 0, 0));
        Integer offsetMs =
            TimeZone.getTimeZone(AttendanceRollupService.businessTimeZoneName())
                .getOffset(asIfUtc);
        return asIfUtc.addSeconds(-offsetMs / 1000);
    }

    /** The derived day, which the rollup maintains from the punches above. */
    public static Attendance__c attendanceOn(Id employeeId, Date businessDate) {
        List<Attendance__c> rows = [
            SELECT Id, Date__c, Check_In__c, Check_Out__c, Total_Hours__c,
                   Gross_Hours__c, Break_Minutes__c, Status__c, Penalty__c, Penalty_Reason__c
            FROM Attendance__c
            WHERE Employee__c = :employeeId AND Date__c = :businessDate
            LIMIT 1
        ];
        return rows.isEmpty() ? null : rows[0];
    }

    public static List<Attendance__c> attendanceBetween(Id employeeId, Date fromDate, Date toDate) {
        return [
            SELECT Id, Date__c, Check_In__c, Check_Out__c, Total_Hours__c,
                   Gross_Hours__c, Break_Minutes__c, Status__c, Penalty__c, Penalty_Reason__c
            FROM Attendance__c
            WHERE Employee__c = :employeeId
              AND Date__c >= :fromDate AND Date__c <= :toDate
            ORDER BY Date__c DESC
            LIMIT 60
        ];
    }

    /** Everybody with attendance recorded on a day. */
    public static List<Attendance__c> attendanceAcrossCompany(Date businessDate) {
        return [
            SELECT Employee__r.Name, Check_In__c, Check_Out__c,
                   Total_Hours__c, Break_Minutes__c, Status__c, Penalty__c
            FROM Attendance__c
            WHERE Date__c = :businessDate
            ORDER BY Employee__r.Name
            LIMIT 200
        ];
    }

    // ---- leave -----------------------------------------------------------

    public static List<Leave_Balance__c> balancesFor(Id employeeId) {
        return [
            SELECT Leave_Type__c, Leave_Type__r.Name, Opening_Balance__c,
                   Accrued__c, Availed__c, Closing_Balance__c
            FROM Leave_Balance__c
            WHERE Employee__c = :employeeId
            ORDER BY Leave_Type__r.Name
            LIMIT 20
        ];
    }

    /** Requests that already cover any part of a range, so an overlap can be refused. */
    public static List<Leave_Request__c> overlapping(Id employeeId, Date fromDate, Date toDate) {
        return [
            SELECT Id, Status__c, From_Date__c, To_Date__c, Leave_Type__r.Name
            FROM Leave_Request__c
            WHERE Employee__c = :employeeId
              AND Status__c IN ('Submitted', 'Approved')
              AND From_Date__c <= :toDate
              AND To_Date__c >= :fromDate
            LIMIT 5
        ];
    }

    public static List<Leave_Request__c> requestsFor(Id employeeId) {
        return [
            SELECT Id, Name, Leave_Type__r.Name, From_Date__c, To_Date__c, Days__c,
                   Half_Day__c, Status__c, Reason__c, Approver__r.Name, CreatedDate
            FROM Leave_Request__c
            WHERE Employee__c = :employeeId
            ORDER BY CreatedDate DESC
            LIMIT 25
        ];
    }

    /** Public holidays inside a range, which do not count against leave. */
    public static Set<Date> holidaysBetween(Date fromDate, Date toDate) {
        Set<Date> days = new Set<Date>();
        for (Holiday__c row : [
            SELECT Date__c FROM Holiday__c
            WHERE Date__c >= :fromDate AND Date__c <= :toDate
            LIMIT 200
        ]) {
            days.add(row.Date__c);
        }
        return days;
    }
}
