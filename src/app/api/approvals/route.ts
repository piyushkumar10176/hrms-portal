import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/mock-data";
import { getEmployeeByEmail, getPendingApprovals } from "@/lib/salesforce-queries";
import { updateRecord, getSalesforceConnection } from "@/lib/salesforce";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  try {
    const sfEmp = await getEmployeeByEmail(session.user.email);
    if (sfEmp) {
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
    }
  } catch (err) {
    console.error("Salesforce getPendingApprovals fallback:", err);
  }

  // Fallback to local
  if (session.user.role !== "admin") {
    return NextResponse.json({ approvals: db.getPendingApprovals(session.user.id), source: "local" });
  }
  const all = db.getAllLeaveRequests().filter(r => r.status === "Pending");
  return NextResponse.json({ approvals: all, source: "local" });
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
    
    // Fetch the leave request to get its details
    const lrResult = await conn.query(`SELECT Id, Employee__c, Leave_Type__c, Days__c, Status__c FROM Leave_Request__c WHERE Id = '${requestId}' LIMIT 1`);
    if (lrResult.totalSize > 0) {
      const lr = lrResult.records[0] as any;
      
      // Update Leave Request status
      const newStatus = action === "approve" ? "Approved" : "Rejected";
      await updateRecord("Leave_Request__c", requestId, {
        Status__c: newStatus,
        Approver__c: undefined // you might want to log who approved it, but we won't change approver id, just status
      });
      
      // If approved, deduct balance
      if (action === "approve") {
        const currentYear = new Date().getFullYear().toString();
        // Find the leave balance record
        const lbResult = await conn.query(`SELECT Id, Availed__c, Closing_Balance__c FROM Leave_Balance__c WHERE Employee__c = '${lr.Employee__c}' AND Leave_Type__c = '${lr.Leave_Type__c}' AND Year__c = '${currentYear}' LIMIT 1`);
        
        if (lbResult.totalSize > 0) {
          const lb = lbResult.records[0] as any;
          const currentAvailed = lb.Availed__c || 0;
          const currentClosing = lb.Closing_Balance__c || 0;
          
          await updateRecord("Leave_Balance__c", lb.Id, {
            Availed__c: currentAvailed + lr.Days__c,
            Closing_Balance__c: currentClosing - lr.Days__c
          });
        }
      }
      
      // Local Notification for SF action
      const notifBody = action === "approve" ? `Your leave has been approved` : `Your leave has been rejected`;
      // Find local user ID via email (we need SF Employee email first)
      let localEmpId = session.user.id; // fallback
      const empResult = await conn.query(`SELECT Official_Email__c FROM Employee__c WHERE Id = '${lr.Employee__c}' LIMIT 1`);
      if (empResult.totalSize > 0) {
        const empEmail = (empResult.records[0] as any).Official_Email__c;
        const localEmp = db.getAllEmployees().find(e => e.email === empEmail);
        if (localEmp) localEmpId = localEmp.id;
      }
      
      db.notifications.push({
        id: `n${Date.now()}`,
        recipientId: localEmpId,
        title: `Leave ${action === "approve" ? "Approved ✅" : "Rejected ❌"}`,
        body: notifBody,
        type: `leave_${action}d`,
        read: false,
        createdAt: new Date().toISOString(),
        actionUrl: "/leave"
      });
      
      return NextResponse.json({ 
        request: { id: requestId, status: newStatus }, 
        message: `Leave ${action}d successfully in Salesforce` 
      });
    }
  } catch (err) {
    console.error("Salesforce approval update error:", err);
  }

  // Fallback local
  const result = action === "approve"
    ? db.approveLeave(requestId, session.user.id)
    : db.rejectLeave(requestId, session.user.id);

  if (!result) return NextResponse.json({ error: "Request not found locally either" }, { status: 404 });

  return NextResponse.json({ request: result, message: `Leave ${action}d successfully locally` });
}
