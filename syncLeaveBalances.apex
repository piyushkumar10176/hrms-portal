List<Leave_Balance__c> balances = [SELECT Id, Leave_Type__c, Leave_Type__r.Annual_Quota__c FROM Leave_Balance__c];
for (Leave_Balance__c lb : balances) {
    if (lb.Leave_Type__r.Annual_Quota__c != null) {
        lb.Accrued__c = lb.Leave_Type__r.Annual_Quota__c;
    }
}
update balances;
System.debug('Updated ' + balances.size() + ' leave balances to match annual quotas.');
