import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getMonthlyAttendance } from "@/lib/salesforce-queries";
import { getSessionEmployee, StaleSessionError } from "@/lib/session-employee";
import { toRole, canSeeCompanyWideData } from "@/lib/authz";
import { isSalesforceId } from "@/lib/soql";
import { punchTime, BREAK_ALLOWANCE_MINUTES, MINIMUM_EFFECTIVE_HOURS } from "@/lib/attendance";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
  const month = parseInt(searchParams.get("month") || String(new Date().getMonth()));
  
  try {
    // Reading someone else's attendance requires HR or admin. Anyone else is
    // silently given their own, and a malformed id is never passed to SOQL.
    const requested = searchParams.get("employeeId");
    const actor = { id: session.user.id, role: toRole(session.user.role) };
    const mayReadOthers = canSeeCompanyWideData(actor) && requested && isSalesforceId(requested);
    const targetId = mayReadOthers ? requested : (await getSessionEmployee(session)).Id;
    
    const sfRecords = await getMonthlyAttendance(targetId, year, month + 1); // JS month is 0-indexed, SF expects 1-12
    // The page rendered clockIn/clockOut while this route returned checkIn/checkOut,
    // so both columns showed a dash on every row. Both names are emitted now: the
    // pair the page reads, and the pair the earlier API contract promised.
    const records = sfRecords.map(r => ({
      id: r.Id,
      date: r.Date__c,
      clockIn: r.Check_In__c ? punchTime(r.Check_In__c) : null,
      clockOut: r.Check_Out__c ? punchTime(r.Check_Out__c) : null,
      checkIn: r.Check_In__c || null,
      checkOut: r.Check_Out__c || null,
      status: r.Status__c,
      totalHours: r.Total_Hours__c ?? 0,
      grossHours: r.Gross_Hours__c ?? 0,
      breakMinutes: r.Break_Minutes__c ?? 0,
      breakOverAllowance: (r.Break_Minutes__c ?? 0) > BREAK_ALLOWANCE_MINUTES,
      lateByMinutes: r.Late_By_Minutes__c ?? 0,
      penalty: r.Penalty__c === true,
      penaltyReason: r.Penalty_Reason__c || null
    }));

    const present = records.filter(r => r.status === "Present").length;
    const absent = records.filter(r => r.status === "Absent").length;
    const leaves = records.filter(r => r.status === "Leave").length;
    const workedDays = records.filter(r => r.totalHours > 0);
    const effectiveHours = round2(workedDays.reduce((sum, r) => sum + r.totalHours, 0));
    const breakMinutes = records.reduce((sum, r) => sum + r.breakMinutes, 0);

    return NextResponse.json({
      records,
      summary: {
        present,
        absent,
        leaves,
        total: records.length,
        effectiveHours,
        breakMinutes,
        averageEffectiveHours: workedDays.length ? round2(effectiveHours / workedDays.length) : 0,
        penalties: records.filter(r => r.penalty).length
      },
      policy: { minimumEffectiveHours: MINIMUM_EFFECTIVE_HOURS, breakAllowanceMinutes: BREAK_ALLOWANCE_MINUTES },
      source: "salesforce"
    });
  } catch (err) {
    if (err instanceof StaleSessionError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("Salesforce monthly attendance fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch attendance records" }, { status: 500 });
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
