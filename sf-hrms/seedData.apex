// Delete existing records to avoid duplicates if run multiple times
delete [SELECT Id FROM Leave_Request__c];
delete [SELECT Id FROM Leave_Balance__c];
delete [SELECT Id FROM Attendance_Punch__c];
delete [SELECT Id FROM Attendance__c];
delete [SELECT Id FROM Employee__c];
delete [SELECT Id FROM Leave_Type__c];

// Create Leave Type
Leave_Type__c annualLeave = new Leave_Type__c(
    Name = 'Annual Leave',
    Annual_Quota__c = 20,
    Carry_Forward_Allowed__c = true
);
insert annualLeave;

// Create Employee (Matching the mock data login)
Employee__c adminEmp = new Employee__c(
    Name = 'Admin User',
    First_Name__c = 'Admin',
    Last_Name__c = 'User',
    Official_Email__c = 'admin@cloudsheer.com',
    Employee_Code__c = 'EMP001',
    Employee_Status__c = 'Active',
    Department__c = 'IT',
    Designation__c = 'System Administrator',
    Date_of_Joining__c = Date.today().addYears(-2)
);
insert adminEmp;

// Create Leave Balance
Leave_Balance__c bal = new Leave_Balance__c(
    Employee__c = adminEmp.Id,
    Leave_Type__c = annualLeave.Id,
    Year__c = String.valueOf(Date.today().year()),
    Opening_Balance__c = 0,
    Accrued__c = 20,
    Availed__c = 2,
    Closing_Balance__c = 18
);
insert bal;

// Create Leave Request
Leave_Request__c req = new Leave_Request__c(
    Employee__c = adminEmp.Id,
    Leave_Type__c = annualLeave.Id,
    From_Date__c = Date.today().addDays(5),
    To_Date__c = Date.today().addDays(6),
    Days__c = 2,
    Reason__c = 'Family vacation',
    Status__c = 'Approved'
);
insert req;

// Create Attendance Punch
Attendance_Punch__c punchIn = new Attendance_Punch__c(
    Employee__c = adminEmp.Id,
    Punch_DateTime__c = DateTime.now().addHours(-4),
    Punch_Type__c = 'Check In',
    Source__c = 'Web'
);
insert punchIn;

System.debug('Data seeding completed successfully!');
