/**
 * Password Migration — generates Apex file directly
 */
import { hashSync } from "bcryptjs";
import { writeFileSync } from "fs";

const hashAdmin = hashSync("admin", 10);
const hashEmp123 = hashSync("emp123", 10);
const hashPiyush = hashSync("Piyush@1606", 10);

const apex = `// Auto-generated password migration script
String hashAdmin = '${hashAdmin}';
String hashEmp123 = '${hashEmp123}';
String hashPiyush = '${hashPiyush}';

List<Employee__c> emps = [SELECT Id, Official_Email__c FROM Employee__c WHERE Employee_Status__c = 'Active'];
for (Employee__c emp : emps) {
    if (emp.Official_Email__c == 'emp001@test.com') {
        emp.Password_Hash__c = hashAdmin;
    } else if (emp.Official_Email__c == 'piyush.kumar@cloudsheer.com') {
        emp.Password_Hash__c = hashPiyush;
    } else {
        emp.Password_Hash__c = hashEmp123;
    }
}
update emps;
System.debug('Migrated passwords for ' + emps.size() + ' employees');
`;

writeFileSync("scripts/migrate-passwords-apex.apex", apex, "utf-8");
console.log("Apex script written to scripts/migrate-passwords-apex.apex");
