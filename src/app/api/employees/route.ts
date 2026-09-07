import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createRecord } from "@/lib/salesforce";
import { getAllEmployees } from "@/lib/salesforce-queries";
import { issueInvite } from "@/lib/invite";

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

  // Minimum needed to create a usable record. Everything else can be filled in
  // afterwards on the employee's own record, which is how HR actually works: the
  // name and address arrive first, the bank details and identifiers later.
  if (!body.firstName || !body.lastName || !body.email) {
    return NextResponse.json(
      { error: "First name, last name and email are required." },
      { status: 400 }
    );
  }

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
    });

    // The invite is issued and actually emailed. This route previously built a
    // link and wrote it to the log only outside production, so in production a
    // new employee could never learn how to set their password.
    const invite = await issueInvite(
      sfId,
      body.firstName,
      body.email,
      req.nextUrl.origin
    );

    return NextResponse.json({
      employee: { id: sfId, firstName: body.firstName, lastName: body.lastName, email: body.email },
      // Returned so an admin can pass the link on by hand while no mail
      // provider is configured. It is shown to an admin who just created the
      // record, and to nobody else.
      inviteLink: invite.link,
      inviteExpiresAt: invite.expiresAt,
      inviteEmailed: invite.email.sent,
      inviteEmailError: invite.email.sent ? undefined : invite.email.error,
      source: "salesforce"
    }, { status: 201 });

  } catch (err) {
    console.error("Salesforce create employee error:", err);
    return NextResponse.json({ error: "Failed to create employee" }, { status: 500 });
  }
}
