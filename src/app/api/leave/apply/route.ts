import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/mock-data";
import { getEmployeeByEmail, getLeaveRequests, createLeaveRequest, getLeaveTypes } from '@/lib/salesforce-queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  try {
    const sfEmp = await getEmployeeByEmail(session.user.email);
    if (sfEmp) {
      const sfRequests = await getLeaveRequests(sfEmp.Id);
      const requests = sfRequests.map(r => ({
        id: r.Id,
        leaveType: r.Leave_Type__r?.Name || "Annual Leave",
        fromDate: r.From_Date__c,
        toDate: r.To_Date__c,
        days: r.Days__c,
        reason: r.Reason__c || "",
        status: r.Status__c,
        appliedOn: r.CreatedDate || new Date().toISOString()
      }));
      return NextResponse.json({ requests, source: "salesforce" });
    }
  } catch (err) {
    console.error("Salesforce getLeaveRequests fallback:", err);
  }
  
  return NextResponse.json({ requests: db.getLeaveRequests(session.user.id), source: "local" });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { leaveType, fromDate, toDate, days, reason } = body;

  if (!leaveType || !fromDate || !toDate) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const sfEmp = await getEmployeeByEmail(session.user.email);
    if (sfEmp) {
      const sfLeaveTypes = await getLeaveTypes();
      const sfType = sfLeaveTypes.find(t => t.Name === leaveType) || sfLeaveTypes[0];
      
      if (sfType) {
        await createLeaveRequest({
          employeeId: sfEmp.Id,
          leaveTypeId: sfType.Id,
          fromDate,
          toDate,
          days: days || 1,
          halfDay: false,
          reason: reason || "",
          approverId: sfEmp.Reporting_Manager__c
        });
        return NextResponse.json({ message: "Leave request submitted to Salesforce.", source: "salesforce" }, { status: 201 });
      }
    }
  } catch (err) {
    console.error("Salesforce createLeaveRequest fallback:", err);
  }

  // Fallback to local
  const balances = db.getLeaveBalances(session.user.id);
  const balance = balances.find(b => b.leaveType === leaveType);
  if (balance && balance.available < (days || 1)) {
    return NextResponse.json({ error: "Insufficient leave balance" }, { status: 400 });
  }

  const request = db.applyLeave({
    employeeId: session.user.id,
    leaveType, fromDate, toDate,
    days: days || 1,
    reason: reason || "",
  });

  return NextResponse.json({ request, message: "Leave request submitted locally.", source: "local" }, { status: 201 });
}
