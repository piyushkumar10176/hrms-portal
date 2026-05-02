import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/mock-data";
import { getEmployeeByEmail, getTeamMembers, getTeamLeaveCalendar, getLeaveBalances } from "@/lib/salesforce-queries";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sfEmp = await getEmployeeByEmail(session.user.email);
    if (sfEmp) {
      // Get Team Members
      const reports = await getTeamMembers(sfEmp.Id);
      
      let directReportsLeaves: any[] = [];
      let teamOnLeave: any[] = [];
      
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
        
        for (const r of reports) {
          const balances = await getLeaveBalances(r.Id);
          const formattedBalances = balances.map(b => ({
            leaveType: b.Leave_Type__r?.Name || "Leave",
            total: b.Accrued__c + b.Opening_Balance__c,
            used: b.Availed__c,
            available: b.Closing_Balance__c
          }));
          const usedLeaves = formattedBalances.reduce((sum, b) => sum + b.used, 0);
          const totalLeaves = formattedBalances.reduce((sum, b) => sum + b.total, 0);
          
          directReportsLeaves.push({
            id: r.Id,
            name: r.Name,
            designation: r.Designation__r?.Name || r.Designation__c || "Employee",
            usedLeaves,
            totalLeaves,
            balances: formattedBalances
          });
        }
      }
      
      // We don't have DOB__c in Employee yet or it might be empty, so returning empty array for SF
      const birthdays: any[] = [];
      
      return NextResponse.json({ birthdays, teamOnLeave, directReportsLeaves, source: "salesforce" });
    }
  } catch (err) {
    console.error("Salesforce dashboard fallback:", err);
  }

  const birthdays = db.getUpcomingBirthdays();
  const teamOnLeave = db.getTeamOnLeave(session.user.id);
  
  let directReportsLeaves: any[] = [];
  const reports = db.getDirectReports(session.user.id);
  
  if (reports.length > 0) {
    directReportsLeaves = reports.map(emp => {
      const balances = db.getLeaveBalances(emp.id);
      const usedLeaves = balances.reduce((sum, b) => sum + b.used, 0);
      const totalLeaves = balances.reduce((sum, b) => sum + b.total, 0);
      return {
        id: emp.id,
        name: `${emp.firstName} ${emp.lastName}`,
        designation: emp.designation,
        usedLeaves,
        totalLeaves,
        balances
      };
    });
  }

  return NextResponse.json({ birthdays, teamOnLeave, directReportsLeaves, source: "local" });
}
