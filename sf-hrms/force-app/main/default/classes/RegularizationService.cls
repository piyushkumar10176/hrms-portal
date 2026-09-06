/**
 * Attendance regularization policy.
 *
 * An employee may raise a limited number of regularizations per calendar month,
 * set by the HRMS_Regularizations_Per_Month label. Rejected requests still count
 * against the allowance, because the limit exists to stop the process being used
 * as a substitute for turning up, not to reward being refused.
 */
public with sharing class RegularizationService {
    /** Statuses that consume the monthly allowance. */
    private static final Set<String> COUNTED_STATUSES = new Set<String>{
        'Submitted', 'Approved', 'Rejected'
    };

    public class PolicyResult {
        public Boolean allowed;
        public String reason;
        public Integer used;
        public Integer allowance;

        public PolicyResult(Boolean allowed, String reason, Integer used, Integer allowance) {
            this.allowed = allowed;
            this.reason = reason;
            this.used = used;
            this.allowance = allowance;
        }
    }

    @TestVisible
    private static Integer monthlyAllowance() {
        try {
            return Integer.valueOf(Label.HRMS_Regularizations_Per_Month.trim());
        } catch (Exception e) {
            return 3;
        }
    }

    /**
     * How many regularizations the employee has already used in the month
     * containing the given date.
     */
    public static Integer usedInMonth(Id employeeId, Date onDate) {
        Date monthStart = onDate.toStartOfMonth();
        Date monthEnd = monthStart.addMonths(1).addDays(-1);
        return [
            SELECT COUNT()
            FROM Regularization_Request__c
            WHERE Employee__c = :employeeId
              AND Date__c >= :monthStart
              AND Date__c <= :monthEnd
              AND Status__c IN :COUNTED_STATUSES
        ];
    }

    /**
     * Whether the employee may raise another regularization for that date.
     *
     * @param employeeId the requesting employee
     * @param onDate the date being regularized
     * @return the verdict, with the counts so callers can explain it
     */
    public static PolicyResult check(Id employeeId, Date onDate) {
        Integer allowance = monthlyAllowance();
        Integer used = usedInMonth(employeeId, onDate);

        if (used >= allowance) {
            return new PolicyResult(
                false,
                'You have used all ' + allowance + ' regularizations for ' +
                    onDate.toStartOfMonth().format().left(10).right(7) + '.',
                used,
                allowance
            );
        }
        if (onDate > Date.today()) {
            return new PolicyResult(false, 'You cannot regularize a future date.', used, allowance);
        }
        return new PolicyResult(true, null, used, allowance);
    }

    /**
     * Days in the given month where the employee was penalised, which are the
     * days worth regularizing.
     */
    public static List<Attendance__c> penalisedDays(Id employeeId, Date inMonth) {
        Date monthStart = inMonth.toStartOfMonth();
        Date monthEnd = monthStart.addMonths(1).addDays(-1);
        return [
            SELECT Id, Date__c, Check_In__c, Check_Out__c, Total_Hours__c,
                   Status__c, Penalty__c, Penalty_Reason__c
            FROM Attendance__c
            WHERE Employee__c = :employeeId
              AND Date__c >= :monthStart
              AND Date__c <= :monthEnd
              AND Penalty__c = true
            ORDER BY Date__c DESC
            LIMIT 31
        ];
    }
}
