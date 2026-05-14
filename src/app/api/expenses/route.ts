import { NextResponse } from "next/server";
import { query, createRecord } from "@/lib/salesforce";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const reports = await query(`
      SELECT Id, Name, Title__c, Total_Amount__c, Status__c, Submitted_On__c,
             Approver__r.Name, Notes__c, CreatedDate,
        (SELECT Id, Category__c, Description__c, Amount__c, Date__c, Receipt_URL__c
         FROM Lines__r ORDER BY Date__c DESC)
      FROM Expense_Report__c
      WHERE Employee__c = '${session.user.id}'
      ORDER BY CreatedDate DESC
      LIMIT 50
    `);
    return NextResponse.json({ reports });
  } catch (err: any) {
    console.error("[Expenses GET]", err);
    return NextResponse.json({ error: "Failed to fetch expenses" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const emps = await query<any>(`SELECT Reporting_Manager__c FROM Employee__c WHERE Id = '${session.user.id}'`);
    const mgr = emps[0]?.Reporting_Manager__c || null;

    const id = await createRecord("Expense_Report__c", {
      Employee__c: session.user.id,
      Title__c: body.title,
      Total_Amount__c: body.totalAmount || 0,
      Status__c: "Draft",
      Approver__c: mgr,
      Notes__c: body.notes || null,
    });
    return NextResponse.json({ id, message: "Expense report created" }, { status: 201 });
  } catch (err: any) {
    console.error("[Expenses POST]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
