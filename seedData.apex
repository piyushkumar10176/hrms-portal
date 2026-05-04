List<Employee__c> emps = [SELECT Id, Name FROM Employee__c];
Integer i = 0;
for (Employee__c emp : emps) {
    // Generate a random birthday within the next 30 days for some, and others randomly
    if (Math.mod(i, 3) == 0) {
        emp.DOB__c = Date.today().addDays(Math.mod(i, 30)).addYears(-30);
    } else {
        emp.DOB__c = Date.today().addDays(Math.mod(i, 180) + 30).addYears(-28);
    }
    i++;
}
update emps;

List<Holiday__c> holidays = new List<Holiday__c>{
    new Holiday__c(Name = 'New Year', Date__c = Date.newInstance(Date.today().year(), 1, 1), Type__c = 'National'),
    new Holiday__c(Name = 'Independence Day', Date__c = Date.newInstance(Date.today().year(), 8, 15), Type__c = 'National'),
    new Holiday__c(Name = 'Diwali', Date__c = Date.newInstance(Date.today().year(), 11, 12), Type__c = 'Festival'),
    new Holiday__c(Name = 'Christmas', Date__c = Date.newInstance(Date.today().year(), 12, 25), Type__c = 'Festival'),
    new Holiday__c(Name = 'Upcoming Holiday', Date__c = Date.today().addDays(15), Type__c = 'National')
};
insert holidays;
