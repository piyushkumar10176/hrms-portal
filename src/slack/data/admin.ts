/**
 * Queries the admin surfaces need.
 *
 * Kept here rather than added to lib/salesforce-queries.ts so the portal's own
 * data layer stays exactly as it is. Existing queries are imported and reused;
 * only what is genuinely new lives here.
 */

import { query, queryOneOrNull } from "@/lib/salesforce";
import { escapeSoqlString, assertSalesforceId } from "@/lib/soql";
import { businessToday } from "@/lib/business-time";

export interface NamedRecord {
  Id: string;
  Name: string;
}

export interface AdminEmployee {
  Id: string;
  Name: string;
  Employee_Code__c: string | null;
  First_Name__c: string | null;
  Last_Name__c: string | null;
  Official_Email__c: string | null;
  Mobile__c: string | null;
  Department__c: string | null;
  Designation__c: string | null;
  Employee_Status__c: string | null;
  Employment_Type__c: string | null;
  Role__c: string | null;
  Date_of_Joining__c: string | null;
  DOB__c: string | null;
  LWD__c: string | null;
  Resignation_Date__c: string | null;
  Work_Location__c: string | null;
  Slack_User_Id__c: string | null;
  Password_Hash__c: string | null;
  Reporting_Manager__c: string | null;
  Reporting_Manager__r?: { Name: string } | null;
  Bank_Account_Number__c?: string | null;
  IFSC_Code__c?: string | null;
  PAN__c?: string | null;
  Aadhaar__c?: string | null;
}

const EMPLOYEE_FIELDS = `
  Id, Name, Employee_Code__c, First_Name__c, Last_Name__c, Official_Email__c,
  Mobile__c, Department__c, Designation__c, Employee_Status__c, Employment_Type__c,
  Role__c, Date_of_Joining__c, DOB__c, LWD__c, Resignation_Date__c, Work_Location__c,
  Slack_User_Id__c, Password_Hash__c, Reporting_Manager__c, Reporting_Manager__r.Name,
  Bank_Account_Number__c, IFSC_Code__c, PAN__c, Aadhaar__c
`;

export async function getAdminEmployee(employeeId: string): Promise<AdminEmployee | null> {
  return queryOneOrNull<AdminEmployee>(`
    SELECT ${EMPLOYEE_FIELDS} FROM Employee__c
    WHERE Id = '${assertSalesforceId(employeeId)}' LIMIT 1
  `);
}

/**
 * Active employees as select options.
 *
 * Slack caps a static select at 100 options. Beyond that this has to become an
 * external select with an options load URL, which is extra Slack configuration,
 * so the cap is reported rather than silently truncating the list.
 */
export async function getEmployeeOptions(
  limit = 100
): Promise<{ options: NamedRecord[]; truncated: boolean }> {
  const rows = await query<NamedRecord & { Employee_Code__c: string | null }>(`
    SELECT Id, Name, Employee_Code__c FROM Employee__c
    WHERE Employee_Status__c = 'Active'
    ORDER BY Name LIMIT ${limit + 1}
  `);
  return {
    options: rows.slice(0, limit).map(r => ({
      Id: r.Id,
      Name: r.Employee_Code__c ? `${r.Name} (${r.Employee_Code__c})` : r.Name,
    })),
    truncated: rows.length > limit,
  };
}

/** Free-text search across name, code and email. */
export async function searchEmployees(term: string, limit = 20): Promise<AdminEmployee[]> {
  const safe = escapeSoqlString(term.trim());
  if (!safe) return [];
  return query<AdminEmployee>(`
    SELECT ${EMPLOYEE_FIELDS} FROM Employee__c
    WHERE (Name LIKE '%${safe}%'
        OR Employee_Code__c LIKE '%${safe}%'
        OR Official_Email__c LIKE '%${safe}%')
    ORDER BY Employee_Status__c, Name
    LIMIT ${limit}
  `);
}

export async function getDepartments(): Promise<NamedRecord[]> {
  return query<NamedRecord>(
    `SELECT Id, Name FROM Department__c ORDER BY Name LIMIT 100`
  );
}

export async function getDesignations(): Promise<NamedRecord[]> {
  return query<NamedRecord>(
    `SELECT Id, Name FROM Designation__c ORDER BY Name LIMIT 100`
  );
}

/**
 * The next employee code in the EMPnnn sequence.
 *
 * Employee_Code__c is a unique text field rather than an auto number, so it has
 * to be generated. Two people onboarding at the same moment could race for the
 * same code; the uniqueness constraint turns that into a clean error rather than
 * a duplicate, and the caller retries.
 */
export async function nextEmployeeCode(): Promise<string> {
  const rows = await query<{ Employee_Code__c: string }>(`
    SELECT Employee_Code__c FROM Employee__c
    WHERE Employee_Code__c LIKE 'EMP%'
    ORDER BY Employee_Code__c DESC LIMIT 1
  `);
  const highest = rows[0]?.Employee_Code__c ?? "EMP000";
  const digits = Number(highest.replace(/^EMP/i, "")) || 0;
  return `EMP${String(digits + 1).padStart(3, "0")}`;
}

export interface PunchRow {
  Id: string;
  Punch_DateTime__c: string;
  Punch_Type__c: string;
  Source__c: string | null;
}

/** One person's punches on one business date, in order. */
export async function getPunchesOn(employeeId: string, date: string): Promise<PunchRow[]> {
  return query<PunchRow>(`
    SELECT Id, Punch_DateTime__c, Punch_Type__c, Source__c
    FROM Attendance_Punch__c
    WHERE Employee__c = '${assertSalesforceId(employeeId)}'
      AND DAY_ONLY(Punch_DateTime__c) = ${date}
    ORDER BY Punch_DateTime__c ASC
  `);
}

export interface AttendanceRow {
  Id: string;
  Date__c: string;
  Check_In__c: string | null;
  Check_Out__c: string | null;
  Total_Hours__c: number | null;
  Gross_Hours__c: number | null;
  Break_Minutes__c: number | null;
  Status__c: string | null;
  Penalty__c: boolean;
  Penalty_Reason__c: string | null;
}

/** A person's derived attendance across a date range. */
export async function getAttendanceBetween(
  employeeId: string, from: string, to: string
): Promise<AttendanceRow[]> {
  return query<AttendanceRow>(`
    SELECT Id, Date__c, Check_In__c, Check_Out__c, Total_Hours__c, Gross_Hours__c,
           Break_Minutes__c, Status__c, Penalty__c, Penalty_Reason__c
    FROM Attendance__c
    WHERE Employee__c = '${assertSalesforceId(employeeId)}'
      AND Date__c >= ${from} AND Date__c <= ${to}
    ORDER BY Date__c DESC LIMIT 60
  `);
}

/** Everyone who has punched today, with the derived day if it exists yet. */
export async function getTodayAttendanceAcrossCompany(): Promise<
  { name: string; checkIn: string | null; checkOut: string | null; hours: number | null; status: string | null }[]
> {
  const today = businessToday();
  const rows = await query<{
    Employee__r: { Name: string };
    Check_In__c: string | null;
    Check_Out__c: string | null;
    Total_Hours__c: number | null;
    Status__c: string | null;
  }>(`
    SELECT Employee__r.Name, Check_In__c, Check_Out__c, Total_Hours__c, Status__c
    FROM Attendance__c
    WHERE Date__c = ${today}
    ORDER BY Employee__r.Name LIMIT 200
  `);
  return rows.map(r => ({
    name: r.Employee__r?.Name ?? "Unknown",
    checkIn: r.Check_In__c,
    checkOut: r.Check_Out__c,
    hours: r.Total_Hours__c,
    status: r.Status__c,
  }));
}
