import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEmployeeByEmail, getPendingApprovals, createHistoryRecord } from "@/lib/salesforce-queries";
import { updateRecord, createRecord, getSalesforceConnection } from "@/lib/salesforce";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  try {
    const sfEmp = await getEmployeeByEmail(session.user.email);
    
    // Get pending approvals where this employee is the approver
    const sfApprovals = await getPendingApprovals(sfEmp.Id);
    
    const approvals = sfApprovals.map(r => ({
      id: r.Id,
      employeeId: r.Employee__c,
      employeeName: r.Employee__r?.Name || "Unknown",
      employeeEmail: r.Employee__r?.Official_Email__c || "",
      leaveType: r.Leave_Type__r?.Name || "Leave",
      fromDate: r.From_Date__c,
      toDate: r.To_Date__c,
      days: r.Days__c,
      reason: r.Reason__c || "",
      status: r.Status__c,
      appliedOn: r.CreatedDate || new Date().toISOString()
    }));
    
    return NextResponse.json({ approvals, source: "salesforce" });
  } catch (err) {
    console.error("Salesforce getPendingApprovals error:", err);
    return NextResponse.json({ error: "Failed to fetch approvals" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { requestId, action } = await req.json();
  if (!requestId || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const conn = await getSalesforceConnection();
    const manager = await getEmployeeByEmail(session.user.email);
    
    // Fetch the leave request with full details
    const lrResult = await conn.query(`
      SELECT Id, Employee__c, Employee__r.Name, Leave_Type__c, Leave_Type__r.Name,
             Days__c, From_Date__c, To_Date__c, Status__c, Reason__c
      FROM Leave_Request__c WHERE Id = '${requestId}' LIMIT 1
    `);
    if (lrResult.totalSize === 0) {
       return NextResponse.json({ error: "Leave request not found" }, { status: 404 });
    }

    const lr = lrResult.records[0] as any;
    
    // Update Leave Request status and set Approver
    const newStatus = action === "approve" ? "Approved" : "Rejected";
    await updateRecord("Leave_Request__c", requestId, {
      Status__c: newStatus,
      Approver__c: manager.Id,
    });
    
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const leaveTypeName = lr.Leave_Type__r?.Name || "Leave";
    const employeeName = lr.Employee__r?.Name || "Employee";
    const days = lr.Days__c || 0;

    // Create history record for the employee
    await createHistoryRecord({
      employeeId: lr.Employee__c,
      date: today,
      type: action === "approve" ? "Leave Approved" : "Leave Rejected",
      description: `${days} day(s) of ${leaveTypeName} ${action === "approve" ? "approved" : "rejected"} by ${manager.Name || "Manager"}.`
    });

    // Create history record for the manager
    await createHistoryRecord({
      employeeId: manager.Id,
      date: today,
      type: action === "approve" ? "Approved Leave" : "Rejected Leave",
      description: `${action === "approve" ? "Approved" : "Rejected"} ${days} day(s) of ${leaveTypeName} for ${employeeName}.`
    });

    // Create in-app notification for the employee
    try {
      await createRecord("Notification__c", {
        Employee__c: lr.Employee__c,
        Message__c: `Your ${leaveTypeName} request for ${days} day(s) has been ${newStatus.toLowerCase()} by ${manager.Name || "your manager"}.`,
        Type__c: "Leave",
        Is_Read__c: false,
        Related_Record_Id__c: requestId,
      });
    } catch (notifErr) {
      console.warn("Notification creation failed (non-fatal):", notifErr);
    }
    
    return NextResponse.json({ 
      request: { id: requestId, status: newStatus }, 
      message: `Leave ${action}d successfully` 
    });

  } catch (err) {
    console.error("Salesforce approval update error:", err);
    return NextResponse.json({ error: "Failed to update leave request" }, { status: 500 });
  }
}
