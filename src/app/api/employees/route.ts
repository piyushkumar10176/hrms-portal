import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createRecord } from "@/lib/salesforce";
import { getAllEmployees } from "@/lib/salesforce-queries";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const sfEmployees = await getAllEmployees();
    const employees = sfEmployees.map(emp => ({
      id: emp.Id,
      employeeId: emp.Employee_Code__c || emp.Id,
      firstName: emp.First_Name__c || "",
      lastName: emp.Last_Name__c || "",
      email: emp.Official_Email__c,
      department: emp.Department__c || "Unassigned",
      designation: emp.Designation__c || "Unassigned",
      status: emp.Employee_Status__c,
      dateOfJoining: emp.Date_of_Joining__c,
      reportingManager: emp.Reporting_Manager__r?.Name || "-",
      role: emp.Role__c ? emp.Role__c.toLowerCase() : "employee",
    }));
    return NextResponse.json({ employees, source: "salesforce" });
  } catch (err) {
    console.error("Salesforce getAllEmployees error:", err);
    return NextResponse.json({ error: "Failed to fetch employees" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const token = randomUUID();
  
  try {
    const sfId = await createRecord("Employee__c", {
      First_Name__c: body.firstName,
      Last_Name__c: body.lastName,
      Name: `${body.firstName} ${body.lastName}`,
      Official_Email__c: body.email,
      Mobile__c: body.phone,
      Department__c: body.department, // Assuming it's text for now, ideally picklist or lookup
      Designation__c: body.designation,
      Date_of_Joining__c: body.dateOfJoining || new Date().toISOString().split("T")[0],
      Employee_Status__c: "Active",
      Gender__c: body.gender
    });
    
    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const inviteLink = `${baseUrl}/setup-password/${token}`;
    
    // In a real app we would send the email or create a user in auth DB
    // Currently relying on local DB for auth
    const { db } = await import("@/lib/mock-data");
    db.addEmployee({
      employeeId: sfId,
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      phone: body.phone || "",
      department: body.department,
      designation: body.designation,
      dateOfJoining: body.dateOfJoining || new Date().toISOString().split("T")[0],
      reportingManagerId: body.reportingManagerId || null,
      role: body.role || "employee",
      status: "Active",
      password: "", // Empty until they set it via invite
      inviteToken: token,
      gender: body.gender,
      city: body.city,
      dateOfBirth: body.dateOfBirth,
      address: body.address,
    });

    console.log(`\n============================`);
    console.log(`📧 MOCK EMAIL SENT TO: ${body.email}`);
    console.log(`Subject: Welcome to HRMS! Please setup your account`);
    console.log(`Body: Click here to set your password and log in: ${inviteLink}`);
    console.log(`Salesforce Record ID: ${sfId}`);
    console.log(`============================\n`);

    return NextResponse.json({ 
      employee: { id: sfId, firstName: body.firstName, lastName: body.lastName, email: body.email },
      inviteLink,
      source: "salesforce"
    }, { status: 201 });

  } catch (err) {
    console.error("Salesforce create employee error:", err);
    return NextResponse.json({ error: "Failed to create employee" }, { status: 500 });
  }
}
