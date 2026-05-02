import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/mock-data";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const salaries = db.getAllSalaries();
  const employees = db.getAllEmployees();
  const data = salaries.map(s => {
    const emp = employees.find(e => e.id === s.employeeId);
    return { ...s, employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown", designation: emp?.designation || "" };
  });
  return NextResponse.json({ salaries: data });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { employeeId, basic, hra, conveyance, medical, special, effectiveFrom } = await req.json();
  if (!employeeId || !basic) return NextResponse.json({ error: "Employee and basic salary are required" }, { status: 400 });
  const gross = (basic || 0) + (hra || 0) + (conveyance || 0) + (medical || 0) + (special || 0);
  
  // Find old gross for history description
  const oldSal = db.getSalary(employeeId);
  const oldGross = oldSal ? oldSal.gross : 0;
  
  const sal = db.setSalary(employeeId, { basic, hra: hra || 0, conveyance: conveyance || 0, medical: medical || 0, special: special || 0, gross, effectiveFrom: effectiveFrom || new Date().toISOString().split("T")[0] });
  
  // Create history record in Salesforce
  if (oldGross !== sal.gross) {
    const desc = oldGross > 0 
      ? `Gross salary revised from ₹${oldGross.toLocaleString("en-IN")} to ₹${sal.gross.toLocaleString("en-IN")}`
      : `Initial salary structure set to ₹${sal.gross.toLocaleString("en-IN")} gross`;
      
    // Find the Salesforce Employee__c ID for this user ID
    const emp = db.getEmployee(employeeId);
    if (emp && emp.employeeId) {
      const { createHistoryRecord } = await import("@/lib/salesforce-queries");
      await createHistoryRecord({
        employeeId: emp.employeeId,
        date: new Date().toISOString().split("T")[0],
        type: "Salary Revision",
        description: desc
      });
    }
  }
  
  return NextResponse.json({ salary: sal, message: "Salary updated successfully" });
}
