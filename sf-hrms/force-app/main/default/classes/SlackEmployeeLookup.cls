/**
 * Resolves a Slack member id to the employee it belongs to.
 *
 * Every authorisation decision downstream is made against this employee, never
 * against the guest user the request arrived as. The guest owns nothing and can
 * see nothing; identity comes entirely from the signed Slack payload.
 */
public inherited sharing class SlackEmployeeLookup {

    private static final Map<String, Employee__c> CACHE = new Map<String, Employee__c>();

    /**
     * @param slackUserId the member id Slack sent
     * @return the active employee linked to it, or null
     */
    public static Employee__c forSlackUser(String slackUserId) {
        if (String.isBlank(slackUserId)) {
            return null;
        }
        if (CACHE.containsKey(slackUserId)) {
            return CACHE.get(slackUserId);
        }
        // Slack member ids are short alphanumerics. Anything else is not worth a
        // query, and bind variables mean there is nothing to inject regardless.
        if (!Pattern.matches('[A-Za-z0-9]{5,20}', slackUserId)) {
            CACHE.put(slackUserId, null);
            return null;
        }

        List<Employee__c> found = [
            SELECT Id, Name, First_Name__c, Official_Email__c, Slack_User_Id__c,
                   Reporting_Manager__c, Role__c, Department__c, Employee_Status__c
            FROM Employee__c
            WHERE Slack_User_Id__c = :slackUserId
              AND Employee_Status__c = 'Active'
            LIMIT 1
        ];
        Employee__c employee = found.isEmpty() ? null : found[0];
        CACHE.put(slackUserId, employee);
        return employee;
    }

    /** True when this person may see company-wide data. */
    public static Boolean isHrOrAdmin(Employee__c employee) {
        if (employee == null) {
            return false;
        }
        String role = (employee.Role__c ?? '').toLowerCase();
        return role == 'hr' || role == 'admin';
    }
}
