import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { 
  getEmployeeByEmail, 
  getPendingApprovals, 
  getPendingRegularizationApprovals,
  getPendingExpenseApprovals,
  getPendingReimbursementApprovals,
  createHistoryRecord 
} from "@/lib/salesforce-queries";
import { updateRecord, createRecord, getSalesforceConnection } from "@/lib/salesforce";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  try {
    const sfEmp = await getEmployeeByEmail(session.user.email);
    
    // Fetch all pending approvals in parallel
    const [leaveReqs, regReqs, expReqs, reimbReqs] = await Promise.all([
      getPendingApprovals(sfEmp.Id).catch(() => []),
      getPendingRegularizationApprovals(sfEmp.Id).catch(() => []),
      getPendingExpenseApprovals(sfEmp.Id).catch(() => []),
      getPendingReimbursementApprovals(sfEmp.Id).catch(() => [])
    ]);
    
    // Map leaves
    const leaves = leaveReqs.map((r: any) => ({
      id: r.Id,
      type: "Leave",
      employeeId: r.Employee__c,
      employeeName: r.Employee__r?.Name || "Unknown",
      details: `${r.Leave_Type__r?.Name || "Leave"} • ${r.Days__c} day(s) from ${r.From_Date__c} to ${r.To_Date__c}`,
      reason: r.Reason__c || "",
      appliedOn: r.CreatedDate || new Date().toISOString()
    }));

    // Map regularizations
    const regularizations = regReqs.map((r: any) => ({
      id: r.Id,
      type: "Regularization",
      employeeId: r.Employee__c,
      employeeName: r.Employee__r?.Name || "Unknown",
      details: `Date: ${r.Date__c} • In: ${r.Requested_Clock_In__c || "-"} • Out: ${r.Requested_Clock_Out__c || "-"}`,
      reason: r.Reason__c || "",
      appliedOn: r.CreatedDate || new Date().toISOString()
    }));

    // Map expenses
    const expenses = expReqs.map((r: any) => ({
      id: r.Id,
      type: "Expense",
      employeeId: r.Employee__c,
      employeeName: r.Employee__r?.Name || "Unknown",
      details: `Title: ${r.Title__c} • Total: ₹${r.Total_Amount__c || 0}`,
      reason: r.Notes__c || "",
      appliedOn: r.CreatedDate || new Date().toISOString()
    }));

    // Map reimbursements
    const reimbursements = reimbReqs.map((r: any) => ({
      id: r.Id,
      type: "Reimbursement",
      employeeId: r.Employee__c,
      employeeName: r.Employee__r?.Name || "Unknown",
      details: `Component: ${r.Component__r?.Name || "Other"} • Amount: ₹${r.Amount_Claimed__c || 0}`,
      reason: "",
      appliedOn: r.CreatedDate || new Date().toISOString()
    }));

    const approvals = [...leaves, ...regularizations, ...expenses, ...reimbursements].sort((a, b) => 
      new Date(b.appliedOn).getTime() - new Date(a.appliedOn).getTime()
    );
    
    return NextResponse.json({ approvals, source: "salesforce" });
  } catch (err) {
    console.error("Salesforce getPendingApprovals error:", err);
    return NextResponse.json({ error: "Failed to fetch approvals" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { requestId, action, type, employeeId } = await req.json();
  if (!requestId || !["approve", "reject"].includes(action) || !type || !employeeId) {
    return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
  }

  try {
    const manager = await getEmployeeByEmail(session.user.email);
    const newStatus = action === "approve" ? "Approved" : "Rejected";
    
    let objectName = "";
    let actionDesc = "";

    if (type === "Leave") {
      objectName = "Leave_Request__c";
      actionDesc = "Leave Request";
    } else if (type === "Regularization") {
      objectName = "Regularization_Request__c";
      actionDesc = "Attendance Regularization";
    } else if (type === "Expense") {
      objectName = "Expense_Report__c";
      actionDesc = "Expense Report";
    } else if (type === "Reimbursement") {
      objectName = "Reimbursement__c";
      actionDesc = "Reimbursement Claim";
    } else {
      return NextResponse.json({ error: "Invalid approval type" }, { status: 400 });
    }

    // Since we just need to update the status and approver, we can do it generically
    await updateRecord(objectName, requestId, {
      Status__c: newStatus,
      Approver__c: manager.Id,
    });

    // Create history record for the manager
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    await createHistoryRecord({
      employeeId: manager.Id,
      date: today,
      type: `${action === "approve" ? "Approved" : "Rejected"} ${type}`,
      description: `${action === "approve" ? "Approved" : "Rejected"} a ${actionDesc}.`
    });

    // Create history record for the employee
    await createHistoryRecord({
      employeeId: employeeId,
      date: today,
      type: `${type} ${newStatus}`,
      description: `Your ${actionDesc} was ${newStatus.toLowerCase()} by ${manager.Name || "your manager"}.`
    });

    // Create in-app notification for the employee
    try {
      await createRecord("Notification__c", {
        Employee__c: employeeId,
        Message__c: `Your ${actionDesc} has been ${newStatus.toLowerCase()} by ${manager.Name || "your manager"}.`,
        Type__c: type,
        Is_Read__c: false,
        Related_Record_Id__c: requestId,
      });
    } catch (notifErr) {
      console.warn("Notification creation failed (non-fatal):", notifErr);
    }

    return NextResponse.json({ 
      request: { id: requestId, status: newStatus }, 
      message: `${type} ${action}d successfully` 
    });

  } catch (err) {
    console.error("Salesforce approval update error:", err);
    return NextResponse.json({ error: "Failed to process approval" }, { status: 500 });
  }
}
