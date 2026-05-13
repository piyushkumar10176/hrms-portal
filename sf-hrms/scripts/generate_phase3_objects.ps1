# Phase 3 Salesforce Deployment Script
# Creates validation rules + Phase 3 objects (Shift enhancements, Shift_Assignment, Roster, Regularization_Request)

$baseDir = "c:\Users\user\Downloads\Headless App\hrms\sf-hrms\force-app\main\default\objects"

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

function Create-Field {
    param([string]$ObjectName, [string]$FieldName, [string]$Content)
    $dir = "$baseDir\$ObjectName\fields"
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Set-Content -Path "$dir\$FieldName.field-meta.xml" -Value $Content
}

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

# =============================================
# 1. Validation Rules for Leave_Request__c
# =============================================

Create-ValidationRule "Leave_Request__c" "Date_Order" "From_Date__c > To_Date__c" "From Date cannot be after To Date."
Create-ValidationRule "Leave_Request__c" "Days_Positive" "Days__c <= 0" "Leave days must be greater than zero."

# =============================================
# 2. Validation Rules for Leave_Balance__c
# =============================================

Create-ValidationRule "Leave_Balance__c" "Closing_Non_Negative" "Closing_Balance__c < 0" "Closing balance cannot be negative."

# =============================================
# 3. Phase 3 Objects
# =============================================

# -- Shift__c enhancements (add new fields to existing object) --
Create-Field "Shift__c" "Grace_Period_Minutes__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Grace_Period_Minutes__c</fullName><label>Grace Period (Minutes)</label><type>Number</type><precision>3</precision><scale>0</scale><defaultValue>15</defaultValue></CustomField>'
Create-Field "Shift__c" "Half_Day_Hours__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Half_Day_Hours__c</fullName><label>Half Day Hours</label><type>Number</type><precision>4</precision><scale>1</scale><defaultValue>4</defaultValue></CustomField>'
Create-Field "Shift__c" "Full_Day_Hours__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Full_Day_Hours__c</fullName><label>Full Day Hours</label><type>Number</type><precision>4</precision><scale>1</scale><defaultValue>8</defaultValue></CustomField>'
Create-Field "Shift__c" "Is_Night_Shift__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Is_Night_Shift__c</fullName><label>Night Shift</label><type>Checkbox</type><defaultValue>false</defaultValue></CustomField>'

# -- Shift_Assignment__c (new) --
Create-Object "Shift_Assignment__c" "Shift Assignment" "Shift Assignments" "Assignment Name" "Text" "ReadWrite"
Create-Field "Shift_Assignment__c" "Employee__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Employee__c</fullName><label>Employee</label><type>Lookup</type><referenceTo>Employee__c</referenceTo><relationshipLabel>Shift Assignments</relationshipLabel><relationshipName>Shift_Assignments</relationshipName></CustomField>'
Create-Field "Shift_Assignment__c" "Shift__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Shift__c</fullName><label>Shift</label><type>Lookup</type><referenceTo>Shift__c</referenceTo><relationshipLabel>Assignments</relationshipLabel><relationshipName>Assignments</relationshipName></CustomField>'
Create-Field "Shift_Assignment__c" "Effective_From__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Effective_From__c</fullName><label>Effective From</label><type>Date</type></CustomField>'
Create-Field "Shift_Assignment__c" "Effective_To__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Effective_To__c</fullName><label>Effective To</label><type>Date</type></CustomField>'
Create-Field "Shift_Assignment__c" "Is_Current__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Is_Current__c</fullName><label>Is Current</label><type>Checkbox</type><defaultValue>true</defaultValue></CustomField>'

Create-ValidationRule "Shift_Assignment__c" "Date_Order" 'AND(NOT(ISBLANK(Effective_To__c)), Effective_From__c > Effective_To__c)' "Effective From cannot be after Effective To."

# -- Regularization_Request__c (new) --
Create-Object "Regularization_Request__c" "Regularization Request" "Regularization Requests" "Request No" "AutoNumber" "ReadWrite"
Create-Field "Regularization_Request__c" "Employee__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Employee__c</fullName><label>Employee</label><type>Lookup</type><referenceTo>Employee__c</referenceTo><relationshipLabel>Regularization Requests</relationshipLabel><relationshipName>Regularization_Requests</relationshipName></CustomField>'
Create-Field "Regularization_Request__c" "Date__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Date__c</fullName><label>Date</label><type>Date</type></CustomField>'
Create-Field "Regularization_Request__c" "Requested_Clock_In__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Requested_Clock_In__c</fullName><label>Requested Clock In</label><type>Time</type></CustomField>'
Create-Field "Regularization_Request__c" "Requested_Clock_Out__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Requested_Clock_Out__c</fullName><label>Requested Clock Out</label><type>Time</type></CustomField>'
Create-Field "Regularization_Request__c" "Reason__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Reason__c</fullName><label>Reason</label><type>LongTextArea</type><length>32768</length><visibleLines>3</visibleLines></CustomField>'
Create-Field "Regularization_Request__c" "Status__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Status__c</fullName><label>Status</label><type>Picklist</type><valueSet><valueSetDefinition><sorted>false</sorted><value><fullName>Submitted</fullName><default>true</default></value><value><fullName>Approved</fullName><default>false</default></value><value><fullName>Rejected</fullName><default>false</default></value></valueSetDefinition></valueSet></CustomField>'
Create-Field "Regularization_Request__c" "Approver__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Approver__c</fullName><label>Approver</label><type>Lookup</type><referenceTo>Employee__c</referenceTo><relationshipLabel>Regularization Approvals</relationshipLabel><relationshipName>Regularization_Approvals</relationshipName></CustomField>'

Create-ValidationRule "Regularization_Request__c" "Past_Date_Only" "Date__c > TODAY()" "Regularization can only be requested for past dates."

# -- Attendance__c enhancements --
Create-Field "Attendance__c" "Shift__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Shift__c</fullName><label>Shift</label><type>Lookup</type><referenceTo>Shift__c</referenceTo><relationshipLabel>Attendance Records</relationshipLabel><relationshipName>Attendance_Records</relationshipName></CustomField>'
Create-Field "Attendance__c" "Late_By_Minutes__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Late_By_Minutes__c</fullName><label>Late By (Minutes)</label><type>Number</type><precision>5</precision><scale>0</scale><defaultValue>0</defaultValue></CustomField>'

# -- Attendance_Punch__c enhancements --
Create-Field "Attendance_Punch__c" "Adjustment_Reason__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Adjustment_Reason__c</fullName><label>Adjustment Reason</label><type>LongTextArea</type><length>32768</length><visibleLines>3</visibleLines></CustomField>'
Create-Field "Attendance_Punch__c" "Adjusted_By__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Adjusted_By__c</fullName><label>Adjusted By</label><type>Lookup</type><referenceTo>Employee__c</referenceTo><relationshipLabel>Punch Adjustments</relationshipLabel><relationshipName>Punch_Adjustments</relationshipName></CustomField>'
Create-Field "Attendance_Punch__c" "Approved__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Approved__c</fullName><label>Approved</label><type>Checkbox</type><defaultValue>false</defaultValue></CustomField>'

# -- Leave_Type__c enhancements --
Create-Field "Leave_Type__c" "Max_Carry_Forward__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Max_Carry_Forward__c</fullName><label>Max Carry Forward Days</label><type>Number</type><precision>3</precision><scale>0</scale></CustomField>'
Create-Field "Leave_Type__c" "Encashable__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Encashable__c</fullName><label>Encashable</label><type>Checkbox</type><defaultValue>false</defaultValue></CustomField>'
Create-Field "Leave_Type__c" "Half_Day_Allowed__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Half_Day_Allowed__c</fullName><label>Half Day Allowed</label><type>Checkbox</type><defaultValue>true</defaultValue></CustomField>'
Create-Field "Leave_Type__c" "Min_Notice_Days__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Min_Notice_Days__c</fullName><label>Min Notice Days</label><type>Number</type><precision>3</precision><scale>0</scale><defaultValue>0</defaultValue></CustomField>'
Create-Field "Leave_Type__c" "Max_Consecutive_Days__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Max_Consecutive_Days__c</fullName><label>Max Consecutive Days</label><type>Number</type><precision>3</precision><scale>0</scale></CustomField>'
Create-Field "Leave_Type__c" "Color__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Color__c</fullName><label>Color</label><type>Text</type><length>7</length></CustomField>'
Create-Field "Leave_Type__c" "Active__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Active__c</fullName><label>Active</label><type>Checkbox</type><defaultValue>true</defaultValue></CustomField>'

# -- Notification__c enhancements --
Create-Field "Notification__c" "Expires_At__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Expires_At__c</fullName><label>Expires At</label><type>Date</type></CustomField>'
Create-Field "Notification__c" "Read_On__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Read_On__c</fullName><label>Read On</label><type>DateTime</type></CustomField>'
Create-Field "Notification__c" "Category__c" '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"><fullName>Category__c</fullName><label>Category</label><type>Picklist</type><valueSet><valueSetDefinition><sorted>false</sorted><value><fullName>Leave</fullName><default>false</default></value><value><fullName>Expense</fullName><default>false</default></value><value><fullName>Payroll</fullName><default>false</default></value><value><fullName>Task</fullName><default>false</default></value><value><fullName>Approval</fullName><default>false</default></value><value><fullName>System</fullName><default>false</default></value><value><fullName>Birthday</fullName><default>false</default></value><value><fullName>Asset</fullName><default>false</default></value></valueSetDefinition></valueSet></CustomField>'

Write-Host "Phase 3 metadata generation complete."
