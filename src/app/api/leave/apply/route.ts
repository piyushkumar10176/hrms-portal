import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLeaveRequests, createLeaveRequest, getLeaveTypes, getLeaveBalances, getHolidays } from '@/lib/salesforce-queries';
import { countWorkingDays, parseISODate } from '@/lib/leave-days';
import { availableDays } from '@/lib/leave-balance';
import { getSessionEmployee, StaleSessionError } from "@/lib/session-employee";

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  try {
    const sfEmp = await getSessionEmployee(session);
    const sfRequests = await getLeaveRequests(sfEmp.Id);
    
    const requests = sfRequests.map(r => ({
      id: r.Id,
      leaveType: r.Leave_Type__r?.Name || "Unknown",
      fromDate: r.From_Date__c,
      toDate: r.To_Date__c,
      days: r.Days__c,
      reason: r.Reason__c || "",
      status: r.Status__c,
      appliedOn: r.CreatedDate || new Date().toISOString()
    }));
    
    return NextResponse.json({ requests, source: "salesforce" });
  } catch (err) {
    if (err instanceof StaleSessionError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("Salesforce getLeaveRequests error:", err);
    return NextResponse.json({ error: "Failed to fetch leave requests" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { leaveType, fromDate, toDate, reason, halfDay } = body;

  if (!leaveType || !fromDate || !toDate) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const start = parseISODate(fromDate);
  const end = parseISODate(toDate);
  if (!start || !end) {
    return NextResponse.json({ error: "Dates must be in yyyy-mm-dd format" }, { status: 400 });
  }
  if (start > end) {
    return NextResponse.json({ error: "The start date must be on or before the end date" }, { status: 400 });
  }

  try {
    const sfEmp = await getSessionEmployee(session);
    const sfLeaveTypes = await getLeaveTypes();
    const sfType = sfLeaveTypes.find(t => t.Name === leaveType);

    if (!sfType) {
      return NextResponse.json({ error: `Invalid leave type: ${leaveType}` }, { status: 400 });
    }

    // Days are derived on the server from the date range, never taken from the client.
    const holidays = await getHolidays();
    const holidayDates = new Set(
      holidays.map(h => h.Date__c).filter((d): d is string => Boolean(d))
    );
    const isHalfDay = halfDay === true;
    const days = countWorkingDays(fromDate, toDate, holidayDates, isHalfDay);

    if (days <= 0) {
      return NextResponse.json(
        { error: "That range contains no working days. Weekends and public holidays are not deducted." },
        { status: 400 }
      );
    }

    // Overlap check: reject a request that covers dates already requested or approved.
    const existing = await getLeaveRequests(sfEmp.Id);
    const overlapping = existing.find(r => {
      if (r.Status__c !== "Submitted" && r.Status__c !== "Approved") return false;
      if (!r.From_Date__c || !r.To_Date__c) return false;
      return r.From_Date__c <= toDate && r.To_Date__c >= fromDate;
    });
    if (overlapping) {
      return NextResponse.json(
        { error: `You already have leave from ${overlapping.From_Date__c} to ${overlapping.To_Date__c} covering these dates.` },
        { status: 409 }
      );
    }

    // Balance check: an employee cannot request more than they have left.
    const balances = await getLeaveBalances(sfEmp.Id);
    const balance = balances.find(b => b.Leave_Type__c === sfType.Id);
    const remaining = balance ? availableDays(balance) : 0;
    if (days > remaining) {
      return NextResponse.json(
        {
          error: `Insufficient ${leaveType} balance. This request needs ${days} day(s) and you have ${remaining} remaining.`,
          requested: days,
          remaining,
        },
        { status: 422 }
      );
    }

    await createLeaveRequest({
      employeeId: sfEmp.Id,
      leaveTypeId: sfType.Id,
      fromDate,
      toDate,
      days,
      halfDay: isHalfDay,
      reason: reason || "",
      approverId: sfEmp.Reporting_Manager__c
    });

    return NextResponse.json(
      { message: "Leave request submitted.", days, remaining: remaining - days, source: "salesforce" },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof StaleSessionError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("Salesforce createLeaveRequest error:", err);
    return NextResponse.json({ error: "Failed to submit leave request" }, { status: 500 });
  }
}
