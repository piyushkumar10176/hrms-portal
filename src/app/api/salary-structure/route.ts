import { NextResponse } from "next/server";
import { query } from "@/lib/salesforce";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const structures = await query(`
      SELECT Id, Name, Effective_From__c, Effective_To__c, Total_CTC__c, Status__c,
        (SELECT Id, Component__r.Name, Component__r.Type__c, Amount_Monthly__c, Amount_Annual__c, Percentage__c
         FROM Lines__r ORDER BY Component__r.Type__c, Component__r.Name)
      FROM Salary_Structure__c
      WHERE Employee__c = '${session.user.id}'
      ORDER BY Effective_From__c DESC
      LIMIT 5
    `);
    return NextResponse.json({ structures });
  } catch (err: any) {
    console.error("[Salary Structure GET]", err);
    return NextResponse.json({ error: "Failed to fetch salary structures" }, { status: 500 });
  }
}
