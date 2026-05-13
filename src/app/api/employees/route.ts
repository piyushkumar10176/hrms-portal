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
      department: emp.Department_Ref__r?.Name || emp.Department__c || "Unassigned",
      designation: emp.Designation_Ref__r?.Name || emp.Designation__c || "Unassigned",
      status: emp.Employee_Status__c,
      dateOfJoining: emp.Date_of_Joining__c,
      employmentType: emp.Employment_Type__c || "Full-Time",
      probationEndDate: emp.Probation_End_Date__c,
      confirmationDate: emp.Confirmation_Date__c,
      resignationDate: emp.Resignation_Date__c,
      lwd: emp.LWD__c,
      reportingManager: emp.Reporting_Manager__r?.Name || "-",
      reportingManagerId: emp.Reporting_Manager__c || null,
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
  // Token expires in 7 days
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  
  try {
    const sfId = await createRecord("Employee__c", {
      First_Name__c: body.firstName,
      Last_Name__c: body.lastName,
      Name: `${body.firstName} ${body.lastName}`,
      Official_Email__c: body.email,
      Mobile__c: body.phone,
      Department_Ref__c: body.departmentId || null,
      Designation_Ref__c: body.designationId || null,
      Date_of_Joining__c: body.dateOfJoining || new Date().toISOString().split("T")[0],
      Employment_Type__c: body.employmentType || "Full-Time",
      Probation_End_Date__c: body.probationEndDate || null,
      Confirmation_Date__c: body.confirmationDate || null,
      Resignation_Date__c: body.resignationDate || null,
      LWD__c: body.lwd || null,
      DOB__c: body.dateOfBirth || null,
      Reporting_Manager__c: body.reportingManagerId || null,
      Role__c: body.role === "admin" ? "Admin" : "Employee",
      Employee_Status__c: "Active",
      Gender__c: body.gender,
      Invite_Token__c: token,
      Invite_Token_Expires_At__c: expiresAt,
    });
    
    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const inviteLink = `${baseUrl}/setup-password/${token}`;

    console.log(`\n============================`);
    console.log(`📧 INVITE SENT TO: ${body.email}`);
    console.log(`Subject: Welcome to HRMS! Please setup your account`);
    console.log(`Body: Click here to set your password and log in: ${inviteLink}`);
    console.log(`Salesforce Record ID: ${sfId}`);
    console.log(`Token expires: ${expiresAt}`);
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
