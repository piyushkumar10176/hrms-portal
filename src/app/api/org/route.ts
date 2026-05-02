import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/mock-data";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tree = db.getOrgTree();
  const employees = db.getAllEmployees().map(e => ({
    id: e.id, firstName: e.firstName, lastName: e.lastName, employeeId: e.employeeId,
    department: e.department, designation: e.designation, email: e.email,
    dateOfJoining: e.dateOfJoining, managerId: e.reportingManagerId,
    managerName: e.reportingManagerId ? (() => { const m = db.getEmployee(e.reportingManagerId); return m ? `${m.firstName} ${m.lastName}` : null; })() : null,
    directReports: db.getDirectReports(e.id).map(r => ({ id: r.id, name: `${r.firstName} ${r.lastName}`, designation: r.designation })),
  }));
  return NextResponse.json({ tree, employees });
}
