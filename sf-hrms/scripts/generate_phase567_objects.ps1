# Phase 5-7 Salesforce Deployment Script
# Phase 5: Expense | Phase 6: Offboarding + Assets | Phase 7: Audit
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
# PHASE 5 — Expense
# =============================================

# Expense_Report__c
Create-Object "Expense_Report__c" "Expense Report" "Expense Reports" "Report No" "AutoNumber" "ReadWrite"
Create-Field "Expense_Report__c" "Employee__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Employee__c</fullName><label>Employee</label><type>Lookup</type><referenceTo>Employee__c</referenceTo><relationshipLabel>Expense Reports</relationshipLabel><relationshipName>Expense_Reports</relationshipName></CustomField>'
Create-Field "Expense_Report__c" "Title__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Title__c</fullName><label>Title</label><type>Text</type><length>255</length></CustomField>'
Create-Field "Expense_Report__c" "Total_Amount__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Total_Amount__c</fullName><label>Total Amount</label><type>Currency</type><precision>18</precision><scale>2</scale></CustomField>'
Create-Field "Expense_Report__c" "Status__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Status__c</fullName><label>Status</label><type>Picklist</type><valueSet><valueSetDefinition><sorted>false</sorted><value><fullName>Draft</fullName><default>true</default></value><value><fullName>Submitted</fullName><default>false</default></value><value><fullName>Approved</fullName><default>false</default></value><value><fullName>Rejected</fullName><default>false</default></value><value><fullName>Paid</fullName><default>false</default></value></valueSetDefinition></valueSet></CustomField>'
Create-Field "Expense_Report__c" "Submitted_On__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Submitted_On__c</fullName><label>Submitted On</label><type>Date</type></CustomField>'
Create-Field "Expense_Report__c" "Approver__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Approver__c</fullName><label>Approver</label><type>Lookup</type><referenceTo>Employee__c</referenceTo><relationshipLabel>Expense Approvals</relationshipLabel><relationshipName>Expense_Approvals</relationshipName></CustomField>'
Create-Field "Expense_Report__c" "Notes__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Notes__c</fullName><label>Notes</label><type>LongTextArea</type><length>32768</length><visibleLines>3</visibleLines></CustomField>'

# Expense_Line__c (M-D Expense_Report)
Create-Object "Expense_Line__c" "Expense Line" "Expense Lines" "Line No" "AutoNumber" "ControlledByParent"
Create-Field "Expense_Line__c" "Expense_Report__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Expense_Report__c</fullName><label>Expense Report</label><type>MasterDetail</type><referenceTo>Expense_Report__c</referenceTo><relationshipLabel>Lines</relationshipLabel><relationshipName>Lines</relationshipName><writeRequiresMasterRead>false</writeRequiresMasterRead><reparentableMasterDetail>false</reparentableMasterDetail></CustomField>'
Create-Field "Expense_Line__c" "Category__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Category__c</fullName><label>Category</label><type>Picklist</type><valueSet><valueSetDefinition><sorted>false</sorted><value><fullName>Travel</fullName><default>false</default></value><value><fullName>Food</fullName><default>false</default></value><value><fullName>Accommodation</fullName><default>false</default></value><value><fullName>Communication</fullName><default>false</default></value><value><fullName>Office Supplies</fullName><default>false</default></value><value><fullName>Other</fullName><default>false</default></value></valueSetDefinition></valueSet></CustomField>'
Create-Field "Expense_Line__c" "Description__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Description__c</fullName><label>Description</label><type>Text</type><length>255</length></CustomField>'
Create-Field "Expense_Line__c" "Amount__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Amount__c</fullName><label>Amount</label><type>Currency</type><precision>18</precision><scale>2</scale></CustomField>'
Create-Field "Expense_Line__c" "Date__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Date__c</fullName><label>Date</label><type>Date</type></CustomField>'
Create-Field "Expense_Line__c" "Receipt_URL__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Receipt_URL__c</fullName><label>Receipt URL</label><type>Url</type></CustomField>'

Create-ValidationRule "Expense_Line__c" "Amount_Positive" "Amount__c &lt;= 0" "Expense amount must be greater than zero."

# =============================================
# PHASE 6 — Offboarding + Assets
# =============================================

# Separation__c (offboarding/exit)
Create-Object "Separation__c" "Separation" "Separations" "Separation No" "AutoNumber" "ReadWrite"
Create-Field "Separation__c" "Employee__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Employee__c</fullName><label>Employee</label><type>Lookup</type><referenceTo>Employee__c</referenceTo><relationshipLabel>Separations</relationshipLabel><relationshipName>Separations</relationshipName></CustomField>'
Create-Field "Separation__c" "Type__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Type__c</fullName><label>Separation Type</label><type>Picklist</type><valueSet><valueSetDefinition><sorted>false</sorted><value><fullName>Resignation</fullName><default>false</default></value><value><fullName>Termination</fullName><default>false</default></value><value><fullName>Retirement</fullName><default>false</default></value><value><fullName>Contract End</fullName><default>false</default></value></valueSetDefinition></valueSet></CustomField>'
Create-Field "Separation__c" "Notice_Date__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Notice_Date__c</fullName><label>Notice Date</label><type>Date</type></CustomField>'
Create-Field "Separation__c" "Last_Working_Date__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Last_Working_Date__c</fullName><label>Last Working Date</label><type>Date</type></CustomField>'
Create-Field "Separation__c" "Reason__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Reason__c</fullName><label>Reason</label><type>LongTextArea</type><length>32768</length><visibleLines>3</visibleLines></CustomField>'
Create-Field "Separation__c" "Status__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Status__c</fullName><label>Status</label><type>Picklist</type><valueSet><valueSetDefinition><sorted>false</sorted><value><fullName>Initiated</fullName><default>true</default></value><value><fullName>Notice Period</fullName><default>false</default></value><value><fullName>Clearance Pending</fullName><default>false</default></value><value><fullName>Completed</fullName><default>false</default></value></valueSetDefinition></valueSet></CustomField>'
Create-Field "Separation__c" "Exit_Interview_Done__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Exit_Interview_Done__c</fullName><label>Exit Interview Done</label><type>Checkbox</type><defaultValue>false</defaultValue></CustomField>'
Create-Field "Separation__c" "FnF_Amount__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>FnF_Amount__c</fullName><label>F&amp;F Amount</label><type>Currency</type><precision>18</precision><scale>2</scale></CustomField>'

# Asset__c
Create-Object "Asset__c" "Company Asset" "Company Assets" "Asset Name" "Text" "ReadWrite"
Create-Field "Asset__c" "Asset_Tag__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Asset_Tag__c</fullName><label>Asset Tag</label><type>Text</type><length>50</length><externalId>true</externalId><unique>true</unique></CustomField>'
Create-Field "Asset__c" "Type__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Type__c</fullName><label>Type</label><type>Picklist</type><valueSet><valueSetDefinition><sorted>false</sorted><value><fullName>Laptop</fullName><default>false</default></value><value><fullName>Mobile</fullName><default>false</default></value><value><fullName>Monitor</fullName><default>false</default></value><value><fullName>Access Card</fullName><default>false</default></value><value><fullName>Headset</fullName><default>false</default></value><value><fullName>Other</fullName><default>false</default></value></valueSetDefinition></valueSet></CustomField>'
Create-Field "Asset__c" "Assigned_To__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Assigned_To__c</fullName><label>Assigned To</label><type>Lookup</type><referenceTo>Employee__c</referenceTo><relationshipLabel>Company Assets</relationshipLabel><relationshipName>Company_Assets</relationshipName></CustomField>'
Create-Field "Asset__c" "Status__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Status__c</fullName><label>Status</label><type>Picklist</type><valueSet><valueSetDefinition><sorted>false</sorted><value><fullName>Available</fullName><default>true</default></value><value><fullName>Assigned</fullName><default>false</default></value><value><fullName>Under Repair</fullName><default>false</default></value><value><fullName>Retired</fullName><default>false</default></value></valueSetDefinition></valueSet></CustomField>'
Create-Field "Asset__c" "Purchase_Date__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Purchase_Date__c</fullName><label>Purchase Date</label><type>Date</type></CustomField>'
Create-Field "Asset__c" "Purchase_Value__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Purchase_Value__c</fullName><label>Purchase Value</label><type>Currency</type><precision>18</precision><scale>2</scale></CustomField>'
Create-Field "Asset__c" "Serial_Number__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Serial_Number__c</fullName><label>Serial Number</label><type>Text</type><length>100</length></CustomField>'

# =============================================
# PHASE 7 — Audit Trail
# =============================================

# Audit_Log__c
Create-Object "Audit_Log__c" "Audit Log" "Audit Logs" "Log No" "AutoNumber" "ReadWrite"
Create-Field "Audit_Log__c" "Employee__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Employee__c</fullName><label>Employee</label><type>Lookup</type><referenceTo>Employee__c</referenceTo><relationshipLabel>Audit Logs</relationshipLabel><relationshipName>Audit_Logs</relationshipName></CustomField>'
Create-Field "Audit_Log__c" "Action__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Action__c</fullName><label>Action</label><type>Picklist</type><valueSet><valueSetDefinition><sorted>false</sorted><value><fullName>Create</fullName><default>false</default></value><value><fullName>Update</fullName><default>false</default></value><value><fullName>Delete</fullName><default>false</default></value><value><fullName>Login</fullName><default>false</default></value><value><fullName>Approve</fullName><default>false</default></value><value><fullName>Reject</fullName><default>false</default></value></valueSetDefinition></valueSet></CustomField>'
Create-Field "Audit_Log__c" "Object_Name__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Object_Name__c</fullName><label>Object Name</label><type>Text</type><length>100</length></CustomField>'
Create-Field "Audit_Log__c" "Record_Id__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Record_Id__c</fullName><label>Record Id</label><type>Text</type><length>18</length></CustomField>'
Create-Field "Audit_Log__c" "Old_Value__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Old_Value__c</fullName><label>Old Value</label><type>LongTextArea</type><length>32768</length><visibleLines>3</visibleLines></CustomField>'
Create-Field "Audit_Log__c" "New_Value__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>New_Value__c</fullName><label>New Value</label><type>LongTextArea</type><length>32768</length><visibleLines>3</visibleLines></CustomField>'
Create-Field "Audit_Log__c" "IP_Address__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>IP_Address__c</fullName><label>IP Address</label><type>Text</type><length>50</length></CustomField>'

Write-Host "Phase 5-7 metadata generation complete."
