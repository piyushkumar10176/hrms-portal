import { NextResponse } from "next/server";
import { query } from "@/lib/salesforce";

export async function GET() {
  try {
    const assets = await query(`
      SELECT Id, Name, Asset_Tag__c, Type__c, Status__c, Serial_Number__c,
             Assigned_To__r.Name, Purchase_Date__c, Purchase_Value__c
      FROM Asset__c
      ORDER BY Name ASC
      LIMIT 200
    `);
    return NextResponse.json({ assets });
  } catch (err: any) {
    console.error("[Admin Assets GET]", err);
    return NextResponse.json({ error: "Failed to fetch assets" }, { status: 500 });
  }
}
