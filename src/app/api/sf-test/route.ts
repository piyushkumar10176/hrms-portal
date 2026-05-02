import { NextResponse } from "next/server";
import { getSalesforceConnection, query } from "@/lib/salesforce";

export async function GET() {
  try {
    const conn = await getSalesforceConnection();
    const employees = await query("SELECT Id, Name FROM Employee__c LIMIT 5");
    return NextResponse.json({ success: true, instanceUrl: conn.instanceUrl, employees });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
