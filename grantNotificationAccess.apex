PermissionSet ps = [SELECT Id FROM PermissionSet WHERE Name = 'HRMS_Employee' LIMIT 1];
// ObjectPermissions op = new ObjectPermissions(ParentId=ps.Id, SobjectType='Notification__c', PermissionsRead=true, PermissionsCreate=true, PermissionsEdit=true, PermissionsDelete=true);
// insert op; // Already inserted

List<FieldPermissions> fps = new List<FieldPermissions>();
fps.add(new FieldPermissions(ParentId=ps.Id, SobjectType='Notification__c', Field='Notification__c.Employee__c', PermissionsRead=true, PermissionsEdit=true));
fps.add(new FieldPermissions(ParentId=ps.Id, SobjectType='Notification__c', Field='Notification__c.Is_Read__c', PermissionsRead=true, PermissionsEdit=true));
fps.add(new FieldPermissions(ParentId=ps.Id, SobjectType='Notification__c', Field='Notification__c.Type__c', PermissionsRead=true, PermissionsEdit=true));
fps.add(new FieldPermissions(ParentId=ps.Id, SobjectType='Notification__c', Field='Notification__c.Related_Record_Id__c', PermissionsRead=true, PermissionsEdit=true));
insert fps;
