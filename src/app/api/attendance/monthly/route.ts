import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getMonthlyAttendance } from "@/lib/salesforce-queries";
import { getSessionEmployee, StaleSessionError } from "@/lib/session-employee";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
  const month = parseInt(searchParams.get("month") || String(new Date().getMonth()));
  
  try {
    const targetId = session.user.role === "admin" && searchParams.get("employeeId") 
      ? searchParams.get("employeeId")! 
      : (await getSessionEmployee(session)).Id;
    
    const sfRecords = await getMonthlyAttendance(targetId, year, month + 1); // JS month is 0-indexed, SF expects 1-12
    const records = sfRecords.map(r => ({
      id: r.Id,
      date: r.Date__c,
      checkIn: r.Check_In__c || null,
      checkOut: r.Check_Out__c || null,
      status: r.Status__c,
      totalHours: r.Total_Hours__c || 0,
      lateByMinutes: r.Late_By_Minutes__c || 0
    }));
    
    const present = records.filter(r => r.status === "Present").length;
    const absent = records.filter(r => r.status === "Absent").length;
    const leaves = records.filter(r => r.status === "Leave").length;

    return NextResponse.json({ records, summary: { present, absent, leaves, total: records.length }, source: "salesforce" });
  } catch (err) {
    if (err instanceof StaleSessionError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("Salesforce monthly attendance fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch attendance records" }, { status: 500 });
  }
}
