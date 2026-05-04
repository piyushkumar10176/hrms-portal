trigger LeaveRequestTrigger on Leave_Request__c (after insert, after update, after delete, after undelete) {
    Set<Id> employeeIds = new Set<Id>();
    Set<Id> leaveTypeIds = new Set<Id>();

    if (Trigger.isInsert || Trigger.isUpdate || Trigger.isUndelete) {
        for (Leave_Request__c lr : Trigger.new) {
            employeeIds.add(lr.Employee__c);
            leaveTypeIds.add(lr.Leave_Type__c);
        }
    }
    if (Trigger.isDelete || Trigger.isUpdate) {
        for (Leave_Request__c lr : Trigger.old) {
            employeeIds.add(lr.Employee__c);
            leaveTypeIds.add(lr.Leave_Type__c);
        }
    }

    // Recalculate Availed__c
    if (!employeeIds.isEmpty()) {
        List<Leave_Balance__c> balances = [
            SELECT Id, Employee__c, Leave_Type__c, Availed__c 
            FROM Leave_Balance__c 
            WHERE Employee__c IN :employeeIds AND Leave_Type__c IN :leaveTypeIds
        ];
        
        AggregateResult[] results = [
            SELECT Employee__c, Leave_Type__c, SUM(Days__c) totalDays
            FROM Leave_Request__c
            WHERE Employee__c IN :employeeIds 
            AND Leave_Type__c IN :leaveTypeIds
            AND Status__c IN ('Submitted', 'Approved', 'Pending')
            GROUP BY Employee__c, Leave_Type__c
        ];

        Map<String, Decimal> sumMap = new Map<String, Decimal>();
        for (AggregateResult ar : results) {
            String key = (Id)ar.get('Employee__c') + '-' + (Id)ar.get('Leave_Type__c');
            sumMap.put(key, (Decimal)ar.get('totalDays'));
        }

        List<Leave_Balance__c> toUpdate = new List<Leave_Balance__c>();
        for (Leave_Balance__c lb : balances) {
            String key = lb.Employee__c + '-' + lb.Leave_Type__c;
            Decimal totalDays = sumMap.containsKey(key) ? sumMap.get(key) : 0;
            if (lb.Availed__c != totalDays) {
                lb.Availed__c = totalDays;
                toUpdate.add(lb);
            }
        }

        if (!toUpdate.isEmpty()) {
            update toUpdate;
        }
    }

    // Handle Notifications
    if (Trigger.isAfter) {
        List<Notification__c> notifs = new List<Notification__c>();
        
        // Standard Custom Notification
        CustomNotificationType notificationType;
        try {
            notificationType = [SELECT Id FROM CustomNotificationType WHERE DeveloperName = 'Leave_Notification' LIMIT 1];
        } catch (Exception e) {
            // Ignore if not deployed
        }

        if (Trigger.isInsert) {
            for (Leave_Request__c lr : Trigger.new) {
                if (lr.Approver__c != null) {
                    notifs.add(new Notification__c(
                        Employee__c = lr.Approver__c,
                        Message__c = 'New Leave Request submitted by Employee.',
                        Type__c = 'Leave',
                        Related_Record_Id__c = lr.Id
                    ));
                    
                    // Send standard notification to the owner of the record (HR admin)
                    if (notificationType != null) {
                        Messaging.CustomNotification notification = new Messaging.CustomNotification();
                        notification.setTitle('New Leave Request');
                        notification.setBody('A new leave request has been submitted and is pending approval.');
                        notification.setNotificationTypeId(notificationType.Id);
                        notification.setTargetId(lr.Id);
                        try {
                            notification.send(new Set<String> { lr.OwnerId });
                        } catch (Exception e) {}
                    }
                }
            }
        } else if (Trigger.isUpdate) {
            for (Leave_Request__c lr : Trigger.new) {
                Leave_Request__c oldLr = Trigger.oldMap.get(lr.Id);
                if (lr.Status__c != oldLr.Status__c) {
                    notifs.add(new Notification__c(
                        Employee__c = lr.Employee__c,
                        Message__c = 'Your Leave Request status is now: ' + lr.Status__c,
                        Type__c = 'Leave',
                        Related_Record_Id__c = lr.Id
                    ));
                    
                    // Send standard notification
                    if (notificationType != null) {
                        Messaging.CustomNotification notification = new Messaging.CustomNotification();
                        notification.setTitle('Leave Request ' + lr.Status__c);
                        notification.setBody('The status of the leave request has been updated to ' + lr.Status__c);
                        notification.setNotificationTypeId(notificationType.Id);
                        notification.setTargetId(lr.Id);
                        try {
                            notification.send(new Set<String> { lr.OwnerId });
                        } catch (Exception e) {}
                    }
                }
            }
        }
        if (!notifs.isEmpty()) {
            insert notifs;
        }
    }
}