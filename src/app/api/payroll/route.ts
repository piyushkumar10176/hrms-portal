import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEmployeeByEmail, getPayslips } from "@/lib/salesforce-queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const emp = await getEmployeeByEmail(session.user.email);
    const payslips = await getPayslips(emp.Id);
    
    return NextResponse.json({ 
      payslips, 
      latest: payslips.length > 0 ? payslips[0] : null, 
      source: "salesforce" 
    });
  } catch (err) {
    console.error("Payroll API Error:", err);
    return NextResponse.json({ error: "Failed to fetch payslips" }, { status: 500 });
  }
}
