import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEmployeeByEmail, getLeaveBalances } from '@/lib/salesforce-queries';
import { toLeaveBalanceView } from '@/lib/leave-balance';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sfEmp = await getEmployeeByEmail(session.user.email);
    const sfBalances = await getLeaveBalances(sfEmp.Id);
    
    const balances = sfBalances.map((b, i) => toLeaveBalanceView(b, i));

    return NextResponse.json({ balances, source: "salesforce" });
  } catch (err) {
    console.error("Salesforce getLeaveBalances error:", err);
    return NextResponse.json({ error: "Failed to fetch leave balances" }, { status: 500 });
  }
}
