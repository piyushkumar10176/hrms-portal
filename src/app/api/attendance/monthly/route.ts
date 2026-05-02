import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/mock-data";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
  const month = parseInt(searchParams.get("month") || String(new Date().getMonth()));
  const empId = session.user.role === "admin" && searchParams.get("employeeId")
    ? searchParams.get("employeeId")! : session.user.id;

  const records = db.getAttendanceForMonth(empId, year, month);
  const present = records.filter(r => r.status === "Present").length;
  const absent = records.filter(r => r.status === "Absent").length;
  const leaves = records.filter(r => r.status === "Leave").length;

  return NextResponse.json({ records, summary: { present, absent, leaves, total: records.length } });
}
