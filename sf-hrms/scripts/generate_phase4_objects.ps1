# Phase 4 Salesforce Deployment Script — Payroll Restructure
$baseDir = "c:\Users\user\Downloads\Headless App\hrms\sf-hrms\force-app\main\default\objects"

function Create-Object {
    param([string]$Name, [string]$Label, [string]$PluralLabel, [string]$NameFieldLabel, [string]$NameFieldType, [string]$SharingModel)
    $objDir = "$baseDir\$Name"
    New-Item -ItemType Directory -Force -Path $objDir | Out-Null
    $content = @"
<?xml version="1.0" encoding="UTF-8"?>
<CustomObject xmlns="http://soap.sforce.com/2006/04/metadata">
    <deploymentStatus>Deployed</deploymentStatus>
    <enableActivities>true</enableActivities>
    <enableBulkApi>true</enableBulkApi>
    <enableHistory>true</enableHistory>
    <enableReports>true</enableReports>
    <enableSearch>true</enableSearch>
    <enableSharing>true</enableSharing>
    <enableStreamingApi>true</enableStreamingApi>
    <label>$Label</label>
    <nameField>
        <label>$NameFieldLabel</label>
        <type>$NameFieldType</type>
    </nameField>
    <pluralLabel>$PluralLabel</pluralLabel>
    <sharingModel>$SharingModel</sharingModel>
</CustomObject>
"@
    Set-Content -Path "$objDir\$Name.object-meta.xml" -Value $content
    New-Item -ItemType Directory -Force -Path "$objDir\fields" | Out-Null
}

function Create-Field {
    param([string]$ObjectName, [string]$FieldName, [string]$Content)
    $dir = "$baseDir\$ObjectName\fields"
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Set-Content -Path "$dir\$FieldName.field-meta.xml" -Value $Content
}

function Create-ValidationRule {
    param([string]$ObjectName, [string]$RuleName, [string]$Formula, [string]$ErrorMsg)
    $dir = "$baseDir\$ObjectName\validationRules"
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $content = @"
<?xml version="1.0" encoding="UTF-8"?>
<ValidationRule xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>$RuleName</fullName>
    <active>true</active>
    <errorConditionFormula>$Formula</errorConditionFormula>
    <errorMessage>$ErrorMsg</errorMessage>
</ValidationRule>
"@
    Set-Content -Path "$dir\$RuleName.validationRule-meta.xml" -Value $content
}

# =============================================
# 1. Salary_Structure__c
# =============================================
Create-Object "Salary_Structure__c" "Salary Structure" "Salary Structures" "Structure Name" "Text" "ReadWrite"
Create-Field "Salary_Structure__c" "Employee__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Employee__c</fullName><label>Employee</label><type>Lookup</type><referenceTo>Employee__c</referenceTo><relationshipLabel>Salary Structures</relationshipLabel><relationshipName>Salary_Structures</relationshipName></CustomField>'
Create-Field "Salary_Structure__c" "Effective_From__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Effective_From__c</fullName><label>Effective From</label><type>Date</type></CustomField>'
Create-Field "Salary_Structure__c" "Effective_To__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Effective_To__c</fullName><label>Effective To</label><type>Date</type></CustomField>'
Create-Field "Salary_Structure__c" "Total_CTC__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Total_CTC__c</fullName><label>Total CTC</label><type>Currency</type><precision>18</precision><scale>2</scale></CustomField>'
Create-Field "Salary_Structure__c" "Status__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Status__c</fullName><label>Status</label><type>Picklist</type><valueSet><valueSetDefinition><sorted>false</sorted><value><fullName>Draft</fullName><default>true</default></value><value><fullName>Active</fullName><default>false</default></value><value><fullName>Superseded</fullName><default>false</default></value></valueSetDefinition></valueSet></CustomField>'
Create-Field "Salary_Structure__c" "Approved_By__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Approved_By__c</fullName><label>Approved By</label><type>Lookup</type><referenceTo>Employee__c</referenceTo><relationshipLabel>Approved Structures</relationshipLabel><relationshipName>Approved_Structures</relationshipName></CustomField>'
Create-Field "Salary_Structure__c" "Approved_On__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Approved_On__c</fullName><label>Approved On</label><type>Date</type></CustomField>'

# =============================================
# 2. Salary_Structure_Line__c
# =============================================
Create-Object "Salary_Structure_Line__c" "Salary Structure Line" "Salary Structure Lines" "Line No" "AutoNumber" "ControlledByParent"
Create-Field "Salary_Structure_Line__c" "Salary_Structure__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Salary_Structure__c</fullName><label>Salary Structure</label><type>MasterDetail</type><referenceTo>Salary_Structure__c</referenceTo><relationshipLabel>Lines</relationshipLabel><relationshipName>Lines</relationshipName><writeRequiresMasterRead>false</writeRequiresMasterRead><reparentableMasterDetail>false</reparentableMasterDetail></CustomField>'
Create-Field "Salary_Structure_Line__c" "Component__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Component__c</fullName><label>Component</label><type>Lookup</type><referenceTo>Salary_Component__c</referenceTo><relationshipLabel>Structure Lines</relationshipLabel><relationshipName>Structure_Lines</relationshipName></CustomField>'
Create-Field "Salary_Structure_Line__c" "Amount_Monthly__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Amount_Monthly__c</fullName><label>Amount (Monthly)</label><type>Currency</type><precision>18</precision><scale>2</scale></CustomField>'
Create-Field "Salary_Structure_Line__c" "Amount_Annual__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Amount_Annual__c</fullName><label>Amount (Annual)</label><type>Currency</type><precision>18</precision><scale>2</scale></CustomField>'
Create-Field "Salary_Structure_Line__c" "Percentage__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Percentage__c</fullName><label>Percentage</label><type>Percent</type><precision>5</precision><scale>2</scale></CustomField>'

Create-ValidationRule "Salary_Structure_Line__c" "Amount_Non_Negative" "Amount_Monthly__c &lt; 0" "Monthly amount cannot be negative."

# =============================================
# 3. Payslip_Line__c (M-D Payslip__c)
# =============================================
Create-Object "Payslip_Line__c" "Payslip Line" "Payslip Lines" "Line No" "AutoNumber" "ControlledByParent"
Create-Field "Payslip_Line__c" "Payslip__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Payslip__c</fullName><label>Payslip</label><type>MasterDetail</type><referenceTo>Payslip__c</referenceTo><relationshipLabel>Lines</relationshipLabel><relationshipName>Lines</relationshipName><writeRequiresMasterRead>false</writeRequiresMasterRead><reparentableMasterDetail>false</reparentableMasterDetail></CustomField>'
Create-Field "Payslip_Line__c" "Component__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Component__c</fullName><label>Component</label><type>Lookup</type><referenceTo>Salary_Component__c</referenceTo><relationshipLabel>Payslip Lines</relationshipLabel><relationshipName>Payslip_Lines</relationshipName></CustomField>'
Create-Field "Payslip_Line__c" "Component_Type__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Component_Type__c</fullName><label>Component Type</label><type>Picklist</type><valueSet><valueSetDefinition><sorted>false</sorted><value><fullName>Earning</fullName><default>true</default></value><value><fullName>Deduction</fullName><default>false</default></value></valueSetDefinition></valueSet></CustomField>'
Create-Field "Payslip_Line__c" "Amount__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Amount__c</fullName><label>Amount</label><type>Currency</type><precision>18</precision><scale>2</scale></CustomField>'

# =============================================
# 4. Loan__c
# =============================================
Create-Object "Loan__c" "Loan" "Loans" "Loan Name" "Text" "ReadWrite"
Create-Field "Loan__c" "Employee__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Employee__c</fullName><label>Employee</label><type>Lookup</type><referenceTo>Employee__c</referenceTo><relationshipLabel>Loans</relationshipLabel><relationshipName>Loans</relationshipName></CustomField>'
Create-Field "Loan__c" "Type__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Type__c</fullName><label>Loan Type</label><type>Picklist</type><valueSet><valueSetDefinition><sorted>false</sorted><value><fullName>Salary Advance</fullName><default>false</default></value><value><fullName>Personal</fullName><default>false</default></value><value><fullName>Education</fullName><default>false</default></value></valueSetDefinition></valueSet></CustomField>'
Create-Field "Loan__c" "Principal__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Principal__c</fullName><label>Principal</label><type>Currency</type><precision>18</precision><scale>2</scale></CustomField>'
Create-Field "Loan__c" "Interest_Rate__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Interest_Rate__c</fullName><label>Interest Rate</label><type>Percent</type><precision>5</precision><scale>2</scale></CustomField>'
Create-Field "Loan__c" "Tenure_Months__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Tenure_Months__c</fullName><label>Tenure (Months)</label><type>Number</type><precision>3</precision><scale>0</scale></CustomField>'
Create-Field "Loan__c" "EMI__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>EMI__c</fullName><label>EMI</label><type>Currency</type><precision>18</precision><scale>2</scale></CustomField>'
Create-Field "Loan__c" "Outstanding__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Outstanding__c</fullName><label>Outstanding</label><type>Currency</type><precision>18</precision><scale>2</scale></CustomField>'
Create-Field "Loan__c" "Start_Date__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Start_Date__c</fullName><label>Start Date</label><type>Date</type></CustomField>'
Create-Field "Loan__c" "End_Date__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>End_Date__c</fullName><label>End Date</label><type>Date</type></CustomField>'
Create-Field "Loan__c" "Status__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Status__c</fullName><label>Status</label><type>Picklist</type><valueSet><valueSetDefinition><sorted>false</sorted><value><fullName>Active</fullName><default>true</default></value><value><fullName>Closed</fullName><default>false</default></value><value><fullName>Defaulted</fullName><default>false</default></value></valueSetDefinition></valueSet></CustomField>'

Create-ValidationRule "Loan__c" "Outstanding_LE_Principal" "Outstanding__c &gt; Principal__c" "Outstanding amount cannot exceed principal."

# =============================================
# 5. Loan_Repayment__c (M-D Loan__c)
# =============================================
Create-Object "Loan_Repayment__c" "Loan Repayment" "Loan Repayments" "Repayment No" "AutoNumber" "ControlledByParent"
Create-Field "Loan_Repayment__c" "Loan__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Loan__c</fullName><label>Loan</label><type>MasterDetail</type><referenceTo>Loan__c</referenceTo><relationshipLabel>Repayments</relationshipLabel><relationshipName>Repayments</relationshipName><writeRequiresMasterRead>false</writeRequiresMasterRead><reparentableMasterDetail>false</reparentableMasterDetail></CustomField>'
Create-Field "Loan_Repayment__c" "Payroll_Cycle__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Payroll_Cycle__c</fullName><label>Payroll Cycle</label><type>Lookup</type><referenceTo>Payroll_Cycle__c</referenceTo><relationshipLabel>Loan Repayments</relationshipLabel><relationshipName>Loan_Repayments</relationshipName></CustomField>'
Create-Field "Loan_Repayment__c" "Amount__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Amount__c</fullName><label>Amount</label><type>Currency</type><precision>18</precision><scale>2</scale></CustomField>'
Create-Field "Loan_Repayment__c" "Date__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Date__c</fullName><label>Date</label><type>Date</type></CustomField>'

# =============================================
# 6. Reimbursement__c
# =============================================
Create-Object "Reimbursement__c" "Reimbursement" "Reimbursements" "Reimbursement Name" "Text" "ReadWrite"
Create-Field "Reimbursement__c" "Employee__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Employee__c</fullName><label>Employee</label><type>Lookup</type><referenceTo>Employee__c</referenceTo><relationshipLabel>Reimbursements</relationshipLabel><relationshipName>Reimbursements</relationshipName></CustomField>'
Create-Field "Reimbursement__c" "Component__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Component__c</fullName><label>Component</label><type>Lookup</type><referenceTo>Salary_Component__c</referenceTo><relationshipLabel>Reimbursements</relationshipLabel><relationshipName>Reimbursements</relationshipName></CustomField>'
Create-Field "Reimbursement__c" "Amount_Claimed__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Amount_Claimed__c</fullName><label>Amount Claimed</label><type>Currency</type><precision>18</precision><scale>2</scale></CustomField>'
Create-Field "Reimbursement__c" "Amount_Approved__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Amount_Approved__c</fullName><label>Amount Approved</label><type>Currency</type><precision>18</precision><scale>2</scale></CustomField>'
Create-Field "Reimbursement__c" "Cycle__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Cycle__c</fullName><label>Payroll Cycle</label><type>Lookup</type><referenceTo>Payroll_Cycle__c</referenceTo><relationshipLabel>Reimbursements</relationshipLabel><relationshipName>Reimbursements</relationshipName></CustomField>'
Create-Field "Reimbursement__c" "Status__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Status__c</fullName><label>Status</label><type>Picklist</type><valueSet><valueSetDefinition><sorted>false</sorted><value><fullName>Submitted</fullName><default>true</default></value><value><fullName>Approved</fullName><default>false</default></value><value><fullName>Rejected</fullName><default>false</default></value><value><fullName>Paid</fullName><default>false</default></value></valueSetDefinition></valueSet></CustomField>'

# =============================================
# 7. Payroll_Cycle__c enhancements
# =============================================
Create-Field "Payroll_Cycle__c" "Cut_Off_Date__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Cut_Off_Date__c</fullName><label>Cut Off Date</label><type>Date</type></CustomField>'
Create-Field "Payroll_Cycle__c" "Pay_Date__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Pay_Date__c</fullName><label>Pay Date</label><type>Date</type></CustomField>'
Create-Field "Payroll_Cycle__c" "Locked__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Locked__c</fullName><label>Locked</label><type>Checkbox</type><defaultValue>false</defaultValue></CustomField>'
Create-Field "Payroll_Cycle__c" "Processed_By__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Processed_By__c</fullName><label>Processed By</label><type>Lookup</type><referenceTo>Employee__c</referenceTo><relationshipLabel>Processed Cycles</relationshipLabel><relationshipName>Processed_Cycles</relationshipName></CustomField>'

# =============================================
# 8. Payslip__c enhancements
# =============================================
Create-Field "Payslip__c" "Status__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Status__c</fullName><label>Status</label><type>Picklist</type><valueSet><valueSetDefinition><sorted>false</sorted><value><fullName>Draft</fullName><default>true</default></value><value><fullName>Generated</fullName><default>false</default></value><value><fullName>Approved</fullName><default>false</default></value><value><fullName>Paid</fullName><default>false</default></value></valueSetDefinition></valueSet></CustomField>'

# =============================================
# 9. Salary_Component__c enhancements
# =============================================
Create-Field "Salary_Component__c" "Statutory_Type__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Statutory_Type__c</fullName><label>Statutory Type</label><type>Picklist</type><valueSet><valueSetDefinition><sorted>false</sorted><value><fullName>None</fullName><default>true</default></value><value><fullName>PF</fullName><default>false</default></value><value><fullName>ESI</fullName><default>false</default></value><value><fullName>PT</fullName><default>false</default></value><value><fullName>TDS</fullName><default>false</default></value></valueSetDefinition></valueSet></CustomField>'
Create-Field "Salary_Component__c" "Active__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Active__c</fullName><label>Active</label><type>Checkbox</type><defaultValue>true</defaultValue></CustomField>'

# =============================================
# 10. Tax_Declaration__c enhancements
# =============================================
Create-Field "Tax_Declaration__c" "Section_80CCD__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Section_80CCD__c</fullName><label>Section 80CCD (NPS)</label><type>Currency</type><precision>18</precision><scale>2</scale></CustomField>'
Create-Field "Tax_Declaration__c" "Section_80E__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Section_80E__c</fullName><label>Section 80E (Education Loan)</label><type>Currency</type><precision>18</precision><scale>2</scale></CustomField>'
Create-Field "Tax_Declaration__c" "Section_80EEA__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Section_80EEA__c</fullName><label>Section 80EEA (First Home)</label><type>Currency</type><precision>18</precision><scale>2</scale></CustomField>'

Write-Host "Phase 4 metadata generation complete."
