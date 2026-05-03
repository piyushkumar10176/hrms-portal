import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/mock-data";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const resolvedParams = await params;
  const id = resolvedParams.id;
  const emp = db.getEmployee(id);
  if (!emp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Return public employee info (without password/sensitive data)
  const { password, inviteToken, ...publicEmp } = emp;
  const history = db.getHistory(id);
  return NextResponse.json({ employee: publicEmp, history });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const resolvedParams = await params;
  const id = resolvedParams.id;
  
  if (!id) return NextResponse.json({ error: "Employee ID required" }, { status: 400 });

  const body = await req.json();
  
  // Whitelist allowed fields — prevent mass assignment of password, role, id, inviteToken, etc.
  const allowedFields = [
    "firstName", "lastName", "phone", "department", "designation",
    "dateOfJoining", "reportingManagerId", "dateOfBirth", "gender",
    "city", "address", "status", "bankName", "accountNumber", "ifscCode"
  ] as const;
  const sanitized: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body && body[key] !== undefined) sanitized[key] = body[key];
  }
  
  const updated = db.updateEmployee(id, sanitized);

  if (!updated) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  return NextResponse.json({ employee: updated }, { status: 200 });
}
