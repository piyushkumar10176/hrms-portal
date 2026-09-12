/**
 * Everything the Home tab needs, gathered in as few round trips as possible.
 *
 * The tab is rebuilt every time someone opens it, so this runs often. Queries
 * that only some readers need are skipped entirely rather than fetched and
 * discarded: an ordinary employee never pays for the company-wide counts, and
 * somebody with no reports never pays for the approvals query.
 */

import {
  getLeaveBalances, getTodayPunches, getPendingApprovals, getTeamMembers,
  getWhoIsOutToday, getLeaveRequests, getAllPendingApprovals,
  getPendingRegularizationApprovals, getAllPendingRegularizations,
  type SFAttendancePunch, type SFLeaveBalance,
} from "@/lib/salesforce-queries";
import { query } from "@/lib/salesforce";
import { businessToday } from "@/lib/business-time";
import { toLeaveBalanceView, type LeaveBalanceView } from "@/lib/leave-balance";
import { canSeeCompanyWideData, toRole } from "@/lib/authz";
import type { SlackEmployee } from "@/lib/slack";

export interface PendingApproval {
  id: string;
  employeeName: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  days: number;
}

export interface AwayPerson {
  name: string;
  halfDay: boolean;
}

export interface CompanySnapshot {
  headcount: number;
  clockedIn: number;
  onLeave: number;
  flaggedThisMonth: number;
}

export interface HomeData {
  employee: SlackEmployee;
  todayPunches: SFAttendancePunch[];
  balances: LeaveBalanceView[];
  myPendingCount: number;
  isApprover: boolean;
  pendingApprovals: PendingApproval[];
  pendingRegularizations: number;
  outToday: AwayPerson[];
  remoteToday: AwayPerson[];
  isAdmin: boolean;
  company: CompanySnapshot | null;
}

/** Work from home is leave in the data model, but it is not absence. */
function isRemote(typeName: string | undefined, code: string | undefined): boolean {
  const c = (code ?? "").toUpperCase();
  const n = (typeName ?? "").toLowerCase();
  return c === "WFH" || n.includes("work from home") || n.includes("remote");
}

/** Company-wide counts. Only read for HR and admin. */
async function companySnapshot(): Promise<CompanySnapshot> {
  const today = businessToday();
  const monthStart = today.slice(0, 8) + "01";

  const [headcount, clockedIn, onLeave, flagged] = await Promise.all([
    query<{ c: number }>(
      `SELECT COUNT(Id) c FROM Employee__c WHERE Employee_Status__c = 'Active'`
    ),
    query<{ c: number }>(
      `SELECT COUNT_DISTINCT(Employee__c) c FROM Attendance_Punch__c
       WHERE DAY_ONLY(Punch_DateTime__c) = ${today}`
    ),
    query<{ c: number }>(
      `SELECT COUNT(Id) c FROM Leave_Request__c
       WHERE Status__c = 'Approved' AND From_Date__c <= ${today} AND To_Date__c >= ${today}`
    ),
    query<{ c: number }>(
      `SELECT COUNT(Id) c FROM Attendance__c
       WHERE Penalty__c = true AND Date__c >= ${monthStart} AND Date__c <= ${today}`
    ),
  ]);

  return {
    headcount: headcount[0]?.c ?? 0,
    clockedIn: clockedIn[0]?.c ?? 0,
    onLeave: onLeave[0]?.c ?? 0,
    flaggedThisMonth: flagged[0]?.c ?? 0,
  };
}

/**
 * Assembles the Home tab data for one person.
 *
 * Never throws on a partial failure of the optional sections: a Home tab that
 * renders without the company counts is far better than one that fails to
 * render at all.
 */
export async function loadHomeData(employee: SlackEmployee): Promise<HomeData> {
  const actor = { id: employee.Id, role: toRole(employee.Role__c) };
  const isAdmin = canSeeCompanyWideData(actor);

  // Everyone pays for these three.
  const [punches, rawBalances, myRequests, reports, outRows] = await Promise.all([
    getTodayPunches(employee.Id),
    getLeaveBalances(employee.Id),
    getLeaveRequests(employee.Id),
    getTeamMembers(employee.Id),
    getWhoIsOutToday(),
  ]);

  const isApprover = reports.length > 0 || isAdmin;

  // Only somebody who can actually decide something pays for the queues.
  let pendingApprovals: PendingApproval[] = [];
  let pendingRegularizations = 0;
  if (isApprover) {
    const [leaveRows, regRows] = await Promise.all([
      isAdmin ? getAllPendingApprovals() : getPendingApprovals(employee.Id),
      isAdmin ? getAllPendingRegularizations() : getPendingRegularizationApprovals(employee.Id),
    ]);
    pendingApprovals = leaveRows
      // Nobody decides their own request, so showing it here would be a dead end.
      .filter(r => r.Employee__c !== employee.Id)
      .map(r => ({
        id: r.Id,
        employeeName: r.Employee__r?.Name ?? "Unknown",
        leaveType: r.Leave_Type__r?.Name ?? "Leave",
        fromDate: r.From_Date__c,
        toDate: r.To_Date__c,
        days: r.Days__c ?? 0,
      }));
    pendingRegularizations = regRows.filter(r => r.Employee__c !== employee.Id).length;
  }

  const out: AwayPerson[] = [];
  const remote: AwayPerson[] = [];
  for (const row of outRows) {
    const person = {
      name: row.Employee__r?.Name ?? "Unknown",
      halfDay: row.Half_Day__c === true,
    };
    if (isRemote(row.Leave_Type__r?.Name, row.Leave_Type__r?.Code__c)) remote.push(person);
    else out.push(person);
  }

  let company: CompanySnapshot | null = null;
  if (isAdmin) {
    try {
      company = await companySnapshot();
    } catch (err) {
      // A missing summary is a worse-looking tab, not a broken one.
      console.error("[slack/home] company snapshot failed:", err);
    }
  }

  return {
    employee,
    todayPunches: punches,
    balances: (rawBalances as SFLeaveBalance[]).map((b, i) => toLeaveBalanceView(b, i)),
    myPendingCount: myRequests.filter(r => r.Status__c === "Submitted").length,
    isApprover,
    pendingApprovals,
    pendingRegularizations,
    outToday: out,
    remoteToday: remote,
    isAdmin,
    company,
  };
}
