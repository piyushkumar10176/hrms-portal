import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPayslips, getSalaryStructure, getTaxDeclaration, getPayrollCycles } from "@/lib/salesforce-queries";
import { getSessionEmployee, StaleSessionError } from "@/lib/session-employee";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const emp = await getSessionEmployee(session);
    const [payslips, salaryStructure, taxDeclaration, payrollCycles] = await Promise.all([
      getPayslips(emp.Id),
      getSalaryStructure(emp.Id),
      getTaxDeclaration(emp.Id),
      getPayrollCycles(),
    ]);
    
    return NextResponse.json({ 
      payslips, 
      salaryStructure,
      taxDeclaration,
      payrollCycles,
      latest: payslips.length > 0 ? payslips[0] : null, 
      source: "salesforce" 
    });
  } catch (err) {
    if (err instanceof StaleSessionError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("Payroll API Error:", err);
    return NextResponse.json({ error: "Failed to fetch payroll data" }, { status: 500 });
  }
}
