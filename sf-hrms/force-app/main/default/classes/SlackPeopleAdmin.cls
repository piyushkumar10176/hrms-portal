/**
 * Creating, editing and offboarding people from Slack.
 *
 * Each method re-checks authority rather than trusting that a button was only
 * rendered for the right person: an action id and a value are supplied by the
 * client, so a button is a convenience and never the boundary.
 *
 * Everything here runs inside the view_submission request, because Slack decides
 * whether to keep or close a modal from the response to that very request. That
 * means these methods may query and write but must never call out; the messages
 * that follow a successful write are left to SlackInteractionWorker.
 */
public inherited sharing class SlackPeopleAdmin {

    /** The result of a submission: closed, or kept open with a named fault. */
    public class Outcome {
        public Boolean ok;
        public String blockId;
        public String message;
        public Id recordId;

        private Outcome(Boolean ok, String blockId, String message, Id recordId) {
            this.ok = ok;
            this.blockId = blockId;
            this.message = message;
            this.recordId = recordId;
        }
    }

    /** For the other handlers, which return the same shape. */
    public static Outcome outcomeFor(Boolean ok, String message, Id recordId) {
        return new Outcome(ok, null, message, recordId);
    }

    /** A refusal the modal should show against one field, rather than in a message. */
    public static Outcome faultFor(String blockId, String message) {
        return new Outcome(false, blockId, message, null);
    }

    private static Outcome fault(String blockId, String message) {
        return new Outcome(false, blockId, message, null);
    }

    /** A refusal with no field to blame, told by message rather than in the modal. */
    private static Outcome refused(String message) {
        return new Outcome(false, null, message, null);
    }

    private static Outcome done(String message, Id recordId) {
        return new Outcome(true, null, message, recordId);
    }

    // ---- creating --------------------------------------------------------

    public static Outcome create(Map<String, String> values, Employee__c actor) {
        if (!SlackAuthz.canManageEmployees(actor)) {
            return refused('Only an administrator can add employees.');
        }

        String email = (values.get('email') ?? '').toLowerCase();
        Outcome badEmail = checkEmail(email);
        if (badEmail != null) {
            return badEmail;
        }
        if (SlackAdminData.byEmail(email) != null) {
            return fault('email', 'Somebody already has that address.');
        }

        String first = values.get('first_name') ?? '';
        String last = values.get('last_name') ?? '';
        Date joining = SlackModalValues.asDate(values.get('joining'));

        Employee__c employee = new Employee__c(
            Name = (first + ' ' + last).trim(),
            First_Name__c = first,
            Last_Name__c = last,
            Employee_Code__c = SlackAdminData.nextEmployeeCode(),
            Official_Email__c = email,
            Date_of_Joining__c = joining ?? AttendanceRollupService.businessDateOf(System.now()),
            Department_Ref__c = SlackModalValues.asId(values.get('department'), Department__c.SObjectType),
            Designation_Ref__c = SlackModalValues.asId(values.get('designation'), Designation__c.SObjectType),
            Reporting_Manager__c = SlackModalValues.asId(values.get('manager'), Employee__c.SObjectType),
            Employment_Type__c = values.get('employment_type') ?? 'Full_Time',
            Role__c = values.get('role') ?? 'Employee',
            Employee_Status__c = 'Active'
        );

        try {
            insert employee;
        } catch (DmlException e) {
            // The code is generated rather than auto numbered, so two admins
            // onboarding in the same second race for it. The uniqueness
            // constraint turns that into this, which is worth saying plainly.
            return refused(
                e.getMessage().contains('DUPLICATE_VALUE')
                    ? 'Somebody else was created at the same moment and took that employee code. Try again.'
                    : 'Salesforce refused that record: ' + e.getDmlMessage(0)
            );
        }

        return done(
            ':white_check_mark: *' + SlackBlocks.escape(employee.Name) + '* created as *' +
            employee.Employee_Code__c + '*.',
            employee.Id
        );
    }

    /**
     * A placeholder address links nothing and reaches nobody, and most of the
     * existing records carry one, so it is worth refusing at the point of entry.
     */
    private static Outcome checkEmail(String email) {
        if (!Pattern.matches('[^\\s@]+@[^\\s@]+\\.[^\\s@]+', email ?? '')) {
            return fault('email', 'That does not look like an email address.');
        }
        String lower = email.toLowerCase();
        if (lower.endsWith('@test.com') || lower.endsWith('@example.com')
            || lower.endsWith('@test.org') || lower.endsWith('@example.org')
            || lower.endsWith('@test.net') || lower.endsWith('@example.net')) {
            return fault('email', 'That is a placeholder address, not a real mailbox.');
        }
        return null;
    }

    // ---- editing ---------------------------------------------------------

    public static Outcome save(Id employeeId, Map<String, String> values, Employee__c actor) {
        if (!SlackAuthz.canManageEmployees(actor)) {
            return refused('Only an administrator can edit employees.');
        }
        Employee__c employee = SlackAdminData.employee(employeeId);
        if (employee == null) {
            return refused('That employee no longer exists.');
        }

        Employee__c patch = new Employee__c(Id = employeeId);
        Boolean changed = false;

        if (values.containsKey('email')) {
            String email = values.get('email').toLowerCase();
            Outcome badEmail = checkEmail(email);
            if (badEmail != null) {
                return badEmail;
            }
            Employee__c holder = SlackAdminData.byEmail(email);
            if (holder != null && holder.Id != employeeId) {
                return fault('email', 'Somebody else already has that address.');
            }
            patch.Official_Email__c = email;
            changed = true;
        }
        if (values.containsKey('mobile')) {
            patch.Mobile__c = values.get('mobile');
            changed = true;
        }
        if (values.containsKey('department')) {
            patch.Department_Ref__c =
                SlackModalValues.asId(values.get('department'), Department__c.SObjectType);
            changed = true;
        }
        if (values.containsKey('designation')) {
            patch.Designation_Ref__c =
                SlackModalValues.asId(values.get('designation'), Designation__c.SObjectType);
            changed = true;
        }
        if (values.containsKey('role')) {
            patch.Role__c = values.get('role');
            changed = true;
        }
        if (values.containsKey('manager')) {
            Id manager = SlackModalValues.asId(values.get('manager'), Employee__c.SObjectType);
            // Somebody reporting to themselves makes their own requests
            // undecidable, since nobody may approve their own.
            if (manager == employeeId) {
                return fault('manager', 'Somebody cannot report to themselves.');
            }
            patch.Reporting_Manager__c = manager;
            changed = true;
        }

        if (!changed) {
            return done('Nothing was changed.', employeeId);
        }
        try {
            update patch;
        } catch (DmlException e) {
            return refused('Salesforce refused that change: ' + e.getDmlMessage(0));
        }
        return done(
            ':white_check_mark: *' + SlackBlocks.escape(employee.Name) + '* updated.', employeeId
        );
    }

    // ---- offboarding -----------------------------------------------------

    public static Outcome offboard(Id employeeId, Map<String, String> values, Employee__c actor) {
        if (!SlackAuthz.canManageEmployees(actor)) {
            return refused('Only an administrator can offboard employees.');
        }
        Employee__c employee = SlackAdminData.employee(employeeId);
        if (employee == null) {
            return refused('That employee no longer exists.');
        }
        if (employee.Id == actor.Id) {
            return refused('You cannot offboard yourself.');
        }

        Date lwd = SlackModalValues.asDate(values.get('lwd'));
        Date today = AttendanceRollupService.businessDateOf(System.now());

        try {
            update new Employee__c(
                Id = employeeId,
                Employee_Status__c = 'Inactive',
                LWD__c = lwd ?? today,
                Resignation_Date__c = today,
                // Clearing these ends access now rather than at the next session
                // expiry, and the Slack link stops this app answering them at all.
                Password_Hash__c = null,
                Invite_Token_Hash__c = null,
                Slack_User_Id__c = null
            );
        } catch (DmlException e) {
            return refused('Salesforce refused that change: ' + e.getDmlMessage(0));
        }

        String reason = values.get('reason');
        return done(
            ':wave: *' + SlackBlocks.escape(employee.Name) + '* has been offboarded, last ' +
            'working day ' + SlackBlocks.dateText(lwd ?? today) + '.\n' +
            'Access is revoked. The record and its history are kept.' +
            (String.isBlank(reason) ? '' : '\n_Reason: ' + SlackBlocks.escape(reason) + '_'),
            employeeId
        );
    }

    // ---- reading ---------------------------------------------------------

    /** Search results, or the one profile when only one thing matched. */
    public static List<Object> searchResults(String term, Employee__c actor) {
        if (!SlackAuthz.canSeeCompanyWideData(actor)) {
            return new List<Object>{
                SlackBlocks.section('Only HR and administrators can search the directory.')
            };
        }
        List<Employee__c> matches = SlackAdminData.search(term);
        if (matches.isEmpty()) {
            return new List<Object>{
                SlackBlocks.section('Nothing matched "' + SlackBlocks.escape(term) + '".')
            };
        }
        if (matches.size() == 1) {
            return SlackEmployeeModals.profile(SlackAdminData.employee(matches[0].Id), actor);
        }

        List<List<String>> rows = new List<List<String>>();
        for (Employee__c match : matches) {
            rows.add(new List<String>{
                match.Employee_Code__c ?? '—',
                match.Name,
                match.Department_Ref__r == null
                    ? (match.Department__c ?? '—') : match.Department_Ref__r.Name,
                match.Employee_Status__c ?? '—'
            });
        }

        List<Object> blocks = new List<Object>{
            SlackBlocks.header(matches.size() + ' matches'),
            SlackBlocks.table(
                new List<String>{ 'Code', 'Name', 'Department', 'Status' }, rows, 20
            )
        };
        // A button per match would blow the block ceiling, so the first few get
        // one and the rest are found by searching more precisely.
        List<Object> buttons = new List<Object>();
        for (Integer i = 0; i < Math.min(matches.size(), 5); i++) {
            buttons.add(SlackBlocks.button(
                matches[i].First_Name__c ?? matches[i].Name,
                'hrms_view_profile', matches[i].Id, null
            ));
        }
        blocks.add(SlackBlocks.actions(buttons));
        blocks.add(SlackBlocks.context(
            'Search again with a code or full email address to open somebody directly.'
        ));
        return blocks;
    }
}
