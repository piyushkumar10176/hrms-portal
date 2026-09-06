import { NextResponse } from "next/server";
import { query, createRecord } from "@/lib/salesforce";
import { auth } from "@/lib/auth";
import { assertSalesforceId } from "@/lib/soql";
import { safeErrorMessage } from "@/lib/api-error";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const loans = await query(`
      SELECT Id, Name, Type__c, Principal__c, Interest_Rate__c, Tenure_Months__c,
             EMI__c, Outstanding__c, Start_Date__c, End_Date__c, Status__c,
        (SELECT Id, Amount__c, Date__c FROM Repayments__r ORDER BY Date__c DESC LIMIT 12)
      FROM Loan__c
      WHERE Employee__c = '${assertSalesforceId(session.user.id)}'
      ORDER BY Start_Date__c DESC
    `);
    return NextResponse.json({ loans });
  } catch (err) {
    console.error("[Loans GET]", err);
    return NextResponse.json({ error: "Failed to fetch loans" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    
    // Calculate End_Date__c based on Start_Date__c and Tenure_Months__c
    let endDate = null;
    if (body.startDate && body.tenureMonths) {
      const start = new Date(body.startDate);
      start.setMonth(start.getMonth() + parseInt(body.tenureMonths, 10));
      endDate = start.toISOString().split("T")[0];
    }

    const id = await createRecord("Loan__c", {
      Name: body.name || `Loan - ${body.type}`,
      Employee__c: body.employeeId || session.user.id, // Allow admin to create for someone else
      Type__c: body.type,
      Principal__c: body.principal,
      Interest_Rate__c: body.interestRate || 0,
      Tenure_Months__c: body.tenureMonths,
      EMI__c: body.emi,
      Outstanding__c: body.principal,
      Start_Date__c: body.startDate,
      End_Date__c: endDate,
      Status__c: "Active",
    });
    return NextResponse.json({ id, message: "Loan created" }, { status: 201 });
  } catch (err) {
    console.error("[Loans POST]", err);
    return NextResponse.json({ error: safeErrorMessage(err, "Request failed") }, { status: 500 });
  }
}
