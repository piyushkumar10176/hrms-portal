import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTodayPunches, createPunch as sfCreatePunch, createHistoryRecord } from "@/lib/salesforce-queries";
import { getSessionEmployee, StaleSessionError } from "@/lib/session-employee";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sfEmp = await getSessionEmployee(session);
    const punches = await getTodayPunches(sfEmp.Id);
    
    // Check for the most recent punches today
    const clockInPunch = [...punches].reverse().find(p => p.Punch_Type__c === "Check-In");
    const clockOutPunch = [...punches].reverse().find(p => p.Punch_Type__c === "Check-Out");
    
    if (clockInPunch) {
      const today = {
        clockIn: new Date(clockInPunch.Punch_DateTime__c).toLocaleTimeString("en-IN", {timeZone:"Asia/Kolkata", hour:"2-digit",minute:"2-digit",hour12:false}),
        clockOut: clockOutPunch ? new Date(clockOutPunch.Punch_DateTime__c).toLocaleTimeString("en-IN", {timeZone:"Asia/Kolkata", hour:"2-digit",minute:"2-digit",hour12:false}) : null,
        status: "Present"
      };
      return NextResponse.json({ today });
    } else {
      return NextResponse.json({ today: null });
    }
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
    const lastWasCheckIn = lastPunch
      ? (lastPunch.Punch_Type__c || "").toLowerCase().replace(/[^a-z]/g, "") === "checkin"
      : false;

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
      source: "Web"
    });
    
    // Create history record in SF
    await createHistoryRecord({
      employeeId: sfEmp.Id,
      date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
      type: action === "clockIn" ? "Clock In" : "Clock Out",
      description: `Clocked ${action === "clockIn" ? "in" : "out"} at ${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false })}`
    });
    
    const timeString = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });
    return NextResponse.json({ 
      record: { 
        clockIn: action === "clockIn" ? timeString : null,
        clockOut: action === "clockOut" ? timeString : null,
        status: "Present"
      }, 
      message: `Clocked ${action === "clockIn" ? "in" : "out"} successfully` 
    });
  } catch (error) {
    if (error instanceof StaleSessionError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("Salesforce punch create error:", error);
    return NextResponse.json({ error: "Failed to save punch" }, { status: 500 });
  }
}
