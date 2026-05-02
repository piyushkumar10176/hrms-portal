import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/mock-data";
import { createRecord } from "@/lib/salesforce";
import { getAllEmployees } from "@/lib/salesforce-queries";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const sfEmployees = await getAllEmployees();
    if (sfEmployees && sfEmployees.length > 0) {
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
        role: emp.Name === "Admin User" ? "admin" : "employee",
      }));
      return NextResponse.json({ employees, source: "salesforce" });
    }
  } catch (err) {
    console.error("Salesforce getAllEmployees fallback:", err);
  }

  return NextResponse.json({ employees: db.getAllEmployees(), source: "local" });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  
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
    
    // We would store the invite token securely in a Custom Setting or external DB, but for now we log it
    const inviteLink = `${req.headers.get("origin")}/setup-password/${token}`;
    
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
    console.error("Salesforce create employee fallback:", err);
  }

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

  return NextResponse.json({ employee: emp, inviteLink, source: "local" }, { status: 201 });
}
