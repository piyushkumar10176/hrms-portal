import { NextResponse } from "next/server";
import { query } from "@/lib/salesforce";
import { auth } from "@/lib/auth";
import { assertSalesforceId } from "@/lib/soql";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const assets = await query(`
      SELECT Id, Name, Asset_Tag__c, Type__c, Status__c, Serial_Number__c,
             Purchase_Date__c, Purchase_Value__c
      FROM Asset__c
      WHERE Assigned_To__c = '${assertSalesforceId(session.user.id)}'
      ORDER BY Name ASC
    `);
    return NextResponse.json({ assets });
  } catch (err) {
    console.error("[Assets GET]", err);
    return NextResponse.json({ error: "Failed to fetch assets" }, { status: 500 });
  }
}
