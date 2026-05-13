import { NextResponse } from "next/server";
import { query, createRecord } from "@/lib/salesforce";
import { auth } from "@/lib/auth";

// GET: Fetch regularization requests for the logged-in employee
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const requests = await query(`
      SELECT Id, Date__c, Requested_Clock_In__c, Requested_Clock_Out__c,
             Reason__c, Status__c, Approver__r.Name, CreatedDate
      FROM Regularization_Request__c
      WHERE Employee__c = '${session.user.id}'
      ORDER BY CreatedDate DESC
      LIMIT 50
    `);
    return NextResponse.json({ requests });
  } catch (err: any) {
    console.error("[Regularization GET]", err);
    return NextResponse.json({ error: "Failed to fetch requests" }, { status: 500 });
  }
}

// POST: Create a new regularization request
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    
    if (!body.date || !body.reason) {
      return NextResponse.json({ error: "Date and reason are required" }, { status: 400 });
    }

    // Get the employee's reporting manager for approver
    const employees = await query<any>(`
      SELECT Id, Reporting_Manager__c FROM Employee__c WHERE Id = '${session.user.id}'
    `);
    const emp = employees[0];

    const recordId = await createRecord("Regularization_Request__c", {
      Employee__c: session.user.id,
      Date__c: body.date,
      Requested_Clock_In__c: body.clockIn || null,
      Requested_Clock_Out__c: body.clockOut || null,
      Reason__c: body.reason,
      Status__c: "Submitted",
      Approver__c: emp?.Reporting_Manager__c || null,
    });

    return NextResponse.json({ id: recordId, message: "Regularization request submitted" }, { status: 201 });
  } catch (err: any) {
    console.error("[Regularization POST]", err);
    return NextResponse.json({ error: err.message || "Failed to submit request" }, { status: 500 });
  }
}
