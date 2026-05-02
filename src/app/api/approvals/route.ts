import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/mock-data";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") {
    return NextResponse.json({ approvals: db.getPendingApprovals(session.user.id) });
  }
  // Admin sees all pending
  const all = db.getAllLeaveRequests().filter(r => r.status === "Pending");
  return NextResponse.json({ approvals: all });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { requestId, action } = await req.json();
  if (!requestId || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const result = action === "approve"
    ? db.approveLeave(requestId, session.user.id)
    : db.rejectLeave(requestId, session.user.id);

  if (!result) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  return NextResponse.json({ request: result, message: `Leave ${action}d successfully` });
}
