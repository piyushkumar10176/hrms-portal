import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getHolidays } from "@/lib/salesforce-queries";

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  try {
    const sfHolidays = await getHolidays();
    const holidays = sfHolidays.map(h => ({
      id: h.Id,
      name: h.Name,
      date: h.Date__c,
      type: h.Type__c || "National"
    }));
    return NextResponse.json({ holidays, source: "salesforce" });
  } catch (err) {
    console.error("Salesforce getHolidays error:", err);
    return NextResponse.json({ error: "Failed to fetch holidays" }, { status: 500 });
  }
}
