import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/mock-data";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ requests: db.getLeaveRequests(session.user.id) });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { leaveType, fromDate, toDate, days, reason } = body;

  if (!leaveType || !fromDate || !toDate) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Check balance
  const balances = db.getLeaveBalances(session.user.id);
  const balance = balances.find(b => b.leaveType === leaveType);
  if (balance && balance.available < (days || 1)) {
    return NextResponse.json({ error: "Insufficient leave balance" }, { status: 400 });
  }

  const request = db.applyLeave({
    employeeId: session.user.id,
    leaveType, fromDate, toDate,
    days: days || 1,
    reason: reason || "",
  });

  return NextResponse.json({ request, message: "Leave request submitted. Your manager has been notified." }, { status: 201 });
}
