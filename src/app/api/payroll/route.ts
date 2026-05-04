import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Salesforce Payslip schema not yet implemented, returning empty
  return NextResponse.json({ payslips: [], latest: null, source: "salesforce" });
}
