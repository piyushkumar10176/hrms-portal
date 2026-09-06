import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTodayPunches, createPunch as sfCreatePunch, createHistoryRecord } from "@/lib/salesforce-queries";
import { getSessionEmployee, StaleSessionError } from "@/lib/session-employee";
import { summarizeDay, isCheckIn, formatMinutes } from "@/lib/attendance";
import { businessToday, businessTimeNow } from "@/lib/business-time";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sfEmp = await getSessionEmployee(session);
    const punches = await getTodayPunches(sfEmp.Id);

    // The whole day is returned, not just the first in and last out. Break time
    // only exists in the gaps between punches, so a caller that sees a single
    // pair cannot work out how long someone was away.
    const day = summarizeDay(punches);
    return NextResponse.json({ today: day.log.length ? day : null });
  } catch (error) {
    if (error instanceof StaleSessionError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("Salesforce punch fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch punches" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action, latitude, longitude } = await req.json();

  // Anything that was not exactly "clockIn" previously fell through to a
  // Check-Out, so a malformed action silently recorded the wrong punch.
  if (action !== "clockIn" && action !== "clockOut") {
    return NextResponse.json(
      { error: 'action must be "clockIn" or "clockOut"' },
      { status: 400 }
    );
  }

  try {
    const sfEmp = await getSessionEmployee(session);
    const punchType = action === "clockIn" ? "Check-In" : "Check-Out";

    // Sequence check. Punches previously had no ordering rules, so an employee
    // could clock in twice in a row, or clock out having never clocked in, and
    // the daily rollup would then derive nonsense hours from the pair.
    const todaysPunches = await getTodayPunches(sfEmp.Id);
    const lastPunch = todaysPunches.length ? todaysPunches[todaysPunches.length - 1] : null;
    const lastWasCheckIn = lastPunch ? isCheckIn(lastPunch.Punch_Type__c) : false;

    if (action === "clockIn" && lastWasCheckIn) {
      return NextResponse.json(
        { error: "You are already clocked in. Clock out before clocking in again." },
        { status: 409 }
      );
    }
    if (action === "clockOut" && !lastPunch) {
      return NextResponse.json(
        { error: "You have not clocked in today." },
        { status: 409 }
      );
    }
    if (action === "clockOut" && !lastWasCheckIn) {
      return NextResponse.json(
        { error: "You are already clocked out. Clock in before clocking out again." },
        { status: 409 }
      );
    }

    await sfCreatePunch({
      employeeId: sfEmp.Id,
      punchType,
      latitude,
      longitude,
      source: "Web",
    });

    // Re-read rather than appending locally, so the response reflects what
    // Salesforce actually stored, including a punch a biometric device may have
    // written for the same person a moment ago.
    const day = summarizeDay(await getTodayPunches(sfEmp.Id));

    await createHistoryRecord({
      employeeId: sfEmp.Id,
      date: businessToday(),
      type: action === "clockIn" ? "Clock In" : "Clock Out",
      description:
        action === "clockIn"
          ? `Clocked in at ${businessTimeNow()}`
          : `Clocked out at ${businessTimeNow()}, ${formatMinutes(day.breakMinutes)} break`,
    });

    // A clock-in that closed a break is worth saying out loud, because the
    // employee is about to wonder whether those minutes were counted.
    const closedBreak = day.log.length ? day.log[day.log.length - 1].breakBeforeMinutes : undefined;
    const message =
      action === "clockIn"
        ? closedBreak
          ? `Clocked in at ${businessTimeNow()} after a ${formatMinutes(closedBreak)} break.`
          : `Clocked in at ${businessTimeNow()}.`
        : `Clocked out at ${businessTimeNow()}.`;

    return NextResponse.json({ record: day, message });
  } catch (error) {
    if (error instanceof StaleSessionError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("Salesforce punch create error:", error);
    return NextResponse.json({ error: "Failed to save punch" }, { status: 500 });
  }
}
