import { NextResponse } from "next/server";
import { toLeaveBalanceView, type LeaveBalanceView } from "@/lib/leave-balance";
import { auth } from "@/lib/auth";
import { getTeamMembers, getTeamLeaveCalendar, getAllEmployees, getHolidays, getLeaveBalancesForEmployees } from "@/lib/salesforce-queries";
import { getSessionEmployee, StaleSessionError } from "@/lib/session-employee";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sfEmp = await getSessionEmployee(session);
    
    // Get Team Members
    const reports = await getTeamMembers(sfEmp.Id);
    
    interface DirectReportLeave {
      id: string;
      name: string;
      designation: string;
      usedLeaves: number;
      totalLeaves: number;
      balances: LeaveBalanceView[];
    }
    interface TeamLeaveDay {
      name: string;
      leaveType: string;
      fromDate?: string | null;
      toDate?: string | null;
      status?: string | null;
    }
    const directReportsLeaves: DirectReportLeave[] = [];
    let teamOnLeave: TeamLeaveDay[] = [];
    
    if (reports.length > 0) {
      // Fetch leaves for each direct report
      const today = new Date().toISOString().split("T")[0];
      const nextMonth = new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split("T")[0];
      
      const approvedLeaves = await getTeamLeaveCalendar(sfEmp.Id, today, nextMonth);
      
      teamOnLeave = approvedLeaves.map(l => ({
        id: l.Id,
        name: l.Employee__r?.Name || "Unknown",
        leaveType: l.Leave_Type__r?.Name || "Leave",
        fromDate: l.From_Date__c,
        toDate: l.To_Date__c,
        status: l.Status__c
      }));
      
      // One query for every direct report. This loop previously awaited
      // getLeaveBalances once per report, so a manager with ten reports cost ten
      // sequential round trips to Salesforce.
      const balancesByEmployee = await getLeaveBalancesForEmployees(reports.map(r => r.Id));

      for (const r of reports) {
        const balances = balancesByEmployee.get(r.Id) ?? [];
        const formattedBalances = balances.map((b, i) => toLeaveBalanceView(b, i));
        const usedLeaves = formattedBalances.reduce((sum, b) => sum + b.used, 0);
        const totalLeaves = formattedBalances.reduce((sum, b) => sum + b.total, 0);

        directReportsLeaves.push({
          id: r.Id,
          name: r.Name,
          designation: r.Designation__c || "Employee",
          usedLeaves,
          totalLeaves,
          balances: formattedBalances
        });
      }
    }
    
    // Calculate upcoming birthdays
    const allEmps = await getAllEmployees();
    const now = new Date();
    const birthdays = [];
    
    for (const e of allEmps) {
      if (e.DOB__c) {
        const d = new Date(e.DOB__c);
        const bd = new Date(now.getFullYear(), d.getMonth(), d.getDate());
        if (bd < now) bd.setFullYear(bd.getFullYear() + 1);
        const diff = Math.ceil((bd.getTime() - now.getTime()) / 86400000);
        if (diff <= 30) {
          birthdays.push({
            employee: {
              id: e.Id,
              firstName: e.First_Name__c || e.Name.split(' ')[0],
              lastName: e.Last_Name__c || e.Name.split(' ')[1] || '',
              name: e.Name
            },
            daysAway: diff,
            date: e.DOB__c
          });
        }
      }
    }
    
    birthdays.sort((a, b) => a.daysAway - b.daysAway);
    
    // Fetch Holidays
    const holidaysData = await getHolidays();
    const holidays = holidaysData.map(h => ({
      id: h.Id,
      name: h.Name,
      date: h.Date__c,
      type: h.Type__c
    }));
    
    return NextResponse.json({ birthdays, teamOnLeave, directReportsLeaves, holidays, source: "salesforce" });
  } catch (err) {
    if (err instanceof StaleSessionError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("Salesforce dashboard fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 });
  }
}
