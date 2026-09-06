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

    // Only a genuinely new punch is announced. A correction or an undelete is
    // housekeeping and would otherwise message the employee about a clock-in
    // they made hours ago.
    if (Trigger.isInsert) {
        AttendancePunchSlackNotifier.enqueue(Trigger.new);
    }
}
