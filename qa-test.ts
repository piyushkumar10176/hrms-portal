/**
 * QA Test: Salesforce Backend Integration Verification
 * Tests all migrated Salesforce query functions directly.
 */
import { getSalesforceConnection } from './src/lib/salesforce';
import {
  getAllEmployees,
  getEmployeeById,
  getEmployeeByEmail,
  getHolidays,
  getLeaveBalances,
  getTeamMembers,
  getPendingApprovals,
} from './src/lib/salesforce-queries';
import { query } from './src/lib/salesforce';

const results: { test: string; status: string; detail: string }[] = [];

function pass(test: string, detail: string) {
  results.push({ test, status: '✅ PASS', detail });
}
function fail(test: string, detail: string) {
  results.push({ test, status: '❌ FAIL', detail });
}

async function run() {
  console.log('═══════════════════════════════════════════════');
  console.log('  QA: Salesforce Backend Integration Tests');
  console.log('═══════════════════════════════════════════════\n');

  // 1. Connection Test
  try {
    const conn = await getSalesforceConnection();
    const identity = await conn.identity();
    pass('1. SF Connection', `Connected as ${identity.username}`);
  } catch (e: any) {
    fail('1. SF Connection', e.message);
    console.log('\n❌ Cannot proceed without connection.\n');
    process.exit(1);
  }

  // 2. Get All Employees
  let employees: any[] = [];
  try {
    employees = await getAllEmployees();
    if (employees.length > 0) {
      pass('2. getAllEmployees()', `${employees.length} employees found`);
    } else {
      fail('2. getAllEmployees()', 'No employees returned');
    }
  } catch (e: any) {
    fail('2. getAllEmployees()', e.message);
  }

  // 3. Get Employee By ID
  if (employees.length > 0) {
    try {
      const emp = await getEmployeeById(employees[0].Id);
      pass('3. getEmployeeById()', `Found: ${emp.Name} (${emp.Id})`);
    } catch (e: any) {
      fail('3. getEmployeeById()', e.message);
    }
  }

  // 4. Get Employee By Email
  if (employees.length > 0 && employees[0].Official_Email__c) {
    try {
      const emp = await getEmployeeByEmail(employees[0].Official_Email__c);
      pass('4. getEmployeeByEmail()', `Found: ${emp.Name} (${emp.Official_Email__c})`);
    } catch (e: any) {
      fail('4. getEmployeeByEmail()', e.message);
    }
  }

  // 5. Role__c field accessible
  if (employees.length > 0) {
    const hasRole = employees[0].Role__c !== undefined;
    if (hasRole || employees[0].Role__c === null) {
      pass('5. Role__c FLS', `Role field accessible (value: ${employees[0].Role__c || 'null'})`);
    } else {
      fail('5. Role__c FLS', 'Role__c field not in query results — FLS issue');
    }
  }

  // 6. Dashboard Stats (inline SOQL)
  try {
    const stats = await query<{ expr0: number }>(`
      SELECT COUNT(Id) expr0 FROM Employee__c WHERE Employee_Status__c = 'Active'
    `);
    pass('6. Dashboard COUNT query', `Active employees: ${stats[0]?.expr0}`);
  } catch (e: any) {
    fail('6. Dashboard COUNT query', e.message);
  }

  // 7. Holidays
  try {
    const holidays = await getHolidays();
    pass('7. getHolidays()', `${holidays.length} holidays found`);
  } catch (e: any) {
    fail('7. getHolidays()', e.message);
  }

  // 8. Leave Balances
  if (employees.length > 0) {
    try {
      const balances = await getLeaveBalances(employees[0].Id);
      pass('8. getLeaveBalances()', `${balances.length} balance records for ${employees[0].Name}`);
    } catch (e: any) {
      fail('8. getLeaveBalances()', e.message);
    }
  }

  // 9. Org Tree (inline SOQL for hierarchy)
  try {
    const orgData = await query<any>(`
      SELECT Id, Name, First_Name__c, Last_Name__c, Department__c, Designation__c,
             Reporting_Manager__c, Reporting_Manager__r.Name, Photograph__c
      FROM Employee__c
      WHERE Employee_Status__c = 'Active'
      ORDER BY Name
    `);
    pass('9. Org Tree query', `${orgData.length} employees in hierarchy`);
  } catch (e: any) {
    fail('9. Org Tree query', e.message);
  }

  // 10. Pending Approvals
  if (employees.length > 0) {
    try {
      const approvals = await getPendingApprovals(employees[0].Id);
      pass('10. getPendingApprovals()', `${approvals.length} pending approvals`);
    } catch (e: any) {
      fail('10. getPendingApprovals()', e.message);
    }
  }

  // 11. Team Members
  if (employees.length > 0) {
    try {
      const team = await getTeamMembers(employees[0].Id);
      pass('11. getTeamMembers()', `${team.length} direct reports for ${employees[0].Name}`);
    } catch (e: any) {
      fail('11. getTeamMembers()', e.message);
    }
  }

  // Print Results
  console.log('\n═══════════════════════════════════════════════');
  console.log('  TEST RESULTS SUMMARY');
  console.log('═══════════════════════════════════════════════');
  for (const r of results) {
    console.log(`${r.status}  ${r.test}`);
    console.log(`        ${r.detail}`);
  }
  const passed = results.filter(r => r.status.includes('PASS')).length;
  const failed = results.filter(r => r.status.includes('FAIL')).length;
  console.log(`\n  Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log('═══════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

run();
