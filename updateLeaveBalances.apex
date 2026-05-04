List<Leave_Balance__c> lst = [SELECT Id, Year__c, Accrued__c, Availed__c FROM Leave_Balance__c];
for(Leave_Balance__c lb : lst) {
    lb.Year__c = String.valueOf(Date.today().year());
    if(lb.Accrued__c == null) lb.Accrued__c = 0;
    if(lb.Availed__c == null) lb.Availed__c = 0;
}
update lst;
