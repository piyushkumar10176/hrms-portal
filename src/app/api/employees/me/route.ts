import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEmployeeByEmail } from "@/lib/salesforce-queries";
import { updateRecord } from "@/lib/salesforce";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Attempt to fetch from Salesforce
    const sfEmp = await getEmployeeByEmail(session.user.email);
    
    // Map Salesforce fields to the frontend Employee interface
    const emp = {
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
      address: "", // Not natively in the SF schema above, could add custom logic
      bankName: sfEmp.Bank_Name__c,
      accountNumber: sfEmp.Bank_Account_Number__c,
      ifscCode: sfEmp.IFSC_Code__c,
      panNumber: sfEmp.PAN__c,
      aadharNumber: sfEmp.Aadhaar__c,
      role: session.user.role // Preserve role from session
    };

    // Get history from Salesforce only
    const { getHistoryRecords } = await import("@/lib/salesforce-queries");
    const history = await getHistoryRecords(sfEmp.Id);
    
    return NextResponse.json({ employee: emp, history });

  } catch (error) {
    console.error("Salesforce fetch error:", error);
    return NextResponse.json({ error: "Not found or error fetching profile" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  
  // Restrict what an employee can self-edit and map to SF fields
  const allowedUpdates: Record<string, any> = {};
  if (body.phone !== undefined) allowedUpdates.Mobile__c = body.phone;
  if (body.dateOfBirth !== undefined) allowedUpdates.DOB__c = body.dateOfBirth;
  if (body.gender !== undefined) allowedUpdates.Gender__c = body.gender;
  if (body.bankName !== undefined) allowedUpdates.Bank_Name__c = body.bankName;
  if (body.accountNumber !== undefined) allowedUpdates.Bank_Account_Number__c = body.accountNumber;
  if (body.ifscCode !== undefined) allowedUpdates.IFSC_Code__c = body.ifscCode;
  if (body.panNumber !== undefined) allowedUpdates.PAN__c = body.panNumber;
  if (body.aadharNumber !== undefined) allowedUpdates.Aadhaar__c = body.aadharNumber;

  if (Object.keys(allowedUpdates).length === 0) {
    return NextResponse.json({ error: "No editable fields supplied" }, { status: 400 });
  }

  try {
    const sfEmp = await getEmployeeByEmail(session.user.email);
    await updateRecord("Employee__c", sfEmp.Id, allowedUpdates);
    
    // Fetch fresh employee data to return
    const updatedSfEmp = await getEmployeeByEmail(session.user.email);
    
    const emp = {
      id: updatedSfEmp.Id,
      employeeId: updatedSfEmp.Employee_Code__c || updatedSfEmp.Id,
      firstName: updatedSfEmp.First_Name__c || updatedSfEmp.Name?.split(" ")?.[0] || "",
      lastName: updatedSfEmp.Last_Name__c || updatedSfEmp.Name?.split(" ")?.[1] || "",
      email: updatedSfEmp.Official_Email__c,
      phone: updatedSfEmp.Mobile__c || "",
      department: updatedSfEmp.Department__c || "",
      designation: updatedSfEmp.Designation__c || "",
      dateOfJoining: updatedSfEmp.Date_of_Joining__c || "",
      reportingManagerId: updatedSfEmp.Reporting_Manager__c || null,
      status: updatedSfEmp.Employee_Status__c,
      gender: updatedSfEmp.Gender__c,
      dateOfBirth: updatedSfEmp.DOB__c,
      address: "", 
      bankName: updatedSfEmp.Bank_Name__c,
      accountNumber: updatedSfEmp.Bank_Account_Number__c,
      ifscCode: updatedSfEmp.IFSC_Code__c,
      panNumber: updatedSfEmp.PAN__c,
      aadharNumber: updatedSfEmp.Aadhaar__c,
      role: session.user.role
    };

    return NextResponse.json({ employee: emp }, { status: 200 });
  } catch (error) {
    console.error("Salesforce update error:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
