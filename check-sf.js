import jsforce from 'jsforce';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkOrg() {
  const username = "testagent896.bd0a7456337e@agentforce.com";
  const password = "Piyush@76";
  const token = "tDYUruExiOe2jTxqnWKRNgjz";

  console.log("Trying login.salesforce.com...");
  let conn = new jsforce.Connection({ loginUrl: 'https://login.salesforce.com' });
  try {
    await conn.login(username, password + token);
    console.log("Success on login.salesforce.com!");
    return;
  } catch (e) {
    console.log("Failed on login.salesforce.com", e.message);
  }

  console.log("Trying test.salesforce.com...");
  conn = new jsforce.Connection({ loginUrl: 'https://test.salesforce.com' });
  try {
    await conn.login(username, password + token);
    console.log("Success on test.salesforce.com!");
    return;
  } catch (e) {
    console.log("Failed on test.salesforce.com", e.message);
  }
}

    const result = await conn.describeGlobal();
    const objectNames = result.sobjects.map(s => s.name);
    
    const requiredObjects = [
      'Employee__c', 'Attendance__c', 'Attendance_Punch__c', 
      'Leave_Request__c', 'Leave_Balance__c', 'Leave_Type__c',
      'Holiday__c', 'Shift__c'
    ];

    let missing = [];
    for (const obj of requiredObjects) {
      if (objectNames.includes(obj)) {
        console.log(`[OK] ${obj} exists.`);
      } else {
        console.log(`[MISSING] ${obj}`);
        missing.push(obj);
      }
    }

    if (missing.length === 0) {
      console.log("All objects are present in the org.");
    } else {
      console.log(`Missing objects: ${missing.join(', ')}`);
    }

  } catch (err) {
    console.error("Failed to connect or describe org:", err);
  }
}

checkOrg();
