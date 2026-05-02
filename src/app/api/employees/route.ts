import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/mock-data";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ employees: db.getAllEmployees() });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  
  const emp = db.addEmployee({
    employeeId: `EMP${String(db.getAllEmployees().length + 1).padStart(3, "0")}`,
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email,
    phone: body.phone || "",
    department: body.department,
    designation: body.designation,
    dateOfJoining: body.dateOfJoining || new Date().toISOString().split("T")[0],
    reportingManagerId: body.reportingManagerId || "1",
    role: body.role || "employee",
    status: "Active",
    password: "", // Empty until they set it via invite
    inviteToken: token,
    gender: body.gender,
    city: body.city,
    dateOfBirth: body.dateOfBirth,
    address: body.address,
  });

  const inviteLink = `${req.headers.get("origin")}/setup-password/${token}`;
  
  // Mock Email Sending
  console.log(`\n============================`);
  console.log(`📧 MOCK EMAIL SENT TO: ${emp.email}`);
  console.log(`Subject: Welcome to HRMS! Please setup your account`);
  console.log(`Body: Click here to set your password and log in: ${inviteLink}`);
  console.log(`============================\n`);

  return NextResponse.json({ employee: emp, inviteLink }, { status: 201 });
}
