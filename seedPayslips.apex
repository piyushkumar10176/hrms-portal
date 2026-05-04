List<Employee__c> emps = [SELECT Id, Name FROM Employee__c];
List<Payslip__c> slips = new List<Payslip__c>();

String[] months = new String[]{'April 2026', 'March 2026', 'February 2026'};

for (Employee__c emp : emps) {
    for (Integer i = 0; i < 3; i++) {
        Decimal basic = 45000;
        Decimal hra = 18000;
        Decimal conveyance = 2500;
        Decimal medical = 1500;
        Decimal special = 10000;
        Decimal pf = 1800;
        Decimal esi = 0;
        Decimal profTax = 200;
        Decimal tds = 2500;
        Decimal netPay = (basic + hra + conveyance + medical + special) - (pf + esi + profTax + tds);

        slips.add(new Payslip__c(
            Employee__c = emp.Id,
            Month__c = months[i],
            Basic__c = basic,
            HRA__c = hra,
            Conveyance__c = conveyance,
            Medical__c = medical,
            Special__c = special,
            PF__c = pf,
            ESI__c = esi,
            Professional_Tax__c = profTax,
            TDS__c = tds,
            Net_Pay__c = netPay,
            Status__c = 'Paid',
            Paid_On__c = Date.today().addDays(- (i * 30))
        ));
    }
}
insert slips;
