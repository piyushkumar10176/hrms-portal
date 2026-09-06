trigger LeaveRequestTrigger on Leave_Request__c (
    after insert,
    after update,
    after delete,
    after undelete
) {
    LeaveRequestTriggerHandler.handleAfter(
        Trigger.isDelete ? null : Trigger.new,
        (Trigger.isUpdate || Trigger.isDelete) ? Trigger.old : null,
        Trigger.isUpdate ? Trigger.oldMap : null,
        Trigger.isInsert,
        Trigger.isUpdate
    );
}
