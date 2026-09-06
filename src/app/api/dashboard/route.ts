import { NextResponse } from "next/server";
import { toLeaveBalanceView, type LeaveBalanceView } from "@/lib/leave-balance";
import { auth } from "@/lib/auth";
import { getTeamMembers, getTeamLeaveCalendar, getAllEmployees, getHolidays, getLeaveBalancesForEmployees, getWhoIsOutToday } from "@/lib/salesforce-queries";
import { businessToday } from "@/lib/business-time";
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
    
    // Upcoming birthdays and work anniversaries, in one pass over the roster.
    // Both count forward from the business day rather than the server's clock,
    // which is five and a half hours behind and would put an evening birthday
    // on the wrong side of "today".
    const allEmps = await getAllEmployees();
    const today = new Date(businessToday() + "T00:00:00Z");
    const WINDOW_DAYS = 30;

    // The next time this day and month comes round, and how far away it is.
    // Returning the date as well as the distance lets the anniversary count the
    // years correctly across a December to January wrap.
    const nextOccurrence = (isoDate: string): { date: Date; daysAway: number } => {
      const d = new Date(isoDate + "T00:00:00Z");
      let next = new Date(Date.UTC(today.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      if (next < today) {
        next = new Date(Date.UTC(today.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()));
      }
      return { date: next, daysAway: Math.round((next.getTime() - today.getTime()) / 86400000) };
    };

    const nameParts = (e: typeof allEmps[number]) => ({
      id: e.Id,
      firstName: e.First_Name__c || e.Name.split(" ")[0],
      lastName: e.Last_Name__c || e.Name.split(" ")[1] || "",
      name: e.Name,
      department: e.Department__c || "",
    });

    const birthdays = [];
    const anniversaries = [];

    for (const e of allEmps) {
      if (e.DOB__c) {
        const { daysAway } = nextOccurrence(e.DOB__c);
        if (daysAway <= WINDOW_DAYS) {
          birthdays.push({ employee: nameParts(e), daysAway, date: e.DOB__c });
        }
      }
      if (e.Date_of_Joining__c) {
        const { date, daysAway } = nextOccurrence(e.Date_of_Joining__c);
        const joined = new Date(e.Date_of_Joining__c + "T00:00:00Z");
        // Years completed on the anniversary itself, so someone who joined in
        // 2022 reads as 4 years on the day, not 4 years from January.
        const years = date.getUTCFullYear() - joined.getUTCFullYear();
        // A joiner in their first month has an "anniversary" of zero years,
        // which is a start date, not something to celebrate.
        if (daysAway <= WINDOW_DAYS && years > 0) {
          anniversaries.push({
            employee: nameParts(e),
            daysAway,
            years,
            date: e.Date_of_Joining__c,
          });
        }
      }
    }

    birthdays.sort((a, b) => a.daysAway - b.daysAway);
    anniversaries.sort((a, b) => a.daysAway - b.daysAway);

    // Who is away today and who is remote. The dashboard used to state
    // "Everyone is at office!" as a hardcoded string, whatever the truth.
    const outToday = await getWhoIsOutToday();
    const isRemote = (l: typeof outToday[number]) => {
      const code = (l.Leave_Type__r?.Code__c || "").toUpperCase();
      const name = (l.Leave_Type__r?.Name || "").toLowerCase();
      return code === "WFH" || name.includes("work from home") || name.includes("remote");
    };
    const describe = (l: typeof outToday[number]) => ({
      id: l.Id,
      name: l.Employee__r?.Name || "Unknown",
      department: l.Employee__r?.Department__c || "",
      leaveType: l.Leave_Type__r?.Name || "Leave",
      halfDay: l.Half_Day__c === true,
      fromDate: l.From_Date__c,
      toDate: l.To_Date__c,
    });
    const workingRemotely = outToday.filter(isRemote).map(describe);
    const onLeaveToday = outToday.filter(l => !isRemote(l)).map(describe);
    
    // Fetch Holidays
    const holidaysData = await getHolidays();
    const holidays = holidaysData.map(h => ({
      id: h.Id,
      name: h.Name,
      date: h.Date__c,
      type: h.Type__c
    }));
    
    return NextResponse.json({
      birthdays,
      anniversaries,
      workingRemotely,
      onLeaveToday,
      teamOnLeave,
      directReportsLeaves,
      holidays,
      source: "salesforce",
    });
  } catch (err) {
    if (err instanceof StaleSessionError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("Salesforce dashboard fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 });
  }
}
