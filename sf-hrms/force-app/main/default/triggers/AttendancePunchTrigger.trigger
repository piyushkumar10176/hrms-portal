trigger AttendancePunchTrigger on Attendance_Punch__c (
    after insert,
    after update,
    after delete,
    after undelete
) {
    List<Attendance_Punch__c> affected = new List<Attendance_Punch__c>();
    if (Trigger.new != null) {
        affected.addAll(Trigger.new);
    }
    if (Trigger.old != null) {
        affected.addAll(Trigger.old);
    }
    AttendanceRollupService.rebuild(affected);
}
