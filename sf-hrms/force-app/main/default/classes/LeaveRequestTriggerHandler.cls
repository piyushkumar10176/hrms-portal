/**
 * Handles Leave_Request__c trigger work: keeps Leave_Balance__c in step with the
 * leave requests that consume it, and raises in-app Notification__c records that the
 * HRMS portal polls.
 *
 * Balance model: Closing_Balance__c = Opening_Balance__c + Accrued__c - Availed__c,
 * where Availed__c is the sum of Days__c across all Submitted and Approved requests
 * for that (Employee, Leave Type) pair.
 */
public with sharing class LeaveRequestTriggerHandler {
    /** Statuses that consume leave balance. */
    private static final Set<String> CONSUMING_STATUSES = new Set<String>{
        'Submitted',
        'Approved'
    };

    private static final String NOTIFICATION_TYPE_LEAVE = 'Leave';

    /**
     * Entry point invoked by LeaveRequestTrigger.
     *
     * @param newRequests Trigger.new, or null in a delete context
     * @param oldRequests Trigger.old, or null in an insert/undelete context
     * @param oldMap Trigger.oldMap, or null when not an update
     * @param isInsert whether this is an after-insert context
     * @param isUpdate whether this is an after-update context
     */
    public static void handleAfter(
        List<Leave_Request__c> newRequests,
        List<Leave_Request__c> oldRequests,
        Map<Id, Leave_Request__c> oldMap,
        Boolean isInsert,
        Boolean isUpdate
    ) {
        Set<Id> employeeIds = new Set<Id>();
        Set<Id> leaveTypeIds = new Set<Id>();

        collectKeys(newRequests, employeeIds, leaveTypeIds);
        collectKeys(oldRequests, employeeIds, leaveTypeIds);

        recalculateBalances(employeeIds, leaveTypeIds);

        if (isInsert) {
            createNotifications(buildInsertNotifications(newRequests));
        } else if (isUpdate) {
            createNotifications(buildStatusChangeNotifications(newRequests, oldMap));
        }
    }

    /**
     * Adds the Employee and Leave Type ids from a trigger collection to the working sets.
     */
    private static void collectKeys(
        List<Leave_Request__c> requests,
        Set<Id> employeeIds,
        Set<Id> leaveTypeIds
    ) {
        if (requests == null) {
            return;
        }
        for (Leave_Request__c request : requests) {
            if (request.Employee__c != null) {
                employeeIds.add(request.Employee__c);
            }
            if (request.Leave_Type__c != null) {
                leaveTypeIds.add(request.Leave_Type__c);
            }
        }
    }

    /**
     * Recomputes Availed__c and Closing_Balance__c for every affected balance row.
     * Uses one aggregate query and one DML statement regardless of trigger size.
     */
    private static void recalculateBalances(Set<Id> employeeIds, Set<Id> leaveTypeIds) {
        if (employeeIds.isEmpty() || leaveTypeIds.isEmpty()) {
            return;
        }

        Map<String, Decimal> availedByKey = new Map<String, Decimal>();
        for (AggregateResult result : [
            SELECT Employee__c employeeId, Leave_Type__c leaveTypeId, SUM(Days__c) totalDays
            FROM Leave_Request__c
            WHERE Employee__c IN :employeeIds
              AND Leave_Type__c IN :leaveTypeIds
              AND Status__c IN :CONSUMING_STATUSES
            GROUP BY Employee__c, Leave_Type__c
        ]) {
            String key = buildKey(
                (Id) result.get('employeeId'),
                (Id) result.get('leaveTypeId')
            );
            Decimal totalDays = (Decimal) result.get('totalDays');
            availedByKey.put(key, totalDays == null ? 0 : totalDays);
        }

        List<Leave_Balance__c> balancesToUpdate = new List<Leave_Balance__c>();
        for (Leave_Balance__c balance : [
            SELECT Id, Employee__c, Leave_Type__c, Opening_Balance__c, Accrued__c,
                   Availed__c, Closing_Balance__c
            FROM Leave_Balance__c
            WHERE Employee__c IN :employeeIds
              AND Leave_Type__c IN :leaveTypeIds
        ]) {
            String key = buildKey(balance.Employee__c, balance.Leave_Type__c);
            Decimal availed = availedByKey.containsKey(key) ? availedByKey.get(key) : 0;
            Decimal opening = balance.Opening_Balance__c == null ? 0 : balance.Opening_Balance__c;
            Decimal accrued = balance.Accrued__c == null ? 0 : balance.Accrued__c;
            Decimal closing = opening + accrued - availed;

            if (balance.Availed__c != availed || balance.Closing_Balance__c != closing) {
                balance.Availed__c = availed;
                balance.Closing_Balance__c = closing;
                balancesToUpdate.add(balance);
            }
        }

        if (!balancesToUpdate.isEmpty()) {
            update balancesToUpdate;
        }
    }

    /**
     * Builds the notification sent to the approver when a request is raised.
     */
    private static List<Notification__c> buildInsertNotifications(List<Leave_Request__c> requests) {
        List<Notification__c> notifications = new List<Notification__c>();
        if (requests == null) {
            return notifications;
        }
        for (Leave_Request__c request : requests) {
            if (request.Approver__c == null) {
                continue;
            }
            notifications.add(
                new Notification__c(
                    Employee__c = request.Approver__c,
                    Message__c = 'A new leave request has been submitted and is pending your approval.',
                    Type__c = NOTIFICATION_TYPE_LEAVE,
                    Is_Read__c = false,
                    Related_Record_Id__c = request.Id
                )
            );
        }
        return notifications;
    }

    /**
     * Builds the notification sent to the employee when their request changes status.
     */
    private static List<Notification__c> buildStatusChangeNotifications(
        List<Leave_Request__c> requests,
        Map<Id, Leave_Request__c> oldMap
    ) {
        List<Notification__c> notifications = new List<Notification__c>();
        if (requests == null || oldMap == null) {
            return notifications;
        }
        for (Leave_Request__c request : requests) {
            Leave_Request__c priorRequest = oldMap.get(request.Id);
            if (priorRequest == null || request.Status__c == priorRequest.Status__c) {
                continue;
            }
            if (request.Employee__c == null) {
                continue;
            }
            notifications.add(
                new Notification__c(
                    Employee__c = request.Employee__c,
                    Message__c = 'Your leave request is now ' + request.Status__c + '.',
                    Type__c = NOTIFICATION_TYPE_LEAVE,
                    Is_Read__c = false,
                    Related_Record_Id__c = request.Id
                )
            );
        }
        return notifications;
    }

    /**
     * Inserts notifications with partial success so a single bad row cannot roll back
     * the leave request itself.
     */
    private static void createNotifications(List<Notification__c> notifications) {
        if (notifications.isEmpty()) {
            return;
        }
        List<Database.SaveResult> results = Database.insert(notifications, false);
        for (Integer i = 0; i < results.size(); i++) {
            if (!results[i].isSuccess()) {
                System.debug(
                    LoggingLevel.ERROR,
                    'Leave notification insert failed: ' + results[i].getErrors()
                );
            }
        }
    }

    /**
     * Composite key for a (Employee, Leave Type) balance row.
     */
    private static String buildKey(Id employeeId, Id leaveTypeId) {
        return String.valueOf(employeeId) + '-' + String.valueOf(leaveTypeId);
    }
}
