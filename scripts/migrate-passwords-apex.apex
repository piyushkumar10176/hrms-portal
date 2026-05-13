// Auto-generated password migration script
String hashAdmin = '$2b$10$/uEIOtu0UevzbttpqowHfepNsQnM3kqXlP8wGJFihNDoqGsKVYntS';
String hashEmp123 = '$2b$10$AAVEH0ff964fyXVwHwrWSeyAbUbvW8tb6wjWBVA0dkhvoYMqayAx2';
String hashPiyush = '$2b$10$teilFbjx955baNOldB5pNuCO6CPFSG.FwGDMoJmcdhBYAEEWvu35S';

List<Employee__c> emps = [SELECT Id, Official_Email__c FROM Employee__c WHERE Employee_Status__c = 'Active'];
for (Employee__c emp : emps) {
    if (emp.Official_Email__c == 'emp001@test.com') {
        emp.Password_Hash__c = hashAdmin;
    } else if (emp.Official_Email__c == 'piyush.kumar@cloudsheer.com') {
        emp.Password_Hash__c = hashPiyush;
    } else {
        emp.Password_Hash__c = hashEmp123;
    }
}
update emps;
System.debug('Migrated passwords for ' + emps.size() + ' employees');
