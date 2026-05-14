import { NextResponse } from "next/server";
import { query, createRecord } from "@/lib/salesforce";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const loans = await query(`
      SELECT Id, Name, Type__c, Principal__c, Interest_Rate__c, Tenure_Months__c,
             EMI__c, Outstanding__c, Start_Date__c, End_Date__c, Status__c,
        (SELECT Id, Amount__c, Date__c FROM Repayments__r ORDER BY Date__c DESC LIMIT 12)
      FROM Loan__c
      WHERE Employee__c = '${session.user.id}'
      ORDER BY Start_Date__c DESC
    `);
    return NextResponse.json({ loans });
  } catch (err: any) {
    console.error("[Loans GET]", err);
    return NextResponse.json({ error: "Failed to fetch loans" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const id = await createRecord("Loan__c", {
      Name: body.name || `Loan - ${body.type}`,
      Employee__c: session.user.id,
      Type__c: body.type,
      Principal__c: body.principal,
      Interest_Rate__c: body.interestRate || 0,
      Tenure_Months__c: body.tenureMonths,
      EMI__c: body.emi,
      Outstanding__c: body.principal,
      Start_Date__c: body.startDate,
      Status__c: "Active",
    });
    return NextResponse.json({ id, message: "Loan created" }, { status: 201 });
  } catch (err: any) {
    console.error("[Loans POST]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
