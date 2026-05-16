import { getSalesforceConnection } from "./src/lib/salesforce";
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  try {
    const conn = await getSalesforceConnection();
    const result = await conn.query("SELECT Id, Name, Official_Email__c, Role__c FROM Employee__c WHERE Official_Email__c = 'piyush.kumar@cloudsheer.com'");
    
    if (result.records.length > 0) {
      const emp = result.records[0] as any;
      console.log("Employee found:");
      console.log(emp);

      if (emp.Role__c !== 'Admin') {
        console.log("Role is not Admin. Updating to Admin...");
        await conn.sobject("Employee__c").update({ Id: emp.Id, Role__c: 'Admin' });
        console.log("Update successful.");
      } else {
        console.log("Role is already Admin.");
      }
    } else {
      console.log("Employee not found.");
    }
  } catch (err) {
    console.error(err);
  }
}
main();
