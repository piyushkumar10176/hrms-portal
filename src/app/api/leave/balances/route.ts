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
    
    const colors = ["#4F46E5", "#10B981", "#F59E0B", "#EF4444"];
    const balances = sfBalances.map((b, i) => ({
      id: b.Id,
      leaveType: b.Leave_Type__r?.Name || "Leave",
      code: b.Leave_Type__r?.Code__c || (b.Leave_Type__r?.Name ? b.Leave_Type__r.Name.substring(0, 2).toUpperCase() : "LV"),
      total: (b.Accrued__c || 0) + (b.Opening_Balance__c || 0),
      used: (b.Availed__c || 0),
      available: ((b.Accrued__c || 0) + (b.Opening_Balance__c || 0)) - (b.Availed__c || 0),
      color: colors[i % colors.length]
    }));
    
    
    return NextResponse.json({ balances, source: "salesforce" });
  } catch (err) {
    console.error("Salesforce getLeaveBalances error:", err);
    return NextResponse.json({ error: "Failed to fetch leave balances" }, { status: 500 });
  }
}
