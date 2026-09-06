import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSalesforceConnection, query } from "@/lib/salesforce";
import { safeErrorMessage } from "@/lib/api-error";

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
  } catch (error) {
    console.error("[sf-test] Connection check failed:", error);
    return NextResponse.json(
      { success: false, error: safeErrorMessage(error, "Salesforce connection check failed") },
      { status: 500 }
    );
  }
}
