import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEmployeeByEmail, getLeaveBalances } from '@/lib/salesforce-queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sfEmp = await getEmployeeByEmail(session.user.email);
    const sfBalances = await getLeaveBalances(sfEmp.Id);
    
    const balances = sfBalances.map(b => ({
      leaveType: b.Leave_Type__r?.Name || "Leave",
      total: b.Accrued__c + b.Opening_Balance__c,
      used: b.Availed__c,
      available: b.Closing_Balance__c
    }));
    
    // Provide some default balances if empty so UI looks good
    if (balances.length === 0) {
      return NextResponse.json({ balances: [
        { leaveType: "Annual Leave", total: 20, used: 0, available: 20 },
        { leaveType: "Sick Leave", total: 10, used: 0, available: 10 }
      ], source: "salesforce-default" });
    }
    
    return NextResponse.json({ balances, source: "salesforce" });
  } catch (err) {
    console.error("Salesforce getLeaveBalances error:", err);
    return NextResponse.json({ error: "Failed to fetch leave balances" }, { status: 500 });
  }
}
