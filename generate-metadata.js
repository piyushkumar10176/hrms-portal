import fs from 'fs';
import path from 'path';

const BASE_DIR = path.join(process.cwd(), 'sf-hrms', 'force-app', 'main', 'default');
const OBJECTS_DIR = path.join(BASE_DIR, 'objects');
const TABS_DIR = path.join(BASE_DIR, 'tabs');
const APPS_DIR = path.join(BASE_DIR, 'applications');
const PROFILES_DIR = path.join(BASE_DIR, 'profiles');

const schema = [
  {
    name: 'Employee__c',
    label: 'Employee',
    pluralLabel: 'Employees',
    nameField: { label: 'Employee Name', type: 'Text' },
    fields: [
      { fullName: 'Employee_Code__c', label: 'Employee Code', type: 'Text', length: 50 },
      { fullName: 'Official_Email__c', label: 'Official Email', type: 'Email' },
      { fullName: 'First_Name__c', label: 'First Name', type: 'Text', length: 100 },
      { fullName: 'Last_Name__c', label: 'Last Name', type: 'Text', length: 100 },
      { fullName: 'Employee_Status__c', label: 'Employee Status', type: 'Text', length: 50 },
      { fullName: 'Reporting_Manager__c', label: 'Reporting Manager', type: 'Lookup', referenceTo: 'Employee__c' },
      { fullName: 'Photograph__c', label: 'Photograph URL', type: 'Url' },
      { fullName: 'Gender__c', label: 'Gender', type: 'Picklist', valueSet: ['Male', 'Female', 'Other'] },
      { fullName: 'Department__c', label: 'Department Name', type: 'Text', length: 100 },
      { fullName: 'Designation__c', label: 'Designation Name', type: 'Text', length: 100 },
      { fullName: 'Mobile__c', label: 'Mobile', type: 'Phone' },
      { fullName: 'DOB__c', label: 'Date of Birth', type: 'Date' },
      { fullName: 'Date_of_Joining__c', label: 'Date of Joining', type: 'Date' },
      { fullName: 'Bank_Name__c', label: 'Bank Name', type: 'Text', length: 100 },
      { fullName: 'Bank_Account_Number__c', label: 'Bank Account Number', type: 'Text', length: 100 },
      { fullName: 'IFSC_Code__c', label: 'IFSC Code', type: 'Text', length: 50 },
      { fullName: 'PAN__c', label: 'PAN', type: 'Text', length: 20 },
      { fullName: 'Aadhaar__c', label: 'Aadhaar', type: 'Text', length: 20 }
    ]
  },
  {
    name: 'Attendance_Punch__c',
    label: 'Attendance Punch',
    pluralLabel: 'Attendance Punches',
    nameField: { label: 'Punch ID', type: 'AutoNumber' },
    fields: [
      { fullName: 'Employee__c', label: 'Employee', type: 'Lookup', referenceTo: 'Employee__c' },
      { fullName: 'Punch_DateTime__c', label: 'Punch DateTime', type: 'DateTime' },
      { fullName: 'Punch_Type__c', label: 'Punch Type', type: 'Text', length: 50 },
      { fullName: 'Latitude__c', label: 'Latitude', type: 'Number', precision: 18, scale: 6 },
      { fullName: 'Longitude__c', label: 'Longitude', type: 'Number', precision: 18, scale: 6 },
      { fullName: 'Source__c', label: 'Source', type: 'Text', length: 50 }
    ]
  },
  {
    name: 'Attendance__c',
    label: 'Attendance',
    pluralLabel: 'Attendances',
    nameField: { label: 'Attendance ID', type: 'AutoNumber' },
    fields: [
      { fullName: 'Employee__c', label: 'Employee', type: 'Lookup', referenceTo: 'Employee__c' },
      { fullName: 'Date__c', label: 'Date', type: 'Date' },
      { fullName: 'Check_In__c', label: 'Check In', type: 'DateTime' },
      { fullName: 'Check_Out__c', label: 'Check Out', type: 'DateTime' },
      { fullName: 'Total_Hours__c', label: 'Total Hours', type: 'Number', precision: 5, scale: 2 },
      { fullName: 'Late_By_Minutes__c', label: 'Late By Minutes', type: 'Number', precision: 5, scale: 0 },
      { fullName: 'Status__c', label: 'Status', type: 'Picklist', valueSet: ['Present', 'Absent', 'Half Day', 'Leave', 'Holiday', 'Week Off'] }
    ]
  },
  {
    name: 'Leave_Type__c',
    label: 'Leave Type',
    pluralLabel: 'Leave Types',
    nameField: { label: 'Leave Type Name', type: 'Text' },
    fields: [
      { fullName: 'Code__c', label: 'Code', type: 'Text', length: 10 },
      { fullName: 'Annual_Quota__c', label: 'Annual Quota', type: 'Number', precision: 5, scale: 1 },
      { fullName: 'Carry_Forward_Allowed__c', label: 'Carry Forward Allowed', type: 'Checkbox' }
    ]
  },
  {
    name: 'Leave_Balance__c',
    label: 'Leave Balance',
    pluralLabel: 'Leave Balances',
    nameField: { label: 'Balance ID', type: 'AutoNumber' },
    fields: [
      { fullName: 'Employee__c', label: 'Employee', type: 'Lookup', referenceTo: 'Employee__c' },
      { fullName: 'Leave_Type__c', label: 'Leave Type', type: 'Lookup', referenceTo: 'Leave_Type__c' },
      { fullName: 'Year__c', label: 'Year', type: 'Text', length: 4 },
      { fullName: 'Opening_Balance__c', label: 'Opening Balance', type: 'Number', precision: 5, scale: 1 },
      { fullName: 'Accrued__c', label: 'Accrued', type: 'Number', precision: 5, scale: 1 },
      { fullName: 'Availed__c', label: 'Availed', type: 'Number', precision: 5, scale: 1 },
      { fullName: 'Closing_Balance__c', label: 'Closing Balance', type: 'Number', precision: 5, scale: 1 }
    ]
  },
  {
    name: 'Leave_Request__c',
    label: 'Leave Request',
    pluralLabel: 'Leave Requests',
    nameField: { label: 'Request Number', type: 'AutoNumber' },
    fields: [
      { fullName: 'Employee__c', label: 'Employee', type: 'Lookup', referenceTo: 'Employee__c' },
      { fullName: 'Leave_Type__c', label: 'Leave Type', type: 'Lookup', referenceTo: 'Leave_Type__c' },
      { fullName: 'From_Date__c', label: 'From Date', type: 'Date' },
      { fullName: 'To_Date__c', label: 'To Date', type: 'Date' },
      { fullName: 'Days__c', label: 'Days', type: 'Number', precision: 5, scale: 1 },
      { fullName: 'Half_Day__c', label: 'Half Day', type: 'Checkbox' },
      { fullName: 'Reason__c', label: 'Reason', type: 'LongTextArea', length: 32000, visibleLines: 3 },
      { fullName: 'Status__c', label: 'Status', type: 'Picklist', valueSet: ['Submitted', 'Approved', 'Rejected', 'Cancelled'] },
      { fullName: 'Approver__c', label: 'Approver', type: 'Lookup', referenceTo: 'Employee__c' }
    ]
  },
  {
    name: 'Holiday__c',
    label: 'Holiday',
    pluralLabel: 'Holidays',
    nameField: { label: 'Holiday Name', type: 'Text' },
    fields: [
      { fullName: 'Date__c', label: 'Date', type: 'Date' },
      { fullName: 'Type__c', label: 'Type', type: 'Picklist', valueSet: ['National', 'Festival', 'Optional'] }
    ]
  },
  {
    name: 'Shift__c',
    label: 'Shift',
    pluralLabel: 'Shifts',
    nameField: { label: 'Shift Name', type: 'Text' },
    fields: [
      { fullName: 'Start_Time__c', label: 'Start Time', type: 'Text', length: 10 },
      { fullName: 'End_Time__c', label: 'End Time', type: 'Text', length: 10 },
      { fullName: 'Grace_Period_Minutes__c', label: 'Grace Period Minutes', type: 'Number', precision: 4, scale: 0 }
    ]
  }
];

function generateObjectMeta(obj) {
  let displayFormatXml = '';
  if (obj.nameField.type === 'AutoNumber') {
    displayFormatXml = '\n        <displayFormat>ID-{00000}</displayFormat>';
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<CustomObject xmlns="http://soap.sforce.com/2006/04/metadata">
    <deploymentStatus>Deployed</deploymentStatus>
    <enableActivities>true</enableActivities>
    <enableBulkApi>true</enableBulkApi>
    <enableFeeds>false</enableFeeds>
    <enableHistory>true</enableHistory>
    <enableReports>true</enableReports>
    <enableSearch>true</enableSearch>
    <enableSharing>true</enableSharing>
    <enableStreamingApi>true</enableStreamingApi>
    <label>${obj.label}</label>
    <nameField>${displayFormatXml}
        <label>${obj.nameField.label}</label>
        <type>${obj.nameField.type}</type>
    </nameField>
    <pluralLabel>${obj.pluralLabel}</pluralLabel>
    <sharingModel>ReadWrite</sharingModel>
</CustomObject>`;
}

function generateFieldMeta(obj, field) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>${field.fullName}</fullName>
    <label>${field.label}</label>
    <type>${field.type}</type>\n`;

  if (field.type === 'Checkbox') {
    xml += `    <defaultValue>false</defaultValue>\n`;
  }
  if (field.length) xml += `    <length>${field.length}</length>\n`;
  if (field.precision) xml += `    <precision>${field.precision}</precision>\n`;
  if (field.scale !== undefined) xml += `    <scale>${field.scale}</scale>\n`;
  if (field.visibleLines) xml += `    <visibleLines>${field.visibleLines}</visibleLines>\n`;
  
  if (field.referenceTo) {
    const relName = obj.name.replace('__c', '') + '_' + field.fullName.replace('__c', 's');
    xml += `    <referenceTo>${field.referenceTo}</referenceTo>\n    <relationshipLabel>${obj.label}s</relationshipLabel>\n    <relationshipName>${relName}</relationshipName>\n`;
  }
  
  if (field.type === 'Picklist' && field.valueSet) {
    xml += `    <valueSet>
        <restricted>true</restricted>
        <valueSetDefinition>
            <sorted>false</sorted>\n`;
    for (const val of field.valueSet) {
      xml += `            <value>
                <fullName>${val}</fullName>
                <default>false</default>
                <label>${val}</label>
            </value>\n`;
    }
    xml += `        </valueSetDefinition>
    </valueSet>\n`;
  }

  xml += `</CustomField>`;
  return xml;
}

function generateTabMeta(obj) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<CustomTab xmlns="http://soap.sforce.com/2006/04/metadata">
    <customObject>true</customObject>
    <motif>Custom15: People</motif>
</CustomTab>`;
}

function generateAppMeta(schema) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<CustomApplication xmlns="http://soap.sforce.com/2006/04/metadata">
    <brand>
        <headerColor>#1B96FF</headerColor>
    </brand>
    <formFactors>Large</formFactors>
    <formFactors>Small</formFactors>
    <isNavAutoTempTabsDisabled>false</isNavAutoTempTabsDisabled>
    <isNavPersonalizationDisabled>false</isNavPersonalizationDisabled>
    <isNavTabPersistenceDisabled>false</isNavTabPersistenceDisabled>
    <label>Cloudsheer HRMS</label>
    <navType>Standard</navType>
    <tabs>standard-home</tabs>\n`;

  for (const obj of schema) {
    xml += `    <tabs>${obj.name}</tabs>\n`;
  }

  xml += `    <uiType>Lightning</uiType>
</CustomApplication>`;
  return xml;
}

function generateAdminProfile(schema) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Profile xmlns="http://soap.sforce.com/2006/04/metadata">
    <applicationVisibilities>
        <application>Cloudsheer_HRMS</application>
        <default>true</default>
        <visible>true</visible>
    </applicationVisibilities>\n`;

  for (const obj of schema) {
    for (const field of obj.fields) {
      xml += `    <fieldPermissions>
        <editable>true</editable>
        <field>${obj.name}.${field.fullName}</field>
        <readable>true</readable>
    </fieldPermissions>\n`;
    }
  }

  for (const obj of schema) {
    xml += `    <tabVisibilities>
        <tab>${obj.name}</tab>
        <visibility>DefaultOn</visibility>
    </tabVisibilities>\n`;
  }
  
  xml += `</Profile>`;
  return xml;
}

// Generate Objects & Fields
for (const obj of schema) {
  const objDir = path.join(OBJECTS_DIR, obj.name);
  const fieldsDir = path.join(objDir, 'fields');
  
  fs.mkdirSync(fieldsDir, { recursive: true });
  fs.writeFileSync(path.join(objDir, `${obj.name}.object-meta.xml`), generateObjectMeta(obj));
  
  for (const field of obj.fields) {
    fs.writeFileSync(path.join(fieldsDir, `${field.fullName}.field-meta.xml`), generateFieldMeta(obj, field));
  }
}

// Generate Tabs
fs.mkdirSync(TABS_DIR, { recursive: true });
for (const obj of schema) {
  fs.writeFileSync(path.join(TABS_DIR, `${obj.name}.tab-meta.xml`), generateTabMeta(obj));
}

// Generate App
fs.mkdirSync(APPS_DIR, { recursive: true });
fs.writeFileSync(path.join(APPS_DIR, 'Cloudsheer_HRMS.app-meta.xml'), generateAppMeta(schema));

// Generate Profile
fs.mkdirSync(PROFILES_DIR, { recursive: true });
fs.writeFileSync(path.join(PROFILES_DIR, 'Admin.profile-meta.xml'), generateAdminProfile(schema));

console.log("Full HRMS Metadata generated successfully.");
