/**
 * The people forms, and the profile they act on.
 *
 * The onboarding form is deliberately short. Slack caps a modal at 100 blocks,
 * offers no file upload inside one, and gives no way to page, so a full thirty
 * field form would become a chain of screens that people abandon halfway. Only
 * what is needed to create a usable record is asked here; bank details,
 * identifiers and documents are filled in afterwards on the record, which is how
 * HR actually works.
 *
 * This app creates no portal invitation. Slack is the whole interface, so what
 * matters at onboarding is that the person's Slack account is linked to their
 * record, and that is attempted from their work email rather than mailed to them.
 */
public inherited sharing class SlackEmployeeModals {

    public static final String ADD_CALLBACK = 'hrms_add_employee';
    public static final String EDIT_CALLBACK = 'hrms_edit_employee';
    public static final String OFFBOARD_CALLBACK = 'hrms_offboard_employee';
    public static final String FIND_CALLBACK = 'hrms_find_employee';

    private static List<SlackViewBuilder.Choice> employmentTypes() {
        return new List<SlackViewBuilder.Choice>{
            new SlackViewBuilder.Choice('Full Time', 'Full_Time'),
            new SlackViewBuilder.Choice('Contract', 'Contract'),
            new SlackViewBuilder.Choice('Intern', 'Intern'),
            new SlackViewBuilder.Choice('Consultant', 'Consultant')
        };
    }

    private static List<SlackViewBuilder.Choice> roles() {
        return new List<SlackViewBuilder.Choice>{
            new SlackViewBuilder.Choice('Employee', 'Employee'),
            new SlackViewBuilder.Choice('HR', 'HR'),
            new SlackViewBuilder.Choice('Admin', 'Admin')
        };
    }

    // ---- onboarding ------------------------------------------------------

    public static Map<String, Object> addEmployee() {
        List<SlackViewBuilder.Choice> departments = SlackAdminData.departmentChoices();
        List<SlackViewBuilder.Choice> designations = SlackAdminData.designationChoices();
        List<SlackViewBuilder.Choice> managers = SlackAdminData.employeeChoices();

        List<Object> blocks = new List<Object>{
            SlackBlocks.section(
                'Creates the employee record and links their Slack account from their ' +
                'work email, so they can use the app straight away.'
            ),
            SlackViewBuilder.input('first_name', 'First name', SlackViewBuilder.textInput('Priya')),
            SlackViewBuilder.input('last_name', 'Last name', SlackViewBuilder.textInput('Sharma')),
            SlackViewBuilder.input(
                'email', 'Work email', SlackViewBuilder.textInput('priya@cloudsheer.com'),
                false, 'This is what links their Slack account, so it must match the one they use here.'
            ),
            SlackViewBuilder.input(
                'joining', 'Date of joining',
                SlackViewBuilder.datePicker(AttendanceRollupService.businessDateOf(System.now()))
            )
        };

        // Slack refuses a select carrying no options, so an empty list means the
        // block is left out rather than rendered empty.
        if (!departments.isEmpty()) {
            blocks.add(SlackViewBuilder.input(
                'department', 'Department', SlackViewBuilder.selectInput(departments, null), true, null
            ));
        }
        if (!designations.isEmpty()) {
            blocks.add(SlackViewBuilder.input(
                'designation', 'Designation', SlackViewBuilder.selectInput(designations, null), true, null
            ));
        }
        if (!managers.isEmpty()) {
            blocks.add(SlackViewBuilder.input(
                'manager', 'Reporting manager', SlackViewBuilder.selectInput(managers, null), true,
                'Naming a manager is what makes them the approver for this person.'
            ));
        }

        blocks.add(SlackViewBuilder.input(
            'employment_type', 'Employment type',
            SlackViewBuilder.selectInput(employmentTypes(), 'Full_Time'), true, null
        ));
        blocks.add(SlackViewBuilder.input(
            'role', 'Access level', SlackViewBuilder.selectInput(roles(), 'Employee'), true,
            'Employee sees only their own data. HR sees everyone. Admin can also create records.'
        ));
        blocks.add(SlackBlocks.context(
            'Bank details, identifiers and documents are added afterwards on the employee record.'
        ));

        return SlackViewBuilder.modal(ADD_CALLBACK, 'Add an employee', 'Create', null, blocks);
    }

    // ---- editing ---------------------------------------------------------

    public static Map<String, Object> editEmployee(Employee__c employee) {
        List<SlackViewBuilder.Choice> departments = SlackAdminData.departmentChoices();
        List<SlackViewBuilder.Choice> designations = SlackAdminData.designationChoices();
        List<SlackViewBuilder.Choice> managers = SlackAdminData.employeeChoices();

        List<Object> blocks = new List<Object>{
            SlackBlocks.section(
                'Editing *' + SlackBlocks.escape(employee.Name) + '*' +
                (String.isBlank(employee.Employee_Code__c) ? '' : '  ·  ' + employee.Employee_Code__c)
            ),
            SlackViewBuilder.input(
                'email', 'Work email',
                SlackViewBuilder.textInput(null, employee.Official_Email__c, false), true, null
            ),
            SlackViewBuilder.input(
                'mobile', 'Mobile',
                SlackViewBuilder.textInput(null, employee.Mobile__c, false), true, null
            )
        };

        if (!departments.isEmpty()) {
            blocks.add(SlackViewBuilder.input(
                'department', 'Department',
                SlackViewBuilder.selectInput(departments, employee.Department_Ref__c), true, null
            ));
        }
        if (!designations.isEmpty()) {
            blocks.add(SlackViewBuilder.input(
                'designation', 'Designation',
                SlackViewBuilder.selectInput(designations, employee.Designation_Ref__c), true, null
            ));
        }
        if (!managers.isEmpty()) {
            blocks.add(SlackViewBuilder.input(
                'manager', 'Reporting manager',
                SlackViewBuilder.selectInput(managers, employee.Reporting_Manager__c), true, null
            ));
        }
        blocks.add(SlackViewBuilder.input(
            'role', 'Access level',
            SlackViewBuilder.selectInput(roles(), employee.Role__c ?? 'Employee'), true, null
        ));
        blocks.add(SlackBlocks.context('_Leave a field blank to keep what is already there._'));

        return SlackViewBuilder.modal(EDIT_CALLBACK, 'Edit employee', 'Save', employee.Id, blocks);
    }

    // ---- offboarding -----------------------------------------------------

    /** Marks the record inactive. Nothing is ever deleted. */
    public static Map<String, Object> offboard(Employee__c employee) {
        return SlackViewBuilder.modal(OFFBOARD_CALLBACK, 'Offboard', 'Offboard', employee.Id,
            new List<Object>{
                SlackBlocks.section(
                    '*' + SlackBlocks.escape(employee.Name) + '* will be marked inactive and will ' +
                    'no longer be able to use the HRMS commands or see anything in this app.'
                ),
                SlackBlocks.context('The record and its history are kept. Nothing is deleted.'),
                SlackViewBuilder.input(
                    'lwd', 'Last working day',
                    SlackViewBuilder.datePicker(AttendanceRollupService.businessDateOf(System.now()))
                ),
                SlackViewBuilder.input(
                    'reason', 'Reason',
                    SlackViewBuilder.textInput('Resigned, moving to another company', null, true),
                    true, null
                )
            }
        );
    }

    // ---- finding ---------------------------------------------------------

    public static Map<String, Object> findEmployee() {
        return SlackViewBuilder.modal(FIND_CALLBACK, 'Find an employee', 'Search', null,
            new List<Object>{
                SlackViewBuilder.input(
                    'term', 'Name, code or email',
                    SlackViewBuilder.textInput('piyush, EMP018, or piyush@…')
                )
            }
        );
    }

    // ---- the profile -----------------------------------------------------

    /**
     * One person's record as a message.
     *
     * Bank details and government identifiers appear only when the reader is
     * allowed them, and the decision comes from SlackAuthz rather than from
     * whichever button opened this.
     */
    public static List<Object> profile(Employee__c employee, Employee__c actor) {
        Boolean sensitive = SlackAuthz.canSeeSensitiveFields(actor, employee.Id);
        Boolean manage = SlackAuthz.canManageEmployees(actor);

        List<Object> blocks = new List<Object>{
            SlackBlocks.header(employee.Name),
            SlackBlocks.fields(
                new List<String>{ 'Code', 'Status', 'Department', 'Designation', 'Reporting to' },
                new List<String>{
                    employee.Employee_Code__c,
                    employee.Employee_Status__c,
                    departmentOf(employee),
                    designationOf(employee),
                    employee.Reporting_Manager__r == null ? '' : employee.Reporting_Manager__r.Name
                }
            ),
            SlackBlocks.fields(
                new List<String>{ 'Access level', 'Email', 'Mobile', 'Joined', 'Employment' },
                new List<String>{
                    employee.Role__c ?? 'Employee',
                    employee.Official_Email__c,
                    employee.Mobile__c,
                    SlackBlocks.dateText(employee.Date_of_Joining__c),
                    (employee.Employment_Type__c ?? '').replace('_', ' ')
                }
            )
        };

        if (sensitive) {
            blocks.add(SlackBlocks.divider());
            blocks.add(SlackBlocks.section('*Sensitive details*'));
            blocks.add(SlackBlocks.fields(
                new List<String>{ 'Date of birth', 'Bank account', 'IFSC', 'PAN', 'Aadhaar' },
                new List<String>{
                    SlackBlocks.dateText(employee.DOB__c),
                    employee.Bank_Account_Number__c,
                    employee.IFSC_Code__c,
                    employee.PAN__c,
                    employee.Aadhaar__c
                }
            ));
            blocks.add(SlackBlocks.context(
                ':lock: Visible to you because you are HR or an administrator. ' +
                'This message stays in your Slack history.'
            ));
        }

        blocks.add(SlackBlocks.context(
            String.isBlank(employee.Slack_User_Id__c)
                ? ':warning: Slack not linked, so this person receives nothing from the app.'
                : ':white_check_mark: Slack linked'
        ));

        if (manage && employee.Employee_Status__c == 'Active') {
            blocks.add(SlackBlocks.actions(new List<Object>{
                SlackBlocks.button('Edit', 'hrms_edit_employee', employee.Id, null),
                SlackBlocks.button('Attendance', 'hrms_view_attendance', employee.Id, null),
                SlackBlocks.button('Link Slack', 'hrms_link_slack', employee.Id, null),
                SlackBlocks.button('Offboard', 'hrms_offboard', employee.Id, 'danger')
            }));
        }
        return blocks;
    }

    private static String departmentOf(Employee__c employee) {
        if (employee.Department_Ref__r != null && String.isNotBlank(employee.Department_Ref__r.Name)) {
            return employee.Department_Ref__r.Name;
        }
        return employee.Department__c;
    }

    private static String designationOf(Employee__c employee) {
        if (employee.Designation_Ref__r != null && String.isNotBlank(employee.Designation_Ref__r.Name)) {
            return employee.Designation_Ref__r.Name;
        }
        return employee.Designation__c;
    }
}
