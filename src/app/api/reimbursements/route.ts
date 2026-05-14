import { NextResponse } from "next/server";
import { query, createRecord } from "@/lib/salesforce";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const reimbursements = await query(`
      SELECT Id, Name, Component__r.Name, Amount_Claimed__c, Amount_Approved__c,
             Status__c, Cycle__r.Name, CreatedDate
      FROM Reimbursement__c
      WHERE Employee__c = '${session.user.id}'
      ORDER BY CreatedDate DESC
      LIMIT 50
    `);
    return NextResponse.json({ reimbursements });
  } catch (err: any) {
    console.error("[Reimbursements GET]", err);
    return NextResponse.json({ error: "Failed to fetch reimbursements" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const id = await createRecord("Reimbursement__c", {
      Name: body.name,
      Employee__c: session.user.id,
      Component__c: body.componentId || null,
      Amount_Claimed__c: body.amount,
      Status__c: "Submitted",
    });
    return NextResponse.json({ id, message: "Reimbursement submitted" }, { status: 201 });
  } catch (err: any) {
    console.error("[Reimbursements POST]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
