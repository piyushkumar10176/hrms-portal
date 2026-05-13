// Phase 1 Backfill v2: Create Department__c and Designation__c records
// from existing Employee__c text field values, then link via lookup
// Uses targeted DML to avoid triggering validation rules on unrelated fields

// === STEP 1: Create Department records ===
Map<String, Id> deptMap = new Map<String, Id>();
List<String> deptNames = new List<String>{
    'Technical Delivery', 'Growth & Marketing', 'HR', 'QA',
    'Engineering', 'Operations', 'Executive'
};
Map<String, String> deptCodes = new Map<String, String>{
    'Technical Delivery' => 'TD',
    'Growth & Marketing' => 'GM',
    'HR' => 'HR',
    'QA' => 'QA',
    'Engineering' => 'ENG',
    'Operations' => 'OPS',
    'Executive' => 'EXEC'
};

List<Department__c> depts = new List<Department__c>();
for (String dName : deptNames) {
    depts.add(new Department__c(
        Name = dName,
        Code__c = deptCodes.get(dName),
        Status__c = 'Active'
    ));
}
insert depts;
for (Department__c d : depts) {
    deptMap.put(d.Name, d.Id);
}
System.debug('Created ' + depts.size() + ' departments');

// === STEP 2: Create Designation records ===
Map<String, Id> desigMap = new Map<String, Id>();
List<String> desigNames = new List<String>{
    'CEO', 'Technical Delivery Head', 'Growth & Marketing - Head',
    'Head of Operations', 'Assistant Manager HR', 'HR Associate',
    'Project Manager', 'Salesforce Consultant', 'Salesforce Developer',
    'Associate Salesforce Developer', 'BA - Salesforce',
    'Team Lead - QA', 'QA', 'Strategy & Growth - Associate'
};
Map<String, String> desigToDept = new Map<String, String>{
    'CEO' => 'Executive',
    'Technical Delivery Head' => 'Technical Delivery',
    'Growth & Marketing - Head' => 'Growth & Marketing',
    'Head of Operations' => 'Operations',
    'Assistant Manager HR' => 'HR',
    'HR Associate' => 'HR',
    'Project Manager' => 'Technical Delivery',
    'Salesforce Consultant' => 'Technical Delivery',
    'Salesforce Developer' => 'Technical Delivery',
    'Associate Salesforce Developer' => 'Technical Delivery',
    'BA - Salesforce' => 'Technical Delivery',
    'Team Lead - QA' => 'QA',
    'QA' => 'QA',
    'Strategy & Growth - Associate' => 'Growth & Marketing'
};
Map<String, Integer> desigGrades = new Map<String, Integer>{
    'CEO' => 15,
    'Technical Delivery Head' => 12,
    'Growth & Marketing - Head' => 12,
    'Head of Operations' => 12,
    'Assistant Manager HR' => 8,
    'HR Associate' => 4,
    'Project Manager' => 10,
    'Salesforce Consultant' => 7,
    'Salesforce Developer' => 5,
    'Associate Salesforce Developer' => 3,
    'BA - Salesforce' => 5,
    'Team Lead - QA' => 8,
    'QA' => 4,
    'Strategy & Growth - Associate' => 4
};

List<Designation__c> desigs = new List<Designation__c>();
for (String dName : desigNames) {
    String parentDept = desigToDept.get(dName);
    desigs.add(new Designation__c(
        Name = dName,
        Status__c = 'Active',
        Grade__c = desigGrades.get(dName),
        Department__c = parentDept != null ? deptMap.get(parentDept) : null
    ));
}
insert desigs;
for (Designation__c d : desigs) {
    desigMap.put(d.Name, d.Id);
}
System.debug('Created ' + desigs.size() + ' designations');

// === STEP 3: Backfill Employee lookups (only update lookup fields) ===
List<Employee__c> emps = [
    SELECT Id, Department__c, Designation__c
    FROM Employee__c
];
List<Employee__c> toUpdate = new List<Employee__c>();
for (Employee__c emp : emps) {
    Employee__c stub = new Employee__c(Id = emp.Id);
    Boolean changed = false;
    if (emp.Department__c != null && deptMap.containsKey(emp.Department__c)) {
        stub.Department_Ref__c = deptMap.get(emp.Department__c);
        changed = true;
    }
    if (emp.Designation__c != null && desigMap.containsKey(emp.Designation__c)) {
        stub.Designation_Ref__c = desigMap.get(emp.Designation__c);
        changed = true;
    }
    if (changed) toUpdate.add(stub);
}
// Use Database.update with allOrNone=false to skip validation errors on individual records
Database.SaveResult[] results = Database.update(toUpdate, false);
Integer success = 0;
Integer fail = 0;
for (Database.SaveResult sr : results) {
    if (sr.isSuccess()) success++;
    else {
        fail++;
        System.debug('Failed: ' + sr.getId() + ' - ' + sr.getErrors()[0].getMessage());
    }
}
System.debug('Linked ' + success + ' employees, ' + fail + ' failed');
