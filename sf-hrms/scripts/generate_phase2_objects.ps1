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
    $fieldFile = "$baseDir\$ObjectName\fields\$FieldName.field-meta.xml"
    Set-Content -Path $fieldFile -Value $Content
}

Create-Object "Onboarding_Template__c" "Onboarding Template" "Onboarding Templates" "Template Name" "Text" "ReadWrite"
Create-Field "Onboarding_Template__c" "Department__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Department__c</fullName><label>Department</label><type>Lookup</type><referenceTo>Department__c</referenceTo><relationshipLabel>Onboarding Templates</relationshipLabel><relationshipName>Onboarding_Templates</relationshipName></CustomField>'
Create-Field "Onboarding_Template__c" "Designation__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Designation__c</fullName><label>Designation</label><type>Lookup</type><referenceTo>Designation__c</referenceTo><relationshipLabel>Onboarding Templates</relationshipLabel><relationshipName>Onboarding_Templates</relationshipName></CustomField>'
Create-Field "Onboarding_Template__c" "Active__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Active__c</fullName><label>Active</label><type>Checkbox</type><defaultValue>true</defaultValue></CustomField>'

Create-Object "Onboarding_Template_Task__c" "Onboarding Template Task" "Onboarding Template Tasks" "Task No" "AutoNumber" "ControlledByParent"
Create-Field "Onboarding_Template_Task__c" "Onboarding_Template__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Onboarding_Template__c</fullName><label>Onboarding Template</label><type>MasterDetail</type><referenceTo>Onboarding_Template__c</referenceTo><relationshipLabel>Template Tasks</relationshipLabel><relationshipName>Template_Tasks</relationshipName><writeRequiresMasterRead>false</writeRequiresMasterRead><reparentableMasterDetail>false</reparentableMasterDetail></CustomField>'
Create-Field "Onboarding_Template_Task__c" "Task_Name__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Task_Name__c</fullName><label>Task Name</label><type>Text</type><length>255</length></CustomField>'
Create-Field "Onboarding_Template_Task__c" "Assignee_Role__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Assignee_Role__c</fullName><label>Assignee Role</label><type>Picklist</type><valueSet><valueSetDefinition><sorted>false</sorted><value><fullName>HR</fullName><default>true</default></value><value><fullName>IT</fullName><default>false</default></value><value><fullName>Manager</fullName><default>false</default></value><value><fullName>Self</fullName><default>false</default></value></valueSetDefinition></valueSet></CustomField>'
Create-Field "Onboarding_Template_Task__c" "Due_Days_After_Joining__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Due_Days_After_Joining__c</fullName><label>Due Days After Joining</label><type>Number</type><precision>3</precision><scale>0</scale></CustomField>'

Create-Object "Onboarding_Task__c" "Onboarding Task" "Onboarding Tasks" "Task ID" "AutoNumber" "ControlledByParent"
Create-Field "Onboarding_Task__c" "Employee__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Employee__c</fullName><label>Employee</label><type>MasterDetail</type><referenceTo>Employee__c</referenceTo><relationshipLabel>Onboarding Tasks</relationshipLabel><relationshipName>Onboarding_Tasks</relationshipName><writeRequiresMasterRead>false</writeRequiresMasterRead><reparentableMasterDetail>false</reparentableMasterDetail></CustomField>'
Create-Field "Onboarding_Task__c" "Template_Task__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Template_Task__c</fullName><label>Template Task</label><type>Lookup</type><referenceTo>Onboarding_Template_Task__c</referenceTo><relationshipLabel>Generated Tasks</relationshipLabel><relationshipName>Generated_Tasks</relationshipName></CustomField>'
Create-Field "Onboarding_Task__c" "Assignee__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Assignee__c</fullName><label>Assignee</label><type>Lookup</type><referenceTo>Employee__c</referenceTo><relationshipLabel>Assigned Onboarding Tasks</relationshipLabel><relationshipName>Assigned_Onboarding_Tasks</relationshipName></CustomField>'
Create-Field "Onboarding_Task__c" "Status__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Status__c</fullName><label>Status</label><type>Picklist</type><valueSet><valueSetDefinition><sorted>false</sorted><value><fullName>Pending</fullName><default>true</default></value><value><fullName>In Progress</fullName><default>false</default></value><value><fullName>Completed</fullName><default>false</default></value><value><fullName>Skipped</fullName><default>false</default></value></valueSetDefinition></valueSet></CustomField>'
Create-Field "Onboarding_Task__c" "Due_Date__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Due_Date__c</fullName><label>Due Date</label><type>Date</type></CustomField>'
Create-Field "Onboarding_Task__c" "Completed_On__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Completed_On__c</fullName><label>Completed On</label><type>Date</type></CustomField>'
Create-Field "Onboarding_Task__c" "Notes__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Notes__c</fullName><label>Notes</label><type>LongTextArea</type><length>32768</length><visibleLines>3</visibleLines></CustomField>'

Create-Object "Employee_Document__c" "Employee Document" "Employee Documents" "Doc ID" "AutoNumber" "ControlledByParent"
Create-Field "Employee_Document__c" "Employee__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Employee__c</fullName><label>Employee</label><type>MasterDetail</type><referenceTo>Employee__c</referenceTo><relationshipLabel>Documents</relationshipLabel><relationshipName>Documents</relationshipName><writeRequiresMasterRead>false</writeRequiresMasterRead><reparentableMasterDetail>false</reparentableMasterDetail></CustomField>'
Create-Field "Employee_Document__c" "Document_Type__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Document_Type__c</fullName><label>Document Type</label><type>Picklist</type><valueSet><valueSetDefinition><sorted>false</sorted><value><fullName>Offer Letter</fullName><default>false</default></value><value><fullName>PAN Card</fullName><default>false</default></value><value><fullName>Aadhaar</fullName><default>false</default></value><value><fullName>Bank Proof</fullName><default>false</default></value><value><fullName>Education</fullName><default>false</default></value><value><fullName>Experience</fullName><default>false</default></value><value><fullName>Other</fullName><default>false</default></value></valueSetDefinition></valueSet></CustomField>'
Create-Field "Employee_Document__c" "Document_Name__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Document_Name__c</fullName><label>Document Name</label><type>Text</type><length>255</length></CustomField>'
Create-Field "Employee_Document__c" "Content_Document_Id__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Content_Document_Id__c</fullName><label>Content Document Id</label><type>Text</type><length>18</length></CustomField>'
Create-Field "Employee_Document__c" "Verified__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Verified__c</fullName><label>Verified</label><type>Checkbox</type><defaultValue>false</defaultValue></CustomField>'
Create-Field "Employee_Document__c" "Verified_By__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Verified_By__c</fullName><label>Verified By</label><type>Lookup</type><referenceTo>Employee__c</referenceTo><relationshipLabel>Verified Documents</relationshipLabel><relationshipName>Verified_Documents</relationshipName></CustomField>'
Create-Field "Employee_Document__c" "Expiry_Date__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Expiry_Date__c</fullName><label>Expiry Date</label><type>Date</type></CustomField>'

Write-Host "Metadata generation complete."
