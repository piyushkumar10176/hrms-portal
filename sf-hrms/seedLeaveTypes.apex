List<Leave_Type__c> lts = new List<Leave_Type__c>();
lts.add(new Leave_Type__c(Name='Sick Leave', Code__c='SL', Annual_Quota__c=12, Carry_Forward_Allowed__c=false));
lts.add(new Leave_Type__c(Name='Casual Leave', Code__c='CL', Annual_Quota__c=12, Carry_Forward_Allowed__c=false));
lts.add(new Leave_Type__c(Name='Compensatory Off', Code__c='CO', Annual_Quota__c=6, Carry_Forward_Allowed__c=false));
lts.add(new Leave_Type__c(Name='Work From Home', Code__c='WFH', Annual_Quota__c=24, Carry_Forward_Allowed__c=false));

// Update existing Annual Leave
Leave_Type__c al = [SELECT Id FROM Leave_Type__c WHERE Name='Annual Leave' LIMIT 1];
al.Code__c = 'AL';
al.Annual_Quota__c = 18;
al.Carry_Forward_Allowed__c = true;
update al;

insert lts;
System.debug('Created ' + lts.size() + ' leave types + updated Annual Leave');
