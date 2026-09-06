/**
 * Schedules the daily who-is-out digest.
 *
 * Schedule it once from anonymous Apex, for example 09:00 IST every weekday:
 *   System.schedule(
 *     'HRMS daily leave digest',
 *     '0 30 3 ? * MON-FRI *',
 *     new DailyLeaveDigestSchedulable()
 *   );
 * The cron runs in the org's time zone, so 03:30 UTC is 09:00 IST.
 */
public with sharing class DailyLeaveDigestSchedulable implements Schedulable {
    public void execute(SchedulableContext context) {
        System.enqueueJob(new DailyLeaveDigestJob());
    }
}
