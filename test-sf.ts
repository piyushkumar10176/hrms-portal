import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getSalesforceConnection, query } from './src/lib/salesforce';

async function testConnection() {
  try {
    const conn = await getSalesforceConnection();
    console.log("Connected to Salesforce successfully!");
    console.log("Instance URL:", conn.instanceUrl);

    // Test querying the custom Employee object
    const employees = await query("SELECT Id, Name, Official_Email__c FROM Employee__c LIMIT 1");
    console.log("Queried Employee__c:", employees);
  } catch (error) {
    console.error("Salesforce connection error:", error);
  }
}

testConnection();
