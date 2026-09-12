/**
 * The leave commands, ported from the TypeScript gateway.
 *
 * Balances read Closing_Balance__c where the trigger has derived it, and fall
 * back to opening plus accrued less availed where it has not, which is the same
 * rule the portal applies.
 */
public with sharing class SlackLeaveCommand {

    /** `/myleave` with no argument: what the person has left. */
    public static String balance(Employee__c employee) {
        List<Leave_Balance__c> balances = [
            SELECT Leave_Type__r.Name, Opening_Balance__c, Accrued__c,
                   Availed__c, Closing_Balance__c
            FROM Leave_Balance__c
            WHERE Employee__c = :employee.Id
            ORDER BY Leave_Type__r.Name
            LIMIT 20
        ];

        if (balances.isEmpty()) {
            return SlackBlocks.ephemeral('You have no leave types allocated yet. Ask HR to set them up.');
        }

        List<String> labels = new List<String>();
        List<String> values = new List<String>();
        for (Leave_Balance__c row : balances) {
            Decimal available = available(row);
            labels.add(row.Leave_Type__r == null ? 'Leave' : row.Leave_Type__r.Name);
            values.add(available.stripTrailingZeros().toPlainString()
                + (available == 1 ? ' day left' : ' days left'));
        }

        List<Object> blocks = new List<Object>{
            SlackBlocks.header('Your leave'),
            SlackBlocks.fields(labels, values),
            SlackBlocks.context('Served by Salesforce directly.')
        };
        return SlackBlocks.ephemeral('Your leave balance', blocks);
    }

    /** `/whosout`: who is away today, and who is working remotely. */
    public static String whoIsOut() {
        Date today = AttendanceRollupService.businessDateOf(System.now());

        List<String> away = new List<String>();
        List<String> remote = new List<String>();

        for (Leave_Request__c request : [
            SELECT Employee__r.Name, Leave_Type__r.Name, Leave_Type__r.Code__c, Half_Day__c
            FROM Leave_Request__c
            WHERE Status__c = 'Approved'
              AND From_Date__c <= :today
              AND To_Date__c >= :today
            ORDER BY Employee__r.Name
            LIMIT 200
        ]) {
            String who = SlackBlocks.escape(
                request.Employee__r == null ? 'Unknown' : request.Employee__r.Name
            ) + (request.Half_Day__c == true ? ' (half day)' : '');

            if (isRemote(request.Leave_Type__r)) {
                remote.add(who);
            } else {
                away.add(who);
            }
        }

        if (away.isEmpty() && remote.isEmpty()) {
            return SlackBlocks.ephemeral(':white_check_mark: Everybody is in today.');
        }

        List<Object> blocks = new List<Object>{ SlackBlocks.header('Out today · ' + SlackBlocks.dateText(today)) };
        if (!away.isEmpty()) {
            blocks.add(SlackBlocks.section(':palm_tree: *Away*\n' + String.join(away, ', ')));
        }
        if (!remote.isEmpty()) {
            blocks.add(SlackBlocks.section(':house: *Working remotely*\n' + String.join(remote, ', ')));
        }
        return SlackBlocks.ephemeral('Out today', blocks);
    }

    /** Work from home is leave in the data model, but it is not absence. */
    private static Boolean isRemote(Leave_Type__c leaveType) {
        if (leaveType == null) {
            return false;
        }
        String code = (leaveType.Code__c ?? '').toUpperCase();
        String name = (leaveType.Name ?? '').toLowerCase();
        return code == 'WFH' || name.contains('work from home') || name.contains('remote');
    }

    /** Closing balance where the trigger derived one, the components otherwise. */
    private static Decimal available(Leave_Balance__c row) {
        if (row.Closing_Balance__c != null) {
            return row.Closing_Balance__c;
        }
        Decimal opening = row.Opening_Balance__c ?? 0;
        Decimal accrued = row.Accrued__c ?? 0;
        Decimal availed = row.Availed__c ?? 0;
        return opening + accrued - availed;
    }
}
