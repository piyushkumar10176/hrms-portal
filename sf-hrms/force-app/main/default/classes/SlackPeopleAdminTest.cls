/**
 * Tests for onboarding, editing and offboarding people from Slack.
 *
 * Most of what matters here is what is refused. A button is rendered by this app
 * but pressed by a client, so every one of these entry points has to hold on its
 * own with no button involved at all, which is how these tests call them.
 */
@isTest
private class SlackPeopleAdminTest {

    @TestSetup
    static void setupTestData() {
        List<Employee__c> staff = TestDataFactory.createEmployees(3, true);
        staff[0].Role__c = 'Admin';
        staff[0].Slack_User_Id__c = 'U0ADMIN001';
        staff[1].Role__c = 'HR';
        staff[1].Slack_User_Id__c = 'U0HR000001';
        staff[2].Role__c = 'Employee';
        staff[2].Official_Email__c = 'ordinary.person@cloudsheer.test';
        update staff;
        insert new Department__c(Name = 'Engineering');
        insert new Designation__c(Name = 'Consultant');
    }

    private static Employee__c withRole(String role) {
        return [
            SELECT Id, Name, Role__c, Official_Email__c, Employee_Status__c, Slack_User_Id__c
            FROM Employee__c WHERE Role__c = :role LIMIT 1
        ];
    }

    private static Map<String, String> newJoinerForm() {
        return new Map<String, String>{
            'first_name' => 'Priya',
            'last_name' => 'Sharma',
            'email' => 'priya.sharma@cloudsheer.test',
            'joining' => SlackBlocks.dateText(Date.today()),
            'employment_type' => 'Full_Time',
            'role' => 'Employee'
        };
    }

    // ---- creating --------------------------------------------------------

    @isTest
    static void shouldCreateAnEmployeeWithTheNextCodeInSequence() {
        Test.startTest();
        SlackPeopleAdmin.Outcome outcome =
            SlackPeopleAdmin.create(newJoinerForm(), withRole('Admin'));
        Test.stopTest();

        Assert.isTrue(outcome.ok, 'An administrator may onboard: ' + outcome.message);
        Employee__c created = [
            SELECT Name, Employee_Code__c, Official_Email__c, Employee_Status__c,
                   Role__c, Employment_Type__c
            FROM Employee__c WHERE Id = :outcome.recordId
        ];
        Assert.areEqual('Priya Sharma', created.Name, 'The name is built from both halves');
        Assert.areEqual('EMP001', created.Employee_Code__c, 'The first EMP code is EMP001');
        Assert.areEqual('Active', created.Employee_Status__c, 'A new joiner starts active');
        Assert.areEqual(
            'priya.sharma@cloudsheer.test', created.Official_Email__c,
            'The address is stored lower case, because it is matched on'
        );
    }

    @isTest
    static void shouldContinueTheCodeSequenceRatherThanRestartIt() {
        Employee__c existing = withRole('Employee');
        existing.Employee_Code__c = 'EMP009';
        update existing;

        Test.startTest();
        SlackPeopleAdmin.Outcome outcome =
            SlackPeopleAdmin.create(newJoinerForm(), withRole('Admin'));
        Test.stopTest();

        Assert.areEqual(
            'EMP010',
            [SELECT Employee_Code__c FROM Employee__c WHERE Id = :outcome.recordId].Employee_Code__c,
            'EMP009 is followed by EMP010, not EMP0010 and not EMP001'
        );
    }

    @isTest
    static void shouldRefuseOnboardingByAnybodyButAnAdministrator() {
        Test.startTest();
        SlackPeopleAdmin.Outcome byHr = SlackPeopleAdmin.create(newJoinerForm(), withRole('HR'));
        SlackPeopleAdmin.Outcome byEmployee =
            SlackPeopleAdmin.create(newJoinerForm(), withRole('Employee'));
        Test.stopTest();

        Assert.isFalse(byHr.ok, 'HR reads the directory but does not create people');
        Assert.isFalse(byEmployee.ok, 'An ordinary employee certainly does not');
        Assert.areEqual(
            3, [SELECT COUNT() FROM Employee__c],
            'Only the three from setup should exist'
        );
    }

    @isTest
    static void shouldRefuseAnAddressThatIsNotOne() {
        Map<String, String> values = newJoinerForm();
        values.put('email', 'priya at cloudsheer');

        Test.startTest();
        SlackPeopleAdmin.Outcome outcome = SlackPeopleAdmin.create(values, withRole('Admin'));
        Test.stopTest();

        Assert.isFalse(outcome.ok, 'That is not an address');
        Assert.areEqual('email', outcome.blockId, 'The modal should mark the email field');
    }

    @isTest
    static void shouldRefuseAPlaceholderAddress() {
        Map<String, String> values = newJoinerForm();
        values.put('email', 'priya@example.com');

        Test.startTest();
        SlackPeopleAdmin.Outcome outcome = SlackPeopleAdmin.create(values, withRole('Admin'));
        Test.stopTest();

        Assert.isFalse(
            outcome.ok,
            'A placeholder address matches no Slack account, so the person would get nothing'
        );
        Assert.areEqual('email', outcome.blockId, 'The email field is what has to change');
    }

    @isTest
    static void shouldRefuseAnAddressSomebodyAlreadyHas() {
        Map<String, String> values = newJoinerForm();
        values.put('email', 'ordinary.person@cloudsheer.test');

        Test.startTest();
        SlackPeopleAdmin.Outcome outcome = SlackPeopleAdmin.create(values, withRole('Admin'));
        Test.stopTest();

        Assert.isFalse(
            outcome.ok,
            'Two records on one address would both claim the same Slack account'
        );
        Assert.areEqual('email', outcome.blockId, 'The email field is the collision');
    }

    // ---- editing ---------------------------------------------------------

    @isTest
    static void shouldChangeOnlyTheFieldsThatWereFilledIn() {
        Employee__c subject = withRole('Employee');
        Id departmentId = [SELECT Id FROM Department__c LIMIT 1].Id;

        Test.startTest();
        SlackPeopleAdmin.Outcome outcome = SlackPeopleAdmin.save(
            subject.Id,
            new Map<String, String>{ 'mobile' => '9876543210', 'department' => departmentId },
            withRole('Admin')
        );
        Test.stopTest();

        Assert.isTrue(outcome.ok, 'A partial edit is the ordinary case: ' + outcome.message);
        Employee__c after = [
            SELECT Mobile__c, Department_Ref__c, Official_Email__c, Role__c
            FROM Employee__c WHERE Id = :subject.Id
        ];
        Assert.areEqual('9876543210', after.Mobile__c, 'The mobile should be set');
        Assert.areEqual(departmentId, after.Department_Ref__c, 'The department should be set');
        Assert.areEqual(
            subject.Official_Email__c, after.Official_Email__c,
            'A field left blank means leave it alone, not blank it'
        );
    }

    @isTest
    static void shouldRefuseMakingSomebodyTheirOwnManager() {
        Employee__c subject = withRole('Employee');

        Test.startTest();
        SlackPeopleAdmin.Outcome outcome = SlackPeopleAdmin.save(
            subject.Id, new Map<String, String>{ 'manager' => subject.Id }, withRole('Admin')
        );
        Test.stopTest();

        Assert.isFalse(
            outcome.ok,
            'Self-approval is refused everywhere, so this would make their leave undecidable'
        );
        Assert.areEqual('manager', outcome.blockId, 'The manager field is at fault');
    }

    @isTest
    static void shouldRefuseAnEditByAnybodyButAnAdministrator() {
        Employee__c subject = withRole('Employee');

        Test.startTest();
        SlackPeopleAdmin.Outcome outcome = SlackPeopleAdmin.save(
            subject.Id, new Map<String, String>{ 'mobile' => '9999999999' }, withRole('HR')
        );
        Test.stopTest();

        Assert.isFalse(outcome.ok, 'HR reads but does not edit');
        Assert.isNull(
            [SELECT Mobile__c FROM Employee__c WHERE Id = :subject.Id].Mobile__c,
            'Nothing should have been written'
        );
    }

    @isTest
    static void shouldSayNothingChangedRatherThanWriteAnEmptyUpdate() {
        Test.startTest();
        SlackPeopleAdmin.Outcome outcome = SlackPeopleAdmin.save(
            withRole('Employee').Id, new Map<String, String>(), withRole('Admin')
        );
        Test.stopTest();

        Assert.isTrue(outcome.ok, 'An empty edit is not a failure');
        Assert.areEqual(
            'Nothing was changed.', outcome.message,
            'It should say so rather than claim an update'
        );
    }

    // ---- offboarding -----------------------------------------------------

    @isTest
    static void shouldMarkSomebodyInactiveAndRevokeTheirAccess() {
        Employee__c subject = withRole('Employee');
        subject.Slack_User_Id__c = 'U0LEAVER01';
        subject.Password_Hash__c = 'a-hash-that-should-not-survive';
        update subject;

        Test.startTest();
        SlackPeopleAdmin.Outcome outcome = SlackPeopleAdmin.offboard(
            subject.Id,
            new Map<String, String>{
                'lwd' => SlackBlocks.dateText(Date.today().addDays(30)),
                'reason' => 'Moving to another company'
            },
            withRole('Admin')
        );
        Test.stopTest();

        Assert.isTrue(outcome.ok, 'An administrator may offboard: ' + outcome.message);
        Employee__c after = [
            SELECT Employee_Status__c, LWD__c, Resignation_Date__c,
                   Password_Hash__c, Slack_User_Id__c
            FROM Employee__c WHERE Id = :subject.Id
        ];
        Assert.areEqual('Inactive', after.Employee_Status__c, 'The record is deactivated');
        Assert.areEqual(
            Date.today().addDays(30), after.LWD__c, 'The chosen last working day should stick'
        );
        Assert.isNull(
            after.Password_Hash__c,
            'Access ends now rather than at the next session expiry'
        );
        Assert.isNull(
            after.Slack_User_Id__c,
            'Unlinking Slack is what stops this app answering them'
        );
        Assert.isTrue(
            outcome.message.contains('history are kept'),
            'The admin should be told the record survives: ' + outcome.message
        );
    }

    @isTest
    static void shouldRefuseOffboardingYourself() {
        Employee__c admin = withRole('Admin');

        Test.startTest();
        SlackPeopleAdmin.Outcome outcome =
            SlackPeopleAdmin.offboard(admin.Id, new Map<String, String>(), admin);
        Test.stopTest();

        Assert.isFalse(outcome.ok, 'Locking yourself out by accident helps nobody');
        Assert.areEqual(
            'Active',
            [SELECT Employee_Status__c FROM Employee__c WHERE Id = :admin.Id].Employee_Status__c,
            'The administrator should still be active'
        );
    }

    // ---- searching -------------------------------------------------------

    @isTest
    static void shouldOpenTheProfileDirectlyWhenOnlyOnePersonMatches() {
        Test.startTest();
        String rendered =
            JSON.serialize(SlackPeopleAdmin.searchResults('ordinary.person', withRole('HR')));
        Test.stopTest();

        Assert.isTrue(
            rendered.contains('Employee 2'),
            'One match is a profile, not a list of one'
        );
    }

    @isTest
    static void shouldListMatchesWhenSeveralPeopleMatch() {
        Test.startTest();
        String rendered =
            JSON.serialize(SlackPeopleAdmin.searchResults('Test Employee', withRole('HR')));
        Test.stopTest();

        Assert.isTrue(rendered.contains('3 matches'), 'All three should be found');
        Assert.isTrue(
            rendered.contains('hrms_view_profile'),
            'Each match should be openable without retyping the search'
        );
    }

    @isTest
    static void shouldRefuseTheDirectoryToAnOrdinaryEmployee() {
        Test.startTest();
        String rendered =
            JSON.serialize(SlackPeopleAdmin.searchResults('Test', withRole('Employee')));
        Test.stopTest();

        Assert.isTrue(
            rendered.contains('Only HR and administrators'),
            'The directory is company-wide data'
        );
        Assert.isFalse(
            rendered.contains('Employee 1'),
            'No names should leak in the refusal'
        );
    }

    @isTest
    static void shouldSayNothingMatchedRatherThanReturnAnEmptyList() {
        Test.startTest();
        String rendered =
            JSON.serialize(SlackPeopleAdmin.searchResults('zzzznobody', withRole('Admin')));
        Test.stopTest();

        Assert.isTrue(
            rendered.contains('Nothing matched'),
            'A silent empty answer reads as a broken command'
        );
    }

    // ---- the profile -----------------------------------------------------

    @isTest
    static void shouldWithholdIdentifiersFromSomebodyWhoIsNeitherHrNorTheSubject() {
        Employee__c subject = withRole('HR');
        subject.PAN__c = 'ABCDE1234F';
        subject.Bank_Account_Number__c = '000111222333';
        update subject;

        Test.startTest();
        String rendered = JSON.serialize(SlackEmployeeModals.profile(
            SlackAdminData.employee(subject.Id), withRole('Employee')
        ));
        Test.stopTest();

        Assert.isFalse(rendered.contains('ABCDE1234F'), 'A PAN is not for colleagues');
        Assert.isFalse(rendered.contains('000111222333'), 'Nor is a bank account');
        Assert.isFalse(
            rendered.contains('hrms_offboard'),
            'Nor should buttons appear that the action would refuse anyway'
        );
    }

    @isTest
    static void shouldShowIdentifiersAndControlsToAnAdministrator() {
        Employee__c subject = withRole('Employee');
        subject.PAN__c = 'ABCDE1234F';
        update subject;

        Test.startTest();
        String rendered = JSON.serialize(SlackEmployeeModals.profile(
            SlackAdminData.employee(subject.Id), withRole('Admin')
        ));
        Test.stopTest();

        Assert.isTrue(rendered.contains('ABCDE1234F'), 'HR and admin may see identifiers');
        Assert.isTrue(rendered.contains('hrms_offboard'), 'An administrator gets the controls');
        Assert.isTrue(
            rendered.contains('Slack not linked'),
            'An unlinked person should be flagged, because they receive nothing'
        );
    }

    // ---- the forms themselves --------------------------------------------

    @isTest
    static void shouldBuildThePeopleFormsWithTheirCallbacksIntact() {
        Employee__c subject = SlackAdminData.employee(withRole('Employee').Id);

        Test.startTest();
        Map<String, Object> add = SlackEmployeeModals.addEmployee();
        Map<String, Object> edit = SlackEmployeeModals.editEmployee(subject);
        Map<String, Object> offboard = SlackEmployeeModals.offboard(subject);
        Map<String, Object> find = SlackEmployeeModals.findEmployee();
        Test.stopTest();

        Assert.areEqual(SlackEmployeeModals.ADD_CALLBACK, add.get('callback_id'), 'Add routes back');
        Assert.areEqual(SlackEmployeeModals.EDIT_CALLBACK, edit.get('callback_id'), 'Edit routes back');
        Assert.areEqual(
            subject.Id, edit.get('private_metadata'),
            'The edit form has to remember whose record it is'
        );
        Assert.areEqual(
            subject.Id, offboard.get('private_metadata'),
            'So does the offboarding form'
        );
        Assert.areEqual(SlackEmployeeModals.FIND_CALLBACK, find.get('callback_id'), 'Find routes back');
        Assert.isFalse(
            JSON.serialize(add).contains('invit'),
            'This app sends no portal invitation, so the form must not promise one'
        );
    }
}
