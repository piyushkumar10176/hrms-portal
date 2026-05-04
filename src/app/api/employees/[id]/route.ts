import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEmployeeById, getHistoryRecords } from "@/lib/salesforce-queries";
import { updateRecord } from "@/lib/salesforce";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const resolvedParams = await params;
  const id = resolvedParams.id;
  
  try {
    const sfEmp = await getEmployeeById(id);
    
    const publicEmp = {
      id: sfEmp.Id,
      employeeId: sfEmp.Employee_Code__c || sfEmp.Id,
      firstName: sfEmp.First_Name__c || sfEmp.Name?.split(" ")?.[0] || "",
      lastName: sfEmp.Last_Name__c || sfEmp.Name?.split(" ")?.[1] || "",
      email: sfEmp.Official_Email__c,
      phone: sfEmp.Mobile__c || "",
      department: sfEmp.Department__c || "",
      designation: sfEmp.Designation__c || "",
      dateOfJoining: sfEmp.Date_of_Joining__c || "",
      reportingManagerId: sfEmp.Reporting_Manager__c || null,
      status: sfEmp.Employee_Status__c,
      gender: sfEmp.Gender__c,
      dateOfBirth: sfEmp.DOB__c,
      bankName: sfEmp.Bank_Name__c,
      accountNumber: sfEmp.Bank_Account_Number__c,
      ifscCode: sfEmp.IFSC_Code__c,
      panNumber: sfEmp.PAN__c,
      aadharNumber: sfEmp.Aadhaar__c,
      role: sfEmp.Role__c?.toLowerCase() || "employee"
    };

    const history = await getHistoryRecords(id);
    return NextResponse.json({ employee: publicEmp, history });
  } catch (err) {
    console.error("Salesforce getEmployeeById error:", err);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
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
  
  // Whitelist allowed fields to Salesforce mapping
  const allowedUpdates: Record<string, any> = {};
  if (body.firstName !== undefined) allowedUpdates.First_Name__c = body.firstName;
  if (body.lastName !== undefined) allowedUpdates.Last_Name__c = body.lastName;
  if (body.phone !== undefined) allowedUpdates.Mobile__c = body.phone;
  if (body.department !== undefined) allowedUpdates.Department__c = body.department;
  if (body.designation !== undefined) allowedUpdates.Designation__c = body.designation;
  if (body.dateOfJoining !== undefined) allowedUpdates.Date_of_Joining__c = body.dateOfJoining;
  if (body.reportingManagerId !== undefined) allowedUpdates.Reporting_Manager__c = body.reportingManagerId;
  if (body.dateOfBirth !== undefined) allowedUpdates.DOB__c = body.dateOfBirth;
  if (body.gender !== undefined) allowedUpdates.Gender__c = body.gender;
  if (body.status !== undefined) allowedUpdates.Employee_Status__c = body.status;
  if (body.bankName !== undefined) allowedUpdates.Bank_Name__c = body.bankName;
  if (body.accountNumber !== undefined) allowedUpdates.Bank_Account_Number__c = body.accountNumber;
  if (body.ifscCode !== undefined) allowedUpdates.IFSC_Code__c = body.ifscCode;

  if (Object.keys(allowedUpdates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  try {
    await updateRecord("Employee__c", id, allowedUpdates);
    
    // Fetch updated record to return
    const sfEmp = await getEmployeeById(id);
    const updated = {
      id: sfEmp.Id,
      employeeId: sfEmp.Employee_Code__c || sfEmp.Id,
      firstName: sfEmp.First_Name__c || sfEmp.Name?.split(" ")?.[0] || "",
      lastName: sfEmp.Last_Name__c || sfEmp.Name?.split(" ")?.[1] || "",
      email: sfEmp.Official_Email__c,
      phone: sfEmp.Mobile__c || "",
      department: sfEmp.Department__c || "",
      designation: sfEmp.Designation__c || "",
      dateOfJoining: sfEmp.Date_of_Joining__c || "",
      reportingManagerId: sfEmp.Reporting_Manager__c || null,
      status: sfEmp.Employee_Status__c,
      gender: sfEmp.Gender__c,
      dateOfBirth: sfEmp.DOB__c,
      bankName: sfEmp.Bank_Name__c,
      accountNumber: sfEmp.Bank_Account_Number__c,
      ifscCode: sfEmp.IFSC_Code__c,
      panNumber: sfEmp.PAN__c,
      aadharNumber: sfEmp.Aadhaar__c,
      role: sfEmp.Role__c?.toLowerCase() || "employee"
    };

    return NextResponse.json({ employee: updated }, { status: 200 });
  } catch (err) {
    console.error("Salesforce updateEmployee error:", err);
    return NextResponse.json({ error: "Failed to update employee" }, { status: 500 });
  }
}
