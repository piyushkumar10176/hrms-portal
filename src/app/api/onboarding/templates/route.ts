import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/salesforce";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const q = `
      SELECT Id, Name, Active__c, 
        Department__r.Name, Designation__r.Name,
        (SELECT Id, Task_Name__c, Assignee_Role__c, Due_Days_After_Joining__c FROM Template_Tasks__r ORDER BY Due_Days_After_Joining__c ASC)
      FROM Onboarding_Template__c
      ORDER BY Name ASC
    `;
    const templates = await query(q);
    return NextResponse.json({ templates });
  } catch (err) {
    console.error("Failed to fetch onboarding templates:", err);
    return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
  }
}
