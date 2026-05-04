List<Employee__c> employees = [SELECT Id FROM Employee__c WHERE Employee_Status__c = 'Active'];
List<Leave_Type__c> leaveTypes = [SELECT Id, Name, Annual_Quota__c FROM Leave_Type__c];
List<Leave_Balance__c> newBalances = new List<Leave_Balance__c>();

// If no Leave Types exist, create them first
if (leaveTypes.isEmpty()) {
    Leave_Type__c annual = new Leave_Type__c(Name = 'Annual Leave', Code__c = 'AL', Annual_Quota__c = 20, Carry_Forward_Allowed__c = true);
    Leave_Type__c sick = new Leave_Type__c(Name = 'Sick Leave', Code__c = 'SL', Annual_Quota__c = 10, Carry_Forward_Allowed__c = false);
    Leave_Type__c casual = new Leave_Type__c(Name = 'Casual Leave', Code__c = 'CL', Annual_Quota__c = 5, Carry_Forward_Allowed__c = false);
    insert new List<Leave_Type__c>{annual, sick, casual};
    leaveTypes = [SELECT Id, Name, Annual_Quota__c FROM Leave_Type__c];
}

for (Employee__c emp : employees) {
    // Check if balance exists
    List<Leave_Balance__c> existing = [SELECT Id FROM Leave_Balance__c WHERE Employee__c = :emp.Id];
    if (existing.isEmpty()) {
        for (Leave_Type__c lt : leaveTypes) {
            newBalances.add(new Leave_Balance__c(
                Employee__c = emp.Id,
                Leave_Type__c = lt.Id,
                Opening_Balance__c = lt.Annual_Quota__c,
                Availed__c = 0
            ));
        }
    }
}

if (!newBalances.isEmpty()) {
    insert newBalances;
    System.debug('Created ' + newBalances.size() + ' new leave balances.');
} else {
    System.debug('No new leave balances needed.');
}
