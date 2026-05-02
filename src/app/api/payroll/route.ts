import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/mock-data";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");

  if (month) {
    const slip = db.getPayslip(session.user.id, month);
    return NextResponse.json({ payslip: slip });
  }

  const payslips = db.getPayslips(session.user.id);
  const latest = db.getLatestPayslip(session.user.id);
  return NextResponse.json({ payslips, latest });
}
