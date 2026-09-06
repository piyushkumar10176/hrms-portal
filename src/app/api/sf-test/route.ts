import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSalesforceConnection, query } from "@/lib/salesforce";

export async function GET() {
  // Diagnostic endpoint: it reports the connected org and sample records, so it
  // must never be reachable anonymously. Admins only.
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const conn = await getSalesforceConnection();
    const employees = await query("SELECT Id, Name FROM Employee__c LIMIT 5");
    return NextResponse.json({ success: true, instanceUrl: conn.instanceUrl, employees });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
