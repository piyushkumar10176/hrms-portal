import { getAllEmployees } from "./src/lib/salesforce-queries";
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  try {
    const employees = await getAllEmployees();
    console.log(`Found ${employees.length} active employees.`);
    if (employees.length > 0) {
      console.log(employees[0]);
    }
  } catch (err) {
    console.error(err);
  }
}
main();
