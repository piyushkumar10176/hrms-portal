import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEmployeeByEmail, getSalaryStructure } from "@/lib/salesforce-queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const emp = await getEmployeeByEmail(session.user.email);
    const structure = await getSalaryStructure(emp.Id);
    return NextResponse.json({ structure, source: "salesforce" });
  } catch (err) {
    console.error("Salary Structure API Error:", err);
    return NextResponse.json({ error: "Failed to fetch salary structure" }, { status: 500 });
  }
}
