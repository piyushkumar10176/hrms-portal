import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/mock-data";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = db.getTodayAttendance(session.user.id);
  return NextResponse.json({ today });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action } = await req.json();

  if (action === "clockIn") {
    const record = db.clockIn(session.user.id);
    return NextResponse.json({ record, message: "Clocked in successfully" });
  } else if (action === "clockOut") {
    const record = db.clockOut(session.user.id);
    if (!record) return NextResponse.json({ error: "Not clocked in" }, { status: 400 });
    return NextResponse.json({ record, message: "Clocked out successfully" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
