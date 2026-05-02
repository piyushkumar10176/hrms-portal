import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/mock-data";
import { getEmployeeByEmail, getMonthlyAttendance } from "@/lib/salesforce-queries";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
  const month = parseInt(searchParams.get("month") || String(new Date().getMonth()));
  
  try {
    // If Admin is looking up another employee, we would ideally need to lookup that employee in SF.
    // For simplicity, we assume they are querying themselves if no employeeId is passed,
    // or we can fetch by their mock employeeId which we mapped to SF Employee_Code__c.
    // However, if the session user is querying themselves:
    const queryEmail = session.user.email; // we only support self-query in SF for now unless we do more lookups
    
    const sfEmp = await getEmployeeByEmail(queryEmail);
    if (sfEmp) {
      const sfRecords = await getMonthlyAttendance(sfEmp.Id, year, month + 1); // JS month is 0-indexed, SF expects 1-12
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
    }
  } catch (err) {
    console.error("Salesforce monthly attendance fallback:", err);
  }

  // Fallback to local
  const empId = session.user.role === "admin" && searchParams.get("employeeId")
    ? searchParams.get("employeeId")! : session.user.id;

  const records = db.getAttendanceForMonth(empId, year, month);
  const present = records.filter(r => r.status === "Present").length;
  const absent = records.filter(r => r.status === "Absent").length;
  const leaves = records.filter(r => r.status === "Leave").length;

  return NextResponse.json({ records, summary: { present, absent, leaves, total: records.length }, source: "local" });
}
