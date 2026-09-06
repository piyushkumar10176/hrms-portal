import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLeaveBalances } from '@/lib/salesforce-queries';
import { toLeaveBalanceView } from '@/lib/leave-balance';
import { getSessionEmployee, StaleSessionError } from "@/lib/session-employee";

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sfEmp = await getSessionEmployee(session);
    const sfBalances = await getLeaveBalances(sfEmp.Id);
    
    const balances = sfBalances.map((b, i) => toLeaveBalanceView(b, i));

    return NextResponse.json({ balances, source: "salesforce" });
  } catch (err) {
    if (err instanceof StaleSessionError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("Salesforce getLeaveBalances error:", err);
    return NextResponse.json({ error: "Failed to fetch leave balances" }, { status: 500 });
  }
}
