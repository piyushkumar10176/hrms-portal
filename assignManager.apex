Employee__c manager = [SELECT Id FROM Employee__c WHERE Official_Email__c = 'piyush.kumar@cloudsheer.com' LIMIT 1];
List<Employee__c> reports = [SELECT Id FROM Employee__c WHERE Id != :manager.Id LIMIT 10];
for(Employee__c e : reports) {
    e.Reporting_Manager__c = manager.Id;
}
update reports;
System.debug('Assigned manager to ' + reports.size() + ' employees.');
