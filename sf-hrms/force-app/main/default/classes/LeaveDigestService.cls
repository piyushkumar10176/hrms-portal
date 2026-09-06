/**
 * Builds the daily "who is out today" digest.
 *
 * Kept separate from the scheduling and the callout so the message can be
 * asserted in a test without mocking either.
 */
public with sharing class LeaveDigestService {
    /** One person's absence for the day. */
    public class Absence {
        public String employeeName;
        public String leaveType;
        public Date fromDate;
        public Date toDate;
        public Boolean isHalfDay;

        public Absence(String employeeName, String leaveType, Date fromDate, Date toDate, Boolean isHalfDay) {
            this.employeeName = employeeName;
            this.leaveType = leaveType;
            this.fromDate = fromDate;
            this.toDate = toDate;
            this.isHalfDay = isHalfDay;
        }
    }

    /**
     * Everyone whose approved leave covers the given date.
     *
     * @param onDate the business date to report on
     * @return absences ordered by employee name
     */
    public static List<Absence> absencesOn(Date onDate) {
        List<Absence> absences = new List<Absence>();
        for (Leave_Request__c request : [
            SELECT Employee__r.Name, Leave_Type__r.Name, From_Date__c, To_Date__c, Half_Day__c
            FROM Leave_Request__c
            WHERE Status__c = 'Approved'
              AND From_Date__c <= :onDate
              AND To_Date__c >= :onDate
            ORDER BY Employee__r.Name
        ]) {
            absences.add(new Absence(
                request.Employee__r == null ? 'Unknown' : request.Employee__r.Name,
                request.Leave_Type__r == null ? 'Leave' : request.Leave_Type__r.Name,
                request.From_Date__c,
                request.To_Date__c,
                request.Half_Day__c
            ));
        }
        return absences;
    }

    /** Requests still awaiting a decision, oldest first. */
    public static List<Leave_Request__c> pendingRequests() {
        return [
            SELECT Name, Employee__r.Name, Leave_Type__r.Name, From_Date__c, To_Date__c,
                   Days__c, Approver__r.Name, CreatedDate
            FROM Leave_Request__c
            WHERE Status__c = 'Submitted'
            ORDER BY CreatedDate ASC
            LIMIT 20
        ];
    }

    /**
     * Block Kit for the digest. Stays well inside Slack's 50 block ceiling by
     * summarising rather than listing everything.
     *
     * @param onDate the date being reported
     * @param absences who is out
     * @param pending requests awaiting a decision
     * @param holidayName the holiday falling on this date, or null
     */
    public static String buildBlocks(
        Date onDate,
        List<Absence> absences,
        List<Leave_Request__c> pending,
        String holidayName
    ) {
        List<Object> blocks = new List<Object>();
        blocks.add(new Map<String, Object>{
            'type' => 'header',
            'text' => new Map<String, Object>{
                'type' => 'plain_text',
                'text' => 'Who is out today, ' + onDate.format()
            }
        });

        if (String.isNotBlank(holidayName)) {
            blocks.add(new Map<String, Object>{
                'type' => 'section',
                'text' => mrkdwn(':tada: Today is *' + SlackService.escape(holidayName) + '*.')
            });
        }

        if (absences.isEmpty()) {
            blocks.add(new Map<String, Object>{
                'type' => 'section',
                'text' => mrkdwn('Nobody is on approved leave today.')
            });
        } else {
            List<String> lines = new List<String>();
            for (Absence absence : absences) {
                String span = absence.fromDate == absence.toDate
                    ? 'today'
                    : absence.fromDate.format() + ' to ' + absence.toDate.format();
                lines.add(
                    '• *' + SlackService.escape(absence.employeeName) + '* — ' +
                    SlackService.escape(absence.leaveType) +
                    (absence.isHalfDay == true ? ' (half day)' : '') +
                    ', ' + span
                );
            }
            blocks.add(new Map<String, Object>{
                'type' => 'section',
                'text' => mrkdwn(
                    String.valueOf(absences.size()) +
                    (absences.size() == 1 ? ' person is out:' : ' people are out:') +
                    '\n' + String.join(lines, '\n')
                )
            });
        }

        if (!pending.isEmpty()) {
            List<String> lines = new List<String>();
            Integer shown = Math.min(pending.size(), 8);
            for (Integer i = 0; i < shown; i++) {
                Leave_Request__c request = pending[i];
                lines.add(
                    '• ' + SlackService.escape(request.Employee__r == null ? 'Unknown' : request.Employee__r.Name) +
                    ' — ' + String.valueOf(request.Days__c) + ' day(s) from ' +
                    String.valueOf(request.From_Date__c) +
                    ', with ' + SlackService.escape(request.Approver__r == null ? 'no approver' : request.Approver__r.Name)
                );
            }
            String more = pending.size() > shown
                ? '\n_and ' + String.valueOf(pending.size() - shown) + ' more_'
                : '';
            blocks.add(new Map<String, Object>{ 'type' => 'divider' });
            blocks.add(new Map<String, Object>{
                'type' => 'section',
                'text' => mrkdwn(
                    ':hourglass: *' + String.valueOf(pending.size()) +
                    ' request(s) awaiting a decision*\n' + String.join(lines, '\n') + more
                )
            });
        }

        blocks.add(new Map<String, Object>{
            'type' => 'context',
            'elements' => new List<Object>{
                mrkdwn('Approvers can act with `/approvals`. Anyone can check their own balance with `/myleave balance`.')
            }
        });

        return JSON.serialize(blocks);
    }

    private static Map<String, Object> mrkdwn(String text) {
        return new Map<String, Object>{ 'type' => 'mrkdwn', 'text' => text };
    }
}
