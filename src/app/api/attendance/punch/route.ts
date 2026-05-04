import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTodayPunches, createPunch as sfCreatePunch, createHistoryRecord, getEmployeeByEmail } from "@/lib/salesforce-queries";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sfEmp = await getEmployeeByEmail(session.user.email);
    const punches = await getTodayPunches(sfEmp.Id);
    
    // Check for the most recent punches today
    const clockInPunch = punches.find(p => p.Punch_Type__c === "Check-In");
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
    console.error("Salesforce punch fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch punches" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action, latitude, longitude } = await req.json();

  try {
    const sfEmp = await getEmployeeByEmail(session.user.email);
    const punchType = action === "clockIn" ? "Check-In" : "Check-Out";
    
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
    
    return NextResponse.json({ 
      record: { action, time: new Date().toISOString() }, 
      message: `Clocked ${action === "clockIn" ? "in" : "out"} successfully` 
    });
  } catch (error) {
    console.error("Salesforce punch create error:", error);
    return NextResponse.json({ error: "Failed to save punch" }, { status: 500 });
  }
}
