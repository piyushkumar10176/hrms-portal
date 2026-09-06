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
import { assertSalesforceId, escapeSoqlString } from "./soql";
import { businessToday } from "./business-time";

// ============================================
// Type Definitions (mirror Salesforce objects)
// ============================================

export interface SFEmployee {
  Password_Changed_At__c?: string | null;
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
  Role__c?: string;
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
  Department_Ref__c?: string;
  Department_Ref__r?: { Name: string; Code__c: string };
  Designation_Ref__c?: string;
  Designation_Ref__r?: { Name: string; Code__c: string; Grade__c?: number };
  Employment_Type__c?: string;
  Probation_End_Date__c?: string;
  Confirmation_Date__c?: string;
  Resignation_Date__c?: string;
  LWD__c?: string;
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
           Date_of_Joining__c, Employee_Status__c, Role__c, Photograph__c, Gender__c,
           Department__c, Designation__c,
           Reporting_Manager__c, Reporting_Manager__r.Name, 
           Reporting_Manager__r.Id, Reporting_Manager__r.Official_Email__c,
           PAN__c, Aadhaar__c, Bank_Account_Number__c, Bank_Name__c, IFSC_Code__c,
           Password_Changed_At__c,
           Department_Ref__c, Department_Ref__r.Name, Department_Ref__r.Code__c,
           Designation_Ref__c, Designation_Ref__r.Name, Designation_Ref__r.Code__c,
           Employment_Type__c, Probation_End_Date__c, Confirmation_Date__c, Resignation_Date__c, LWD__c
    FROM Employee__c
    WHERE Official_Email__c = '${escapeSoqlString(email)}'
    AND Employee_Status__c = 'Active'
    LIMIT 1
  `);
}

/**
 * Get the current employee's full profile by Id.
 */
export async function getEmployeeById(id: string): Promise<SFEmployee> {
  return queryOne<SFEmployee>(`
    SELECT Id, Name, Employee_Code__c, First_Name__c, Last_Name__c,
           Official_Email__c, Mobile__c, DOB__c,
           Date_of_Joining__c, Employee_Status__c, Role__c, Photograph__c, Gender__c,
           Department__c, Designation__c,
           Reporting_Manager__c, Reporting_Manager__r.Name, 
           Reporting_Manager__r.Id, Reporting_Manager__r.Official_Email__c,
           PAN__c, Aadhaar__c, Bank_Account_Number__c, Bank_Name__c, IFSC_Code__c,
           Department_Ref__c, Department_Ref__r.Name, Department_Ref__r.Code__c,
           Designation_Ref__c, Designation_Ref__r.Name, Designation_Ref__r.Code__c,
           Employment_Type__c, Probation_End_Date__c, Confirmation_Date__c, Resignation_Date__c, LWD__c
    FROM Employee__c
    WHERE Id = '${assertSalesforceId(id)}'
    LIMIT 1
  `);
}

/**
 * Get direct reports for a manager.
 */
export async function getTeamMembers(managerEmployeeId: string): Promise<SFEmployee[]> {
  return query<SFEmployee>(`
    SELECT Id, Name, Employee_Code__c, First_Name__c, Last_Name__c,
           Official_Email__c, Photograph__c, Department__c, Designation__c,
           Department_Ref__c, Department_Ref__r.Name, Designation_Ref__c, Designation_Ref__r.Name,
           Employee_Status__c, Role__c
    FROM Employee__c
    WHERE Reporting_Manager__c = '${assertSalesforceId(managerEmployeeId)}'
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
           Official_Email__c, Photograph__c, Department__c, Designation__c,
           Department_Ref__c, Department_Ref__r.Name, Designation_Ref__c, Designation_Ref__r.Name,
           Employee_Status__c, Role__c, DOB__c,
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
  // "Today" must be the business day in Asia/Kolkata. toISOString() yields the UTC
  // date, which rolls over at 05:30 IST and put early-morning punches on the wrong day.
  const today = businessToday();
  return query<SFAttendancePunch>(`
    SELECT Id, Punch_DateTime__c, Punch_Type__c, Latitude__c, 
           Longitude__c, Source__c
    FROM Attendance_Punch__c
    WHERE Employee__c = '${assertSalesforceId(employeeId)}'
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
  source?: "Web" | "Mobile" | "Biometric" | "Slack";
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
    WHERE Employee__c = '${assertSalesforceId(employeeId)}'
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
    WHERE Employee__c = '${assertSalesforceId(employeeId)}'
    AND Year__c = '${currentYear}'
    ORDER BY Leave_Type__r.Name
  `);
}

/**
 * Get all leave types.
 */
/**
 * Leave balances for many employees in a single query.
 *
 * The dashboard previously called getLeaveBalances once per direct report inside
 * an await loop, issuing one round trip to Salesforce per report.
 */
export async function getLeaveBalancesForEmployees(
  employeeIds: string[]
): Promise<Map<string, SFLeaveBalance[]>> {
  const grouped = new Map<string, SFLeaveBalance[]>();
  if (employeeIds.length === 0) return grouped;

  const currentYear = new Date().getFullYear().toString();
  const idList = employeeIds.map(id => `'${assertSalesforceId(id)}'`).join(",");
  const rows = await query<SFLeaveBalance & { Employee__c: string }>(`
    SELECT Id, Employee__c, Leave_Type__c, Leave_Type__r.Name, Leave_Type__r.Code__c,
           Year__c, Opening_Balance__c, Accrued__c, Availed__c, Closing_Balance__c
    FROM Leave_Balance__c
    WHERE Employee__c IN (${idList})
    AND Year__c = '${currentYear}'
    ORDER BY Leave_Type__r.Name
  `);

  for (const id of employeeIds) grouped.set(id, []);
  for (const row of rows) {
    const bucket = grouped.get(row.Employee__c);
    if (bucket) bucket.push(row);
  }
  return grouped;
}

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
    WHERE Employee__c = '${assertSalesforceId(employeeId)}'
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
    SELECT Id, Name, Employee__c, Employee__r.Name, Employee__r.Official_Email__c,
           Employee__r.Photograph__c, Leave_Type__r.Name, Leave_Type__r.Code__c,
           From_Date__c, To_Date__c, Days__c, Half_Day__c, Reason__c,
           Status__c, Approver__c, Approver__r.Name, CreatedDate
    FROM Leave_Request__c
    WHERE (Approver__c = '${assertSalesforceId(managerEmployeeId)}'
           OR Employee__r.Reporting_Manager__c = '${assertSalesforceId(managerEmployeeId)}')
    AND Status__c = 'Submitted'
    ORDER BY CreatedDate ASC
  `);
}

export async function getPendingRegularizationApprovals(managerEmployeeId: string) {
  return query<SFApprovalRequest>(`
    SELECT Id, Employee__c, Employee__r.Name, Employee__r.Official_Email__c,
           Date__c, Requested_Clock_In__c, Requested_Clock_Out__c, Reason__c,
           Status__c, CreatedDate
    FROM Regularization_Request__c
    WHERE Approver__c = '${assertSalesforceId(managerEmployeeId)}'
    AND Status__c = 'Submitted'
    ORDER BY CreatedDate ASC
  `);
}

export async function getPendingExpenseApprovals(managerEmployeeId: string) {
  return query<SFApprovalRequest>(`
    SELECT Id, Name, Employee__c, Employee__r.Name, Employee__r.Official_Email__c,
           Title__c, Total_Amount__c, Notes__c, Status__c, CreatedDate
    FROM Expense_Report__c
    WHERE Approver__c = '${assertSalesforceId(managerEmployeeId)}'
    AND Status__c = 'Submitted'
    ORDER BY CreatedDate ASC
  `);
}

export async function getPendingReimbursementApprovals(managerEmployeeId: string) {
  return query<SFApprovalRequest>(`
    SELECT Id, Name, Employee__c, Employee__r.Name, Employee__r.Official_Email__c,
           Component__r.Name, Amount_Claimed__c, Status__c, CreatedDate
    FROM Reimbursement__c
    WHERE Approver__c = '${assertSalesforceId(managerEmployeeId)}'
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
    WHERE Employee__r.Reporting_Manager__c = '${assertSalesforceId(managerEmployeeId)}'
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
    }>(`SELECT Id, Date__c, Type__c, Description__c FROM HistoryRecord__c WHERE Employee__c = '${assertSalesforceId(employeeId)}' ORDER BY Date__c DESC`);
    
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
    const resultId = await createRecord("HistoryRecord__c", {
      Employee__c: data.employeeId,
      Date__c: data.date,
      Type__c: data.type,
      Description__c: data.description,
    });
    return resultId;
  } catch (error) {
    console.error("Error creating HistoryRecord__c in Salesforce:", error);
    return null;
  }
}

// ============================================
// Payslip Queries
// ============================================

export async function getPayslips(employeeId: string) {
  try {
    const records = await query<{
      Id: string;
      Month__c: string;
      Basic__c: number;
      HRA__c: number;
      Conveyance__c: number;
      Medical__c: number;
      Special__c: number;
      PF__c: number;
      ESI__c: number;
      Professional_Tax__c: number;
      TDS__c: number;
      Net_Pay__c: number;
      Status__c: string;
      Paid_On__c: string;
    }>(`
      SELECT Id, Month__c, Basic__c, HRA__c, Conveyance__c, Medical__c, Special__c,
             PF__c, ESI__c, Professional_Tax__c, TDS__c, Net_Pay__c, Status__c, Paid_On__c
      FROM Payslip__c
      WHERE Employee__c = '${assertSalesforceId(employeeId)}'
      ORDER BY Paid_On__c DESC
    `);
    
    return records.map(r => ({
      id: r.Id,
      month: r.Month__c,
      basic: r.Basic__c,
      hra: r.HRA__c,
      conveyance: r.Conveyance__c,
      medical: r.Medical__c,
      special: r.Special__c,
      grossEarnings: r.Basic__c + r.HRA__c + r.Conveyance__c + r.Medical__c + r.Special__c,
      pf: r.PF__c,
      esi: r.ESI__c,
      professionalTax: r.Professional_Tax__c,
      tds: r.TDS__c,
      totalDeductions: r.PF__c + r.ESI__c + r.Professional_Tax__c + r.TDS__c,
      netPay: r.Net_Pay__c,
      status: r.Status__c,
      paidOn: r.Paid_On__c
    }));
  } catch (error) {
    console.warn("Error querying Payslip__c:", error);
    return [];
  }
}

// ============================================
// Salary Structure Queries
// ============================================

export async function getSalaryStructure(employeeId: string) {
  try {
    const records = await query<{
      Id: string;
      Name: string;
      Salary_Component__r: { Name: string; Component_Type__c: string; Is_Taxable__c: boolean; Is_Statutory__c: boolean; Display_Order__c: number };
      Monthly_Amount__c: number;
      Annual_Amount__c: number;
      CTC__c: number;
      Effective_Date__c: string;
    }>(`
      SELECT Id, Name,
             Salary_Component__r.Name, Salary_Component__r.Component_Type__c,
             Salary_Component__r.Is_Taxable__c, Salary_Component__r.Is_Statutory__c,
             Salary_Component__r.Display_Order__c,
             Monthly_Amount__c, Annual_Amount__c, CTC__c, Effective_Date__c
      FROM Employee_Salary_Structure__c
      WHERE Employee__c = '${assertSalesforceId(employeeId)}'
      ORDER BY Salary_Component__r.Display_Order__c ASC
    `);

    const earnings = records.filter(r => r.Salary_Component__r.Component_Type__c === 'Earning');
    const deductions = records.filter(r => r.Salary_Component__r.Component_Type__c === 'Deduction');
    const ctc = records.length > 0 ? records[0].CTC__c : 0;
    const grossMonthly = earnings.reduce((sum, r) => sum + (r.Monthly_Amount__c || 0), 0);
    const totalDeductions = deductions.reduce((sum, r) => sum + (r.Monthly_Amount__c || 0), 0);

    return {
      ctc,
      grossMonthly,
      netMonthly: grossMonthly - totalDeductions,
      effectiveDate: records.length > 0 ? records[0].Effective_Date__c : null,
      earnings: earnings.map(r => ({
        id: r.Id,
        component: r.Salary_Component__r.Name,
        monthly: r.Monthly_Amount__c,
        annual: r.Annual_Amount__c,
        isTaxable: r.Salary_Component__r.Is_Taxable__c,
      })),
      deductions: deductions.map(r => ({
        id: r.Id,
        component: r.Salary_Component__r.Name,
        monthly: r.Monthly_Amount__c,
        annual: r.Annual_Amount__c,
        isStatutory: r.Salary_Component__r.Is_Statutory__c,
      })),
    };
  } catch (error) {
    console.warn("Error querying Employee_Salary_Structure__c:", error);
    return { ctc: 0, grossMonthly: 0, netMonthly: 0, effectiveDate: null, earnings: [], deductions: [] };
  }
}

// ============================================
// Tax Declaration Queries
// ============================================

export async function getTaxDeclaration(employeeId: string, fy?: string) {
  try {
    const financialYear = fy || getCurrentFinancialYear();
    const record = await queryOneOrNull<{
      Id: string;
      Financial_Year__c: string;
      Tax_Regime__c: string;
      Section_80C__c: number;
      Section_80D__c: number;
      Section_80G__c: number;
      HRA_Rent_Paid__c: number;
      Landlord_PAN__c: string;
      Home_Loan_Interest__c: number;
      Other_Income__c: number;
      Previous_Employer_TDS__c: number;
      Status__c: string;
    }>(`
      SELECT Id, Financial_Year__c, Tax_Regime__c,
             Section_80C__c, Section_80D__c, Section_80G__c,
             HRA_Rent_Paid__c, Landlord_PAN__c, Home_Loan_Interest__c,
             Other_Income__c, Previous_Employer_TDS__c, Status__c
      FROM Tax_Declaration__c
      WHERE Employee__c = '${assertSalesforceId(employeeId)}' AND Financial_Year__c = '${escapeSoqlString(financialYear)}'
      LIMIT 1
    `);

    if (!record) return null;

    return {
      id: record.Id,
      financialYear: record.Financial_Year__c,
      taxRegime: record.Tax_Regime__c,
      section80C: record.Section_80C__c || 0,
      section80D: record.Section_80D__c || 0,
      section80G: record.Section_80G__c || 0,
      hraRentPaid: record.HRA_Rent_Paid__c || 0,
      landlordPAN: record.Landlord_PAN__c || '',
      homeLoanInterest: record.Home_Loan_Interest__c || 0,
      otherIncome: record.Other_Income__c || 0,
      previousEmployerTDS: record.Previous_Employer_TDS__c || 0,
      status: record.Status__c,
    };
  } catch (error) {
    console.warn("Error querying Tax_Declaration__c:", error);
    return null;
  }
}

function getCurrentFinancialYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 4) return `${year}-${year + 1}`;
  return `${year - 1}-${year}`;
}

// ============================================
// Payroll Cycle Queries
// ============================================

export async function getPayrollCycles() {
  try {
    const records = await query<{
      Id: string;
      Name: string;
      Month__c: string;
      Year__c: number;
      Start_Date__c: string;
      End_Date__c: string;
      Status__c: string;
      Total_Gross__c: number;
      Total_Net__c: number;
      Total_Employees__c: number;
    }>(`
      SELECT Id, Name, Month__c, Year__c, Start_Date__c, End_Date__c,
             Status__c, Total_Gross__c, Total_Net__c, Total_Employees__c
      FROM Payroll_Cycle__c
      ORDER BY Year__c DESC, Start_Date__c DESC
      LIMIT 12
    `);

    return records.map(r => ({
      id: r.Id,
      name: r.Name,
      month: r.Month__c,
      year: r.Year__c,
      startDate: r.Start_Date__c,
      endDate: r.End_Date__c,
      status: r.Status__c,
      totalGross: r.Total_Gross__c || 0,
      totalNet: r.Total_Net__c || 0,
      totalEmployees: r.Total_Employees__c || 0,
    }));
  } catch (error) {
    console.warn("Error querying Payroll_Cycle__c:", error);
    return [];
  }
}

/** Shape shared by the four request types that appear in the approvals inbox. */
export interface SFApprovalRequest {
  Id: string;
  Name?: string;
  Employee__c?: string | null;
  Employee__r?: { Name?: string; Official_Email__c?: string } | null;
  Approver__c?: string | null;
  Status__c?: string | null;
  Reason__c?: string | null;
  Notes__c?: string | null;
  Title__c?: string | null;
  Total_Amount__c?: number | null;
  Amount_Claimed__c?: number | null;
  Component__r?: { Name?: string } | null;
  Date__c?: string | null;
  Requested_Clock_In__c?: string | null;
  Requested_Clock_Out__c?: string | null;
  Days__c?: number | null;
  From_Date__c?: string | null;
  To_Date__c?: string | null;
  Leave_Type__r?: { Name?: string } | null;
  CreatedDate?: string;
}

/** A leave day drawn on the team calendar. */
export interface SFTeamLeaveEntry {
  Id: string;
  Employee__c?: string | null;
  Employee__r?: { Name?: string } | null;
  Leave_Type__r?: { Name?: string } | null;
  From_Date__c?: string | null;
  To_Date__c?: string | null;
  Status__c?: string | null;
}

/** Everyone whose approved leave covers the given date. */
export async function getAbsencesOn(isoDate: string) {
  return query<{
    Id: string;
    Employee__r?: { Name?: string } | null;
    Leave_Type__r?: { Name?: string } | null;
    From_Date__c: string | null;
    To_Date__c: string | null;
    Half_Day__c: boolean | null;
  }>(`
    SELECT Id, Employee__r.Name, Leave_Type__r.Name, From_Date__c, To_Date__c, Half_Day__c
    FROM Leave_Request__c
    WHERE Status__c = 'Approved'
      AND From_Date__c <= ${isoDate}
      AND To_Date__c >= ${isoDate}
    ORDER BY Employee__r.Name
  `);
}

/** Penalised attendance days in the month containing isoDate. */
export async function getPenalisedDays(employeeId: string, isoDate: string) {
  const start = isoDate.slice(0, 7) + "-01";
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 0));
  const end = endDate.toISOString().slice(0, 10);
  return query<{
    Id: string;
    Date__c: string;
    Check_In__c: string | null;
    Check_Out__c: string | null;
    Total_Hours__c: number | null;
    Status__c: string | null;
    Penalty_Reason__c: string | null;
  }>(`
    SELECT Id, Date__c, Check_In__c, Check_Out__c, Total_Hours__c, Status__c, Penalty_Reason__c
    FROM Attendance__c
    WHERE Employee__c = '${assertSalesforceId(employeeId)}'
      AND Date__c >= ${start} AND Date__c <= ${end}
      AND Penalty__c = true
    ORDER BY Date__c DESC
    LIMIT 31
  `);
}

/** Regularizations already raised in the month containing isoDate. */
export async function countRegularizationsInMonth(
  employeeId: string,
  isoDate: string
): Promise<number> {
  const start = isoDate.slice(0, 7) + "-01";
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 0));
  const end = endDate.toISOString().slice(0, 10);
  const rows = await query<{ Id: string }>(`
    SELECT Id FROM Regularization_Request__c
    WHERE Employee__c = '${assertSalesforceId(employeeId)}'
      AND Date__c >= ${start} AND Date__c <= ${end}
      AND Status__c IN ('Submitted','Approved','Rejected')
  `);
  return rows.length;
}

/** Leave summary for a dashboard: counts by status for the current year. */
export async function getLeaveSummary() {
  // "expr0" is reserved by Salesforce for auto-generated aggregate aliases and
  // is rejected if supplied explicitly, so the alias is named.
  return query<{ Status__c: string; total: number }>(`
    SELECT Status__c, COUNT(Id) total
    FROM Leave_Request__c
    WHERE CALENDAR_YEAR(From_Date__c) = ${new Date().getFullYear()}
    GROUP BY Status__c
  `);
}

/** Attendance penalties in the current month, by employee. */
export async function getPenaltySummary(isoDate: string) {
  const start = isoDate.slice(0, 7) + "-01";
  return query<{
    Employee__r?: { Name?: string } | null;
    Date__c: string;
    Penalty_Reason__c: string | null;
  }>(`
    SELECT Employee__r.Name, Date__c, Penalty_Reason__c
    FROM Attendance__c
    WHERE Penalty__c = true AND Date__c >= ${start}
    ORDER BY Employee__r.Name, Date__c DESC
    LIMIT 100
  `);
}

/**
 * Requests the employee may still cancel: their own, not yet decided against
 * them, and not already finished.
 *
 * Leave that has wholly passed is deliberately excluded. Cancelling a day
 * already taken is an HR correction, not self-service.
 */
export async function getCancellableRequests(employeeId: string, isoToday: string) {
  return query<{
    Id: string;
    Name: string;
    Status__c: string;
    From_Date__c: string;
    To_Date__c: string;
    Days__c: number;
    Half_Day__c: boolean | null;
    Half_Day_Session__c: string | null;
    Leave_Type__r?: { Name?: string } | null;
  }>(`
    SELECT Id, Name, Status__c, From_Date__c, To_Date__c, Days__c,
           Half_Day__c, Half_Day_Session__c, Leave_Type__r.Name
    FROM Leave_Request__c
    WHERE Employee__c = '${assertSalesforceId(employeeId)}'
      AND Status__c IN ('Submitted','Approved')
      AND To_Date__c >= ${isoToday}
    ORDER BY From_Date__c ASC
    LIMIT 20
  `);
}
