import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/mock-data";
import { getEmployeeByEmail } from "@/lib/salesforce-queries";

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
      firstName: sfEmp.First_Name__c || sfEmp.Name.split(" ")[0],
      lastName: sfEmp.Last_Name__c || sfEmp.Name.split(" ")[1] || "",
      email: sfEmp.Official_Email__c,
      phone: sfEmp.Mobile__c || "",
      department: sfEmp.Department__r?.Name || sfEmp.Department__c || "",
      designation: sfEmp.Designation__r?.Name || sfEmp.Designation__c || "",
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

    // Get mock history for now
    const history = db.getHistory(session.user.id);
    return NextResponse.json({ employee: emp, history });

  } catch (error) {
    console.error("Salesforce fetch error, falling back to mock data:", error);
    
    // Fallback to mock data if Salesforce query fails
    const emp = db.getEmployee(session.user.id);
    if (!emp) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const history = db.getHistory(session.user.id);
    return NextResponse.json({ employee: emp, history });
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  
  // Restrict what an employee can self-edit
  const allowedUpdates = {
    phone: body.phone,
    dateOfBirth: body.dateOfBirth,
    gender: body.gender,
    address: body.address,
    city: body.city,
    bankName: body.bankName,
    accountNumber: body.accountNumber,
    ifscCode: body.ifscCode,
    panNumber: body.panNumber,
    aadharNumber: body.aadharNumber
  };

  const updated = db.updateEmployee(session.user.id, allowedUpdates);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ employee: updated }, { status: 200 });
}
