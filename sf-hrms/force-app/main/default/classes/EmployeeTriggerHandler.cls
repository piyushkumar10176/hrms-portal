public class EmployeeTriggerHandler {
    public static void handleAfterInsert(List<Employee__c> newEmployees) {
        List<Onboarding_Task__c> tasksToCreate = new List<Onboarding_Task__c>();
        Set<Id> departmentIds = new Set<Id>();
        Set<Id> designationIds = new Set<Id>();
        
        for (Employee__c emp : newEmployees) {
            if (emp.Employee_Status__c == 'Active') {
                if (emp.Department_Ref__c != null) departmentIds.add(emp.Department_Ref__c);
                if (emp.Designation_Ref__c != null) designationIds.add(emp.Designation_Ref__c);
            }
        }
        
        // Find matching active templates
        List<Onboarding_Template__c> templates = [
            SELECT Id, Department__c, Designation__c, 
                (SELECT Id, Task_Name__c, Assignee_Role__c, Due_Days_After_Joining__c FROM Template_Tasks__r)
            FROM Onboarding_Template__c
            WHERE Active__c = true 
            AND (Department__c IN :departmentIds OR Designation__c IN :designationIds OR (Department__c = null AND Designation__c = null))
        ];
        
        // Process new employees
        for (Employee__c emp : newEmployees) {
            if (emp.Employee_Status__c != 'Active') continue;
            
            for (Onboarding_Template__c template : templates) {
                // Match logic: if template is specific to dept/desig, it must match.
                // If template has both null, it applies to all.
                boolean match = false;
                if (template.Department__c == null && template.Designation__c == null) {
                    match = true;
                } else if (template.Department__c != null && template.Department__c == emp.Department_Ref__c) {
                    match = true;
                } else if (template.Designation__c != null && template.Designation__c == emp.Designation_Ref__c) {
                    match = true;
                }
                
                if (match) {
                    for (Onboarding_Template_Task__c tTask : template.Template_Tasks__r) {
                        Onboarding_Task__c newTask = new Onboarding_Task__c();
                        newTask.Employee__c = emp.Id;
                        newTask.Template_Task__c = tTask.Id;
                        newTask.Status__c = 'Pending';
                        if (tTask.Due_Days_After_Joining__c != null && emp.Date_of_Joining__c != null) {
                            newTask.Due_Date__c = emp.Date_of_Joining__c.addDays(Integer.valueOf(tTask.Due_Days_After_Joining__c));
                        }
                        
                        // Assignee logic: 'Self' -> Employee__c, 'Manager' -> Reporting_Manager__c
                        if (tTask.Assignee_Role__c == 'Self') {
                            newTask.Assignee__c = emp.Id;
                        } else if (tTask.Assignee_Role__c == 'Manager' && emp.Reporting_Manager__c != null) {
                            newTask.Assignee__c = emp.Reporting_Manager__c;
                        }
                        
                        tasksToCreate.add(newTask);
                    }
                }
            }
        }
        
        if (!tasksToCreate.isEmpty()) {
            insert tasksToCreate;
        }
    }
}
