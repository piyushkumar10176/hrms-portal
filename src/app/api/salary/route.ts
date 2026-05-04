import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  
  // Salesforce Salary schema not yet implemented, returning empty
  return NextResponse.json({ salaries: [], source: "salesforce" });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  
  return NextResponse.json({ error: "Salary objects not yet deployed in Salesforce" }, { status: 501 });
}
