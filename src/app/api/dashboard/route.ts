import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/mock-data";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  return NextResponse.json({ birthdays, teamOnLeave, directReportsLeaves });
}
