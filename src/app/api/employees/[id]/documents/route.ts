import { NextResponse } from "next/server";
import { query } from "@/lib/salesforce";

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const q = `
      SELECT Id, Document_Name__c, Document_Type__c, Verified__c, Expiry_Date__c, Content_Document_Id__c
      FROM Employee_Document__c
      WHERE Employee__c = '${params.id}'
      ORDER BY CreatedDate DESC
    `;
    const documents = await query(q);
    return NextResponse.json({ documents });
  } catch (err: any) {
    console.error("Failed to fetch documents:", err);
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 });
  }
}
