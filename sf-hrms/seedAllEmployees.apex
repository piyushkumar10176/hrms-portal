// Seed all Cloudsheer HRMS Employees into Salesforce
// Run via: sf apex run -f seedAllEmployees.apex -o hrms-org

List<Employee__c> emps = new List<Employee__c>();

emps.add(new Employee__c(Name='Tushar Sharma', First_Name__c='Tushar', Last_Name__c='Sharma', Official_Email__c='emp001@test.com', Employee_Code__c='EMP001', Department__c='Executive', Designation__c='CEO', Date_of_Joining__c=Date.valueOf('2020-01-01'), Employee_Status__c='Active', Gender__c='Male'));
emps.add(new Employee__c(Name='Rajat Sharma', First_Name__c='Rajat', Last_Name__c='Sharma', Official_Email__c='emp002@test.com', Employee_Code__c='EMP002', Department__c='Technical Delivery', Designation__c='Technical Delivery Head', Date_of_Joining__c=Date.valueOf('2020-06-01'), Employee_Status__c='Active', Gender__c='Male'));
emps.add(new Employee__c(Name='Shubham Bansal', First_Name__c='Shubham', Last_Name__c='Bansal', Official_Email__c='emp003@test.com', Employee_Code__c='EMP003', Department__c='Growth & Marketing', Designation__c='Growth & Marketing - Head', Date_of_Joining__c=Date.valueOf('2020-06-01'), Employee_Status__c='Active', Gender__c='Male'));
emps.add(new Employee__c(Name='Bharat Sharma', First_Name__c='Bharat', Last_Name__c='Sharma', Official_Email__c='emp004@test.com', Employee_Code__c='EMP004', Department__c='Operations', Designation__c='Head of Operations', Date_of_Joining__c=Date.valueOf('2020-06-01'), Employee_Status__c='Active', Gender__c='Male'));
emps.add(new Employee__c(Name='Ankur Trivedi', First_Name__c='Ankur', Last_Name__c='Trivedi', Official_Email__c='emp005@test.com', Employee_Code__c='EMP005', Department__c='Technical Delivery', Designation__c='Salesforce Developer', Date_of_Joining__c=Date.valueOf('2022-01-15'), Employee_Status__c='Active', Gender__c='Male'));
emps.add(new Employee__c(Name='Shainkey Pawaiya', First_Name__c='Shainkey', Last_Name__c='Pawaiya', Official_Email__c='piyushkumarsingh8962@gmail.com', Employee_Code__c='EMP006', Department__c='Technical Delivery', Designation__c='Project Manager', Date_of_Joining__c=Date.valueOf('2021-03-01'), Employee_Status__c='Active', Gender__c='Male'));
emps.add(new Employee__c(Name='Pranay Pandey', First_Name__c='Pranay', Last_Name__c='Pandey', Official_Email__c='emp007@test.com', Employee_Code__c='EMP007', Department__c='QA', Designation__c='Team Lead - QA', Date_of_Joining__c=Date.valueOf('2021-05-10'), Employee_Status__c='Active', Gender__c='Male'));
emps.add(new Employee__c(Name='Arihanta Jain', First_Name__c='Arihanta', Last_Name__c='Jain', Official_Email__c='emp008@test.com', Employee_Code__c='EMP008', Department__c='HR', Designation__c='Assistant Manager HR', Date_of_Joining__c=Date.valueOf('2021-08-20'), Employee_Status__c='Active', Gender__c='Female'));
emps.add(new Employee__c(Name='Shivam Goel', First_Name__c='Shivam', Last_Name__c='Goel', Official_Email__c='emp009@test.com', Employee_Code__c='EMP009', Department__c='Growth & Marketing', Designation__c='Strategy & Growth - Associate', Date_of_Joining__c=Date.valueOf('2022-02-15'), Employee_Status__c='Active', Gender__c='Male'));
emps.add(new Employee__c(Name='Prateek Jain', First_Name__c='Prateek', Last_Name__c='Jain', Official_Email__c='emp010@test.com', Employee_Code__c='EMP010', Department__c='Growth & Marketing', Designation__c='Strategy & Growth - Associate', Date_of_Joining__c=Date.valueOf('2022-04-10'), Employee_Status__c='Active', Gender__c='Male'));
emps.add(new Employee__c(Name='Tammana Gautam', First_Name__c='Tammana', Last_Name__c='Gautam', Official_Email__c='emp011@test.com', Employee_Code__c='EMP011', Department__c='Technical Delivery', Designation__c='BA - Salesforce', Date_of_Joining__c=Date.valueOf('2022-06-05'), Employee_Status__c='Active', Gender__c='Female'));
emps.add(new Employee__c(Name='Vishal Yadav', First_Name__c='Vishal', Last_Name__c='Yadav', Official_Email__c='emp012@test.com', Employee_Code__c='EMP012', Department__c='Technical Delivery', Designation__c='BA - Salesforce', Date_of_Joining__c=Date.valueOf('2022-07-15'), Employee_Status__c='Active', Gender__c='Male'));
emps.add(new Employee__c(Name='Abhishek Kaplesh', First_Name__c='Abhishek', Last_Name__c='Kaplesh', Official_Email__c='emp013@test.com', Employee_Code__c='EMP013', Department__c='Technical Delivery', Designation__c='Salesforce Developer', Date_of_Joining__c=Date.valueOf('2023-01-10'), Employee_Status__c='Active', Gender__c='Male'));
emps.add(new Employee__c(Name='Ishit Bansal', First_Name__c='Ishit', Last_Name__c='Bansal', Official_Email__c='emp014@test.com', Employee_Code__c='EMP014', Department__c='Technical Delivery', Designation__c='Salesforce Developer', Date_of_Joining__c=Date.valueOf('2023-02-20'), Employee_Status__c='Active', Gender__c='Male'));
emps.add(new Employee__c(Name='Arun Kumar', First_Name__c='Arun', Last_Name__c='Kumar', Official_Email__c='emp015@test.com', Employee_Code__c='EMP015', Department__c='Technical Delivery', Designation__c='Salesforce Developer', Date_of_Joining__c=Date.valueOf('2023-03-15'), Employee_Status__c='Active', Gender__c='Male'));
emps.add(new Employee__c(Name='Divyansh Sharma', First_Name__c='Divyansh', Last_Name__c='Sharma', Official_Email__c='emp016@test.com', Employee_Code__c='EMP016', Department__c='Technical Delivery', Designation__c='Salesforce Developer', Date_of_Joining__c=Date.valueOf('2023-04-10'), Employee_Status__c='Active', Gender__c='Male'));
emps.add(new Employee__c(Name='Gaurav Khanna', First_Name__c='Gaurav', Last_Name__c='Khanna', Official_Email__c='emp017@test.com', Employee_Code__c='EMP017', Department__c='Technical Delivery', Designation__c='Salesforce Developer', Date_of_Joining__c=Date.valueOf('2023-05-05'), Employee_Status__c='Active', Gender__c='Male'));
emps.add(new Employee__c(Name='Piyush Kumar Singh', First_Name__c='Piyush', Last_Name__c='Kumar Singh', Official_Email__c='piyush.kumar@cloudsheer.com', Employee_Code__c='EMP018', Department__c='Technical Delivery', Designation__c='Salesforce Developer', Date_of_Joining__c=Date.valueOf('2023-06-01'), Employee_Status__c='Active', Gender__c='Male'));
emps.add(new Employee__c(Name='Rahul Babbar', First_Name__c='Rahul', Last_Name__c='Babbar', Official_Email__c='emp019@test.com', Employee_Code__c='EMP019', Department__c='Technical Delivery', Designation__c='Salesforce Developer', Date_of_Joining__c=Date.valueOf('2023-07-20'), Employee_Status__c='Active', Gender__c='Male'));
emps.add(new Employee__c(Name='Vansh Nandan Mathur', First_Name__c='Vansh', Last_Name__c='Nandan Mathur', Official_Email__c='emp020@test.com', Employee_Code__c='EMP020', Department__c='Technical Delivery', Designation__c='Associate Salesforce Developer', Date_of_Joining__c=Date.valueOf('2023-08-15'), Employee_Status__c='Active', Gender__c='Male'));
emps.add(new Employee__c(Name='Aayush Gupta', First_Name__c='Aayush', Last_Name__c='Gupta', Official_Email__c='emp021@test.com', Employee_Code__c='EMP021', Department__c='Technical Delivery', Designation__c='Associate Salesforce Developer', Date_of_Joining__c=Date.valueOf('2023-09-10'), Employee_Status__c='Active', Gender__c='Male'));
emps.add(new Employee__c(Name='Himanshu Yadav', First_Name__c='Himanshu', Last_Name__c='Yadav', Official_Email__c='emp022@test.com', Employee_Code__c='EMP022', Department__c='QA', Designation__c='QA', Date_of_Joining__c=Date.valueOf('2023-10-05'), Employee_Status__c='Active', Gender__c='Male'));
emps.add(new Employee__c(Name='Manish Pavadiya', First_Name__c='Manish', Last_Name__c='Pavadiya', Official_Email__c='emp023@test.com', Employee_Code__c='EMP023', Department__c='Technical Delivery', Designation__c='Salesforce Consultant', Date_of_Joining__c=Date.valueOf('2023-11-20'), Employee_Status__c='Active', Gender__c='Male'));
emps.add(new Employee__c(Name='Sweety Singh', First_Name__c='Sweety', Last_Name__c='Singh', Official_Email__c='emp024@test.com', Employee_Code__c='EMP024', Department__c='Technical Delivery', Designation__c='Associate Salesforce Developer', Date_of_Joining__c=Date.valueOf('2024-01-15'), Employee_Status__c='Active', Gender__c='Female'));
emps.add(new Employee__c(Name='Alka Yadav', First_Name__c='Alka', Last_Name__c='Yadav', Official_Email__c='emp025@test.com', Employee_Code__c='EMP025', Department__c='HR', Designation__c='HR Associate', Date_of_Joining__c=Date.valueOf('2024-02-10'), Employee_Status__c='Active', Gender__c='Female'));
emps.add(new Employee__c(Name='Bhu Garima Yadav', First_Name__c='Bhu Garima', Last_Name__c='Yadav', Official_Email__c='emp026@test.com', Employee_Code__c='EMP026', Department__c='Technical Delivery', Designation__c='Associate Salesforce Developer', Date_of_Joining__c=Date.valueOf('2024-03-05'), Employee_Status__c='Active', Gender__c='Female'));
emps.add(new Employee__c(Name='Utkarsh', First_Name__c='Utkarsh', Last_Name__c='', Official_Email__c='emp027@test.com', Employee_Code__c='EMP027', Department__c='Technical Delivery', Designation__c='Salesforce Developer', Date_of_Joining__c=Date.valueOf('2024-04-01'), Employee_Status__c='Active', Gender__c='Male'));

insert emps;
System.debug('Successfully inserted ' + emps.size() + ' employees');

// Now set up Reporting Manager relationships
// First get the inserted records by Employee_Code__c
Map<String, Id> codeToId = new Map<String, Id>();
for (Employee__c e : [SELECT Id, Employee_Code__c FROM Employee__c WHERE Employee_Code__c != null]) {
    codeToId.put(e.Employee_Code__c, e.Id);
}

List<Employee__c> updates = new List<Employee__c>();

// CEO has no manager
// EMP002 Rajat -> EMP001 Tushar
updates.add(new Employee__c(Id=codeToId.get('EMP002'), Reporting_Manager__c=codeToId.get('EMP001')));
// EMP003 Shubham -> EMP001
updates.add(new Employee__c(Id=codeToId.get('EMP003'), Reporting_Manager__c=codeToId.get('EMP001')));
// EMP004 Bharat -> EMP001
updates.add(new Employee__c(Id=codeToId.get('EMP004'), Reporting_Manager__c=codeToId.get('EMP001')));
// EMP005 Ankur -> EMP006 Shainkey
updates.add(new Employee__c(Id=codeToId.get('EMP005'), Reporting_Manager__c=codeToId.get('EMP006')));
// EMP006 Shainkey -> EMP002 Rajat
updates.add(new Employee__c(Id=codeToId.get('EMP006'), Reporting_Manager__c=codeToId.get('EMP002')));
// EMP007 Pranay -> EMP006
updates.add(new Employee__c(Id=codeToId.get('EMP007'), Reporting_Manager__c=codeToId.get('EMP006')));
// EMP008 Arihanta -> EMP004
updates.add(new Employee__c(Id=codeToId.get('EMP008'), Reporting_Manager__c=codeToId.get('EMP004')));
// EMP009 Shivam -> EMP003
updates.add(new Employee__c(Id=codeToId.get('EMP009'), Reporting_Manager__c=codeToId.get('EMP003')));
// EMP010 Prateek -> EMP003
updates.add(new Employee__c(Id=codeToId.get('EMP010'), Reporting_Manager__c=codeToId.get('EMP003')));
// EMP011 Tammana -> EMP006
updates.add(new Employee__c(Id=codeToId.get('EMP011'), Reporting_Manager__c=codeToId.get('EMP006')));
// EMP012 Vishal -> EMP006
updates.add(new Employee__c(Id=codeToId.get('EMP012'), Reporting_Manager__c=codeToId.get('EMP006')));
// EMP013 Abhishek -> EMP006
updates.add(new Employee__c(Id=codeToId.get('EMP013'), Reporting_Manager__c=codeToId.get('EMP006')));
// EMP014 Ishit -> EMP006
updates.add(new Employee__c(Id=codeToId.get('EMP014'), Reporting_Manager__c=codeToId.get('EMP006')));
// EMP015 Arun -> EMP006
updates.add(new Employee__c(Id=codeToId.get('EMP015'), Reporting_Manager__c=codeToId.get('EMP006')));
// EMP016 Divyansh -> EMP006
updates.add(new Employee__c(Id=codeToId.get('EMP016'), Reporting_Manager__c=codeToId.get('EMP006')));
// EMP017 Gaurav -> EMP006
updates.add(new Employee__c(Id=codeToId.get('EMP017'), Reporting_Manager__c=codeToId.get('EMP006')));
// EMP018 Piyush -> EMP006
updates.add(new Employee__c(Id=codeToId.get('EMP018'), Reporting_Manager__c=codeToId.get('EMP006')));
// EMP019 Rahul -> EMP006
updates.add(new Employee__c(Id=codeToId.get('EMP019'), Reporting_Manager__c=codeToId.get('EMP006')));
// EMP020 Vansh -> EMP018 Piyush
updates.add(new Employee__c(Id=codeToId.get('EMP020'), Reporting_Manager__c=codeToId.get('EMP018')));
// EMP021 Aayush -> EMP018
updates.add(new Employee__c(Id=codeToId.get('EMP021'), Reporting_Manager__c=codeToId.get('EMP018')));
// EMP022 Himanshu -> EMP007
updates.add(new Employee__c(Id=codeToId.get('EMP022'), Reporting_Manager__c=codeToId.get('EMP007')));
// EMP023 Manish -> EMP002
updates.add(new Employee__c(Id=codeToId.get('EMP023'), Reporting_Manager__c=codeToId.get('EMP002')));
// EMP024 Sweety -> EMP018
updates.add(new Employee__c(Id=codeToId.get('EMP024'), Reporting_Manager__c=codeToId.get('EMP018')));
// EMP025 Alka -> EMP008
updates.add(new Employee__c(Id=codeToId.get('EMP025'), Reporting_Manager__c=codeToId.get('EMP008')));
// EMP026 Bhu Garima -> EMP018
updates.add(new Employee__c(Id=codeToId.get('EMP026'), Reporting_Manager__c=codeToId.get('EMP018')));
// EMP027 Utkarsh -> EMP006
updates.add(new Employee__c(Id=codeToId.get('EMP027'), Reporting_Manager__c=codeToId.get('EMP006')));

update updates;
System.debug('Successfully updated ' + updates.size() + ' reporting manager relationships');

// Also update the old Admin User record to match EMP001 pattern
Employee__c oldAdmin = [SELECT Id FROM Employee__c WHERE Official_Email__c = 'admin@cloudsheer.com' LIMIT 1];
if (oldAdmin != null) {
    oldAdmin.Employee_Status__c = 'Inactive';
    update oldAdmin;
    System.debug('Deactivated old admin@cloudsheer.com record');
}
