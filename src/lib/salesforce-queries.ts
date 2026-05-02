/**
 * Salesforce SOQL Query Library
 * 
 * Centralized query definitions for all Salesforce objects.
 * Each function returns typed data from Salesforce.
 * 
 * Naming convention: get[Entity][Qualifier]
 * All queries filter by the authenticated user's email.
 */

import { query, queryOne, queryOneOrNull, createRecord } from "./salesforce";

// ============================================
// Type Definitions (mirror Salesforce objects)
// ============================================

export interface SFEmployee {
  Id: string;
  Name: string;
  Employee_Code__c: string;
  First_Name__c: string;
  Last_Name__c: string;
  Official_Email__c: string;
  Mobile__c?: string;
  DOB__c?: string;
  Date_of_Joining__c: string;
  Employee_Status__c: string;
  Photograph__c?: string;
  Department__c?: string;
  Designation__c?: string;
  Reporting_Manager__c?: string;
  Reporting_Manager__r?: { Name: string; Id: string; Official_Email__c: string };
  Gender__c?: string;
  PAN__c?: string;
  Aadhaar__c?: string;
  Bank_Account_Number__c?: string;
  Bank_Name__c?: string;
  IFSC_Code__c?: string;
}

export interface SFAttendancePunch {
  Id: string;
  Employee__c: string;
  Punch_DateTime__c: string;
  Punch_Type__c: "Check-In" | "Check-Out";
  Latitude__c?: number;
  Longitude__c?: number;
  Source__c: "Web" | "Mobile" | "Biometric";
  External_Punch_ID__c?: string;
  Device_ID__c?: string;
}

export interface SFAttendance {
  Id: string;
  Employee__c: string;
  Date__c: string;
  Check_In__c?: string;
  Check_Out__c?: string;
  Total_Hours__c?: number;
  Late_By_Minutes__c?: number;
  Status__c: "Present" | "Absent" | "Half Day" | "Leave" | "Holiday" | "Week Off";
}

export interface SFLeaveType {
  Id: string;
  Name: string;
  Code__c: string;
  Annual_Quota__c: number;
  Carry_Forward_Allowed__c: boolean;
}

export interface SFLeaveBalance {
  Id: string;
  Employee__c: string;
  Leave_Type__c: string;
  Leave_Type__r: { Name: string; Code__c: string };
  Year__c: string;
  Opening_Balance__c: number;
  Accrued__c: number;
  Availed__c: number;
  Closing_Balance__c: number;
}

export interface SFLeaveRequest {
  Id: string;
  Name?: string;
  Employee__c: string;
  Employee__r?: { Name: string; Official_Email__c: string; Photograph__c?: string };
  Leave_Type__c: string;
  Leave_Type__r?: { Name: string; Code__c: string };
  From_Date__c: string;
  To_Date__c: string;
  Days__c: number;
  Half_Day__c: boolean;
  Reason__c?: string;
  Status__c: "Submitted" | "Approved" | "Rejected" | "Cancelled";
  Approver__c?: string;
  Approver__r?: { Name: string };
  CreatedDate?: string;
}

export interface SFHoliday {
  Id: string;
  Name: string;
  Date__c: string;
  Type__c: "National" | "Festival" | "Optional";
}

export interface SFShift {
  Id: string;
  Name: string;
  Start_Time__c: string;
  End_Time__c: string;
  Grace_Period_Minutes__c: number;
}

// ============================================
// Employee Queries
// ============================================

/**
 * Get the current employee's full profile by email.
 */
export async function getEmployeeByEmail(email: string): Promise<SFEmployee> {
  return queryOne<SFEmployee>(`
    SELECT Id, Name, Employee_Code__c, First_Name__c, Last_Name__c,
           Official_Email__c, Mobile__c, DOB__c,
           Date_of_Joining__c, Employee_Status__c, Photograph__c, Gender__c,
           Department__c, Designation__c,
           Reporting_Manager__c, Reporting_Manager__r.Name, 
           Reporting_Manager__r.Id, Reporting_Manager__r.Official_Email__c,
           PAN__c, Aadhaar__c, Bank_Account_Number__c, Bank_Name__c, IFSC_Code__c
    FROM Employee__c
    WHERE Official_Email__c = '${email}'
    AND Employee_Status__c = 'Active'
    LIMIT 1
  `);
}

/**
 * Get direct reports for a manager.
 */
export async function getTeamMembers(managerEmployeeId: string): Promise<SFEmployee[]> {
  return query<SFEmployee>(`
    SELECT Id, Name, Employee_Code__c, First_Name__c, Last_Name__c,
           Official_Email__c, Photograph__c, Department__c,
           Designation__c, Employee_Status__c
    FROM Employee__c
    WHERE Reporting_Manager__c = '${managerEmployeeId}'
    AND Employee_Status__c = 'Active'
    ORDER BY First_Name__c
  `);
}

/**
 * Get all active employees.
 */
export async function getAllEmployees(): Promise<SFEmployee[]> {
  return query<SFEmployee>(`
    SELECT Id, Name, Employee_Code__c, First_Name__c, Last_Name__c,
           Official_Email__c, Photograph__c, Department__c,
           Designation__c, Employee_Status__c, DOB__c,
           Date_of_Joining__c, Reporting_Manager__c, Reporting_Manager__r.Name
    FROM Employee__c
    WHERE Employee_Status__c = 'Active'
    ORDER BY First_Name__c
  `);
}

// ============================================
// Attendance Queries
// ============================================

/**
 * Get today's punches for an employee.
 */
export async function getTodayPunches(employeeId: string): Promise<SFAttendancePunch[]> {
  const today = new Date().toISOString().split("T")[0];
  return query<SFAttendancePunch>(`
    SELECT Id, Punch_DateTime__c, Punch_Type__c, Latitude__c, 
           Longitude__c, Source__c
    FROM Attendance_Punch__c
    WHERE Employee__c = '${employeeId}'
    AND DAY_ONLY(Punch_DateTime__c) = ${today}
    ORDER BY Punch_DateTime__c ASC
  `);
}

/**
 * Create a new punch record (clock-in or clock-out).
 */
export async function createPunch(data: {
  employeeId: string;
  punchType: "Check-In" | "Check-Out";
  latitude?: number;
  longitude?: number;
  source?: "Web" | "Mobile" | "Biometric";
  externalPunchId?: string;
  deviceId?: string;
}): Promise<string> {
  return createRecord("Attendance_Punch__c", {
    Employee__c: data.employeeId,
    Punch_DateTime__c: new Date().toISOString(),
    Punch_Type__c: data.punchType,
    Latitude__c: data.latitude,
    Longitude__c: data.longitude,
    Source__c: data.source || "Web",
    External_Punch_ID__c: data.externalPunchId,
    Device_ID__c: data.deviceId,
  });
}

/**
 * Get monthly attendance records for an employee.
 */
export async function getMonthlyAttendance(
  employeeId: string,
  year: number,
  month: number
): Promise<SFAttendance[]> {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0).toISOString().split("T")[0];

  return query<SFAttendance>(`
    SELECT Id, Date__c, Check_In__c, Check_Out__c, Total_Hours__c,
           Late_By_Minutes__c, Status__c
    FROM Attendance__c
    WHERE Employee__c = '${employeeId}'
    AND Date__c >= ${startDate}
    AND Date__c <= ${endDate}
    ORDER BY Date__c ASC
  `);
}

// ============================================
// Leave Queries
// ============================================

/**
 * Get leave balances for an employee for the current year.
 */
export async function getLeaveBalances(employeeId: string): Promise<SFLeaveBalance[]> {
  const currentYear = new Date().getFullYear().toString();
  return query<SFLeaveBalance>(`
    SELECT Id, Leave_Type__c, Leave_Type__r.Name, Leave_Type__r.Code__c,
           Year__c, Opening_Balance__c, Accrued__c, Availed__c, Closing_Balance__c
    FROM Leave_Balance__c
    WHERE Employee__c = '${employeeId}'
    AND Year__c = '${currentYear}'
    ORDER BY Leave_Type__r.Name
  `);
}

/**
 * Get all leave types.
 */
export async function getLeaveTypes(): Promise<SFLeaveType[]> {
  return query<SFLeaveType>(`
    SELECT Id, Name, Code__c, Annual_Quota__c, Carry_Forward_Allowed__c
    FROM Leave_Type__c
    ORDER BY Name
  `);
}

/**
 * Create a leave request.
 */
export async function createLeaveRequest(data: {
  employeeId: string;
  leaveTypeId: string;
  fromDate: string;
  toDate: string;
  days: number;
  halfDay: boolean;
  reason?: string;
  approverId?: string;
}): Promise<string> {
  return createRecord("Leave_Request__c", {
    Employee__c: data.employeeId,
    Leave_Type__c: data.leaveTypeId,
    From_Date__c: data.fromDate,
    To_Date__c: data.toDate,
    Days__c: data.days,
    Half_Day__c: data.halfDay,
    Reason__c: data.reason,
    Status__c: "Submitted",
    Approver__c: data.approverId,
  });
}

/**
 * Get leave requests for an employee.
 */
export async function getLeaveRequests(
  employeeId: string,
  status?: string
): Promise<SFLeaveRequest[]> {
  let soql = `
    SELECT Id, Name, Leave_Type__r.Name, Leave_Type__r.Code__c,
           From_Date__c, To_Date__c, Days__c, Half_Day__c, Reason__c,
           Status__c, Approver__r.Name, CreatedDate
    FROM Leave_Request__c
    WHERE Employee__c = '${employeeId}'
  `;
  if (status) {
    soql += ` AND Status__c = '${status}'`;
  }
  soql += ` ORDER BY CreatedDate DESC LIMIT 50`;

  return query<SFLeaveRequest>(soql);
}

/**
 * Get pending leave requests for a manager to approve.
 */
export async function getPendingApprovals(managerEmployeeId: string): Promise<SFLeaveRequest[]> {
  return query<SFLeaveRequest>(`
    SELECT Id, Name, Employee__r.Name, Employee__r.Official_Email__c,
           Employee__r.Photograph__c, Leave_Type__r.Name, Leave_Type__r.Code__c,
           From_Date__c, To_Date__c, Days__c, Half_Day__c, Reason__c,
           Status__c, CreatedDate
    FROM Leave_Request__c
    WHERE Approver__c = '${managerEmployeeId}'
    AND Status__c = 'Submitted'
    ORDER BY CreatedDate ASC
  `);
}

/**
 * Get team leave calendar (approved leaves for a manager's team).
 */
export async function getTeamLeaveCalendar(
  managerEmployeeId: string,
  startDate: string,
  endDate: string
): Promise<SFLeaveRequest[]> {
  return query<SFLeaveRequest>(`
    SELECT Id, Employee__r.Name, Employee__r.Photograph__c,
           Leave_Type__r.Name, From_Date__c, To_Date__c, Days__c, Status__c
    FROM Leave_Request__c
    WHERE Employee__r.Reporting_Manager__c = '${managerEmployeeId}'
    AND Status__c = 'Approved'
    AND From_Date__c <= ${endDate}
    AND To_Date__c >= ${startDate}
    ORDER BY From_Date__c
  `);
}

// ============================================
// Holiday Queries
// ============================================

/**
 * Get holidays for the current year.
 */
export async function getHolidays(): Promise<SFHoliday[]> {
  const currentYear = new Date().getFullYear();
  return query<SFHoliday>(`
    SELECT Id, Name, Date__c, Type__c
    FROM Holiday__c
    WHERE CALENDAR_YEAR(Date__c) = ${currentYear}
    ORDER BY Date__c ASC
  `);
}

// ============================================
// History Record Queries
// ============================================

export async function getHistoryRecords(employeeId: string) {
  try {
    const records = await query<{
      Id: string;
      Date__c: string;
      Type__c: string;
      Description__c: string;
    }>(`SELECT Id, Date__c, Type__c, Description__c FROM HistoryRecord__c WHERE Employee__c = '${employeeId}' ORDER BY Date__c DESC`);
    
    return records.map(r => ({
      id: r.Id,
      date: r.Date__c,
      type: r.Type__c,
      description: r.Description__c
    }));
  } catch (error) {
    console.warn("Error querying HistoryRecord__c (Object may not be deployed yet). Falling back to empty array.", error);
    return [];
  }
}

export async function createHistoryRecord(data: {
  employeeId: string;
  date: string;
  type: string;
  description: string;
}) {
  try {
    const conn = await getSalesforceConnection();
    const result = await conn.sobject("HistoryRecord__c").create({
      Employee__c: data.employeeId,
      Date__c: data.date,
      Type__c: data.type,
      Description__c: data.description,
    });
    return result.id;
  } catch (error) {
    console.error("Error creating HistoryRecord__c in Salesforce:", error);
    return null;
  }
}
