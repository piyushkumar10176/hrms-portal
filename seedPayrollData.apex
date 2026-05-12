// === Seed Salary Components ===
List<Salary_Component__c> comps = new List<Salary_Component__c>();
comps.add(new Salary_Component__c(Name='Basic Pay', Component_Type__c='Earning', Is_Taxable__c=true, Is_Statutory__c=false, Calculation_Type__c='Percentage_of_CTC', Default_Percentage__c=40, Display_Order__c=1));
comps.add(new Salary_Component__c(Name='HRA', Component_Type__c='Earning', Is_Taxable__c=true, Is_Statutory__c=false, Calculation_Type__c='Percentage_of_Basic', Default_Percentage__c=50, Display_Order__c=2));
comps.add(new Salary_Component__c(Name='Conveyance Allowance', Component_Type__c='Earning', Is_Taxable__c=false, Is_Statutory__c=false, Calculation_Type__c='Fixed', Display_Order__c=3));
comps.add(new Salary_Component__c(Name='Medical Allowance', Component_Type__c='Earning', Is_Taxable__c=false, Is_Statutory__c=false, Calculation_Type__c='Fixed', Display_Order__c=4));
comps.add(new Salary_Component__c(Name='Special Allowance', Component_Type__c='Earning', Is_Taxable__c=true, Is_Statutory__c=false, Calculation_Type__c='Fixed', Display_Order__c=5));
comps.add(new Salary_Component__c(Name='LTA', Component_Type__c='Earning', Is_Taxable__c=false, Is_Statutory__c=false, Calculation_Type__c='Fixed', Display_Order__c=6));
comps.add(new Salary_Component__c(Name='EPF (Employee)', Component_Type__c='Deduction', Is_Taxable__c=false, Is_Statutory__c=true, Calculation_Type__c='Percentage_of_Basic', Default_Percentage__c=12, Display_Order__c=7));
comps.add(new Salary_Component__c(Name='ESI', Component_Type__c='Deduction', Is_Taxable__c=false, Is_Statutory__c=true, Calculation_Type__c='Percentage_of_CTC', Default_Percentage__c=0.75, Display_Order__c=8));
comps.add(new Salary_Component__c(Name='Professional Tax', Component_Type__c='Deduction', Is_Taxable__c=false, Is_Statutory__c=true, Calculation_Type__c='Fixed', Display_Order__c=9));
comps.add(new Salary_Component__c(Name='TDS', Component_Type__c='Deduction', Is_Taxable__c=false, Is_Statutory__c=true, Calculation_Type__c='Fixed', Display_Order__c=10));
insert comps;

// === Seed Employee Salary Structures (CTC = 9,24,000/yr = 77,000/month) ===
List<Employee__c> emps = [SELECT Id, Name FROM Employee__c WHERE Employee_Status__c = 'Active'];
Map<String, Salary_Component__c> compMap = new Map<String, Salary_Component__c>();
for (Salary_Component__c c : [SELECT Id, Name FROM Salary_Component__c]) {
    compMap.put(c.Name, c);
}

List<Employee_Salary_Structure__c> structures = new List<Employee_Salary_Structure__c>();
for (Employee__c emp : emps) {
    Decimal ctc = 924000;
    Decimal basic = ctc * 0.40;
    Decimal hra = basic * 0.50;
    Decimal conv = 1600 * 12;
    Decimal med = 1250 * 12;
    Decimal lta = 20000;
    Decimal special = ctc - basic - hra - conv - med - lta;
    Decimal epf = basic * 0.12;
    Decimal profTax = 200 * 12;

    structures.add(new Employee_Salary_Structure__c(Employee__c=emp.Id, Salary_Component__c=compMap.get('Basic Pay').Id, Monthly_Amount__c=basic/12, Annual_Amount__c=basic, CTC__c=ctc, Effective_Date__c=Date.newInstance(2026,4,1)));
    structures.add(new Employee_Salary_Structure__c(Employee__c=emp.Id, Salary_Component__c=compMap.get('HRA').Id, Monthly_Amount__c=hra/12, Annual_Amount__c=hra, CTC__c=ctc, Effective_Date__c=Date.newInstance(2026,4,1)));
    structures.add(new Employee_Salary_Structure__c(Employee__c=emp.Id, Salary_Component__c=compMap.get('Conveyance Allowance').Id, Monthly_Amount__c=1600, Annual_Amount__c=conv, CTC__c=ctc, Effective_Date__c=Date.newInstance(2026,4,1)));
    structures.add(new Employee_Salary_Structure__c(Employee__c=emp.Id, Salary_Component__c=compMap.get('Medical Allowance').Id, Monthly_Amount__c=1250, Annual_Amount__c=med, CTC__c=ctc, Effective_Date__c=Date.newInstance(2026,4,1)));
    structures.add(new Employee_Salary_Structure__c(Employee__c=emp.Id, Salary_Component__c=compMap.get('Special Allowance').Id, Monthly_Amount__c=special/12, Annual_Amount__c=special, CTC__c=ctc, Effective_Date__c=Date.newInstance(2026,4,1)));
    structures.add(new Employee_Salary_Structure__c(Employee__c=emp.Id, Salary_Component__c=compMap.get('EPF (Employee)').Id, Monthly_Amount__c=epf/12, Annual_Amount__c=epf, CTC__c=ctc, Effective_Date__c=Date.newInstance(2026,4,1)));
    structures.add(new Employee_Salary_Structure__c(Employee__c=emp.Id, Salary_Component__c=compMap.get('Professional Tax').Id, Monthly_Amount__c=200, Annual_Amount__c=profTax, CTC__c=ctc, Effective_Date__c=Date.newInstance(2026,4,1)));
}
insert structures;

// === Seed Payroll Cycle ===
insert new Payroll_Cycle__c(Name='May 2026', Month__c='May', Year__c=2026, Start_Date__c=Date.newInstance(2026,5,1), End_Date__c=Date.newInstance(2026,5,31), Status__c='Draft', Total_Employees__c=emps.size());

// === Seed Tax Declarations ===
List<Tax_Declaration__c> decls = new List<Tax_Declaration__c>();
for (Employee__c emp : emps) {
    decls.add(new Tax_Declaration__c(
        Employee__c = emp.Id,
        Financial_Year__c = '2026-2027',
        Tax_Regime__c = 'Old Regime',
        Section_80C__c = 150000,
        Section_80D__c = 25000,
        HRA_Rent_Paid__c = 180000,
        Status__c = 'Draft'
    ));
}
insert decls;

System.debug('Seeded ' + comps.size() + ' components, ' + structures.size() + ' structures, ' + decls.size() + ' tax declarations');
