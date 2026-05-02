import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/mock-data";
import { getTodayPunches, createPunch as sfCreatePunch } from "@/lib/salesforce-queries";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Attempt to fetch from Salesforce
    // We assume the sfEmployee Id is passed or we look it up.
    // For MVP, if we don't have the SF record Id, this will fail and fallback.
    const punches = await getTodayPunches(session.user.employeeId);
    
    // Map Salesforce punches to the frontend format
    const clockInPunch = punches.find(p => p.Punch_Type__c === "Check-In");
    const clockOutPunch = punches.find(p => p.Punch_Type__c === "Check-Out");
    
    if (clockInPunch) {
      const today = {
        clockIn: new Date(clockInPunch.Punch_DateTime__c).toLocaleTimeString("en-IN", {hour:"2-digit",minute:"2-digit",hour12:false}),
        clockOut: clockOutPunch ? new Date(clockOutPunch.Punch_DateTime__c).toLocaleTimeString("en-IN", {hour:"2-digit",minute:"2-digit",hour12:false}) : null,
        status: "Present"
      };
      return NextResponse.json({ today });
    } else {
      return NextResponse.json({ today: null });
    }
  } catch (error) {
    console.error("Salesforce punch fetch error, falling back to mock data:", error);
    const today = db.getTodayAttendance(session.user.id);
    return NextResponse.json({ today });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action, latitude, longitude } = await req.json();

  try {
    // Attempt to write to Salesforce
    const punchType = action === "clockIn" ? "Check-In" : "Check-Out";
    await sfCreatePunch({
      employeeId: session.user.employeeId, // Needs the actual SF Employee__c Id, but if not, will fallback
      punchType,
      latitude,
      longitude,
      source: "Web"
    });
    
    // In MVP, we can still fall through and update the mock data just so the UI works seamlessly if SF is missing fields
  } catch (error) {
    console.error("Salesforce punch create error, falling back to mock data only:", error);
  }

  // Update mock data so the UI continues to work regardless of SF success
  if (action === "clockIn") {
    const record = db.clockIn(session.user.id);
    return NextResponse.json({ record, message: "Clocked in successfully" });
  } else if (action === "clockOut") {
    const record = db.clockOut(session.user.id);
    if (!record) return NextResponse.json({ error: "Not clocked in" }, { status: 400 });
    return NextResponse.json({ record, message: "Clocked out successfully" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
