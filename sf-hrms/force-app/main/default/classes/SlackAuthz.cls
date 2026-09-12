/**
 * Who may do what.
 *
 * Every permission decision in the Slack surface comes from here, mirroring
 * lib/authz in the portal so the two cannot drift into disagreeing about who
 * sees what. The rules were previously scattered across handlers, where a single
 * missed check silently exposed data.
 *
 * The actor is always an Employee__c resolved from the signed Slack payload,
 * never the guest user the request arrived as. A button's action id and value
 * come from the client, so a button is a convenience and never the boundary:
 * every entry point re-checks here.
 */
public inherited sharing class SlackAuthz {

    /** Roles live on the record rather than being inferred from department. */
    private static String roleOf(Employee__c actor) {
        return actor == null ? '' : (actor.Role__c ?? '').trim().toLowerCase();
    }

    public static Boolean isAdmin(Employee__c actor) {
        return roleOf(actor) == 'admin';
    }

    /** HR and admin both act on behalf of the company rather than themselves. */
    public static Boolean isHrOrAdmin(Employee__c actor) {
        String role = roleOf(actor);
        return role == 'hr' || role == 'admin';
    }

    public static Boolean canSeeCompanyWideData(Employee__c actor) {
        return isHrOrAdmin(actor);
    }

    /** Creating, editing and offboarding people is an administrator's job. */
    public static Boolean canManageEmployees(Employee__c actor) {
        return isAdmin(actor);
    }

    /**
     * Bank account, IFSC, PAN, Aadhaar and date of birth.
     *
     * The employee themselves, HR, and administrators. A manager may see their
     * reports' employment details but not these, because nothing in the approval
     * flow needs them.
     */
    public static Boolean canSeeSensitiveFields(Employee__c actor, Id subjectId) {
        if (actor == null) {
            return false;
        }
        return actor.Id == subjectId || isHrOrAdmin(actor);
    }

    /** Reading somebody else's attendance is a company-wide privilege. */
    public static Boolean canSeeAttendanceOf(Employee__c actor, Id subjectId) {
        if (actor == null) {
            return false;
        }
        return actor.Id == subjectId || canSeeCompanyWideData(actor);
    }
}
