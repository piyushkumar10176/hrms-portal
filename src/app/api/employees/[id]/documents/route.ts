import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/salesforce";
import { assertSalesforceId, InvalidSalesforceIdError } from "@/lib/soql";

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  // Middleware gates this path to admins, but the route enforces its own access
  // too: an employee may read their own documents, an admin may read anyone's.
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = await props.params;

  if (session.user.role !== "admin" && session.user.id !== params.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const employeeId = assertSalesforceId(params.id);
    const q = `
      SELECT Id, Document_Name__c, Document_Type__c, Verified__c, Expiry_Date__c, Content_Document_Id__c
      FROM Employee_Document__c
      WHERE Employee__c = '${employeeId}'
      ORDER BY CreatedDate DESC
    `;
    const documents = await query(q);
    return NextResponse.json({ documents });
  } catch (err) {
    if (err instanceof InvalidSalesforceIdError) {
      return NextResponse.json({ error: "Invalid employee id" }, { status: 400 });
    }
    console.error("Failed to fetch documents:", err);
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 });
  }
}
