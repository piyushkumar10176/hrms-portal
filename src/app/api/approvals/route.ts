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
import { updateRecord, createRecord, query } from "@/lib/salesforce";
import { assertSalesforceId, InvalidSalesforceIdError } from "@/lib/soql";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  try {
    const sfEmp = await getEmployeeByEmail(session.user.email);
    
    // Fetch all pending approvals in parallel. A failure in one source must not
    // hide the others, but it must not be silent either: previously each source
    // was wrapped in .catch(() => []) so a broken query showed as "nothing to
    // approve" and no one could tell the difference.
    const degradedSources: string[] = [];
    const settle = async <T,>(name: string, work: Promise<T[]>): Promise<T[]> => {
      try {
        return await work;
      } catch (err) {
        console.error(`Approvals source "${name}" failed:`, err);
        degradedSources.push(name);
        return [];
      }
    };

    const [leaveReqs, regReqs, expReqs, reimbReqs] = await Promise.all([
      settle("leave", getPendingApprovals(sfEmp.Id)),
      settle("regularization", getPendingRegularizationApprovals(sfEmp.Id)),
      settle("expense", getPendingExpenseApprovals(sfEmp.Id)),
      settle("reimbursement", getPendingReimbursementApprovals(sfEmp.Id))
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
    
    return NextResponse.json({
      approvals,
      source: "salesforce",
      ...(degradedSources.length ? { degradedSources } : {})
    });
  } catch (err) {
    console.error("Salesforce getPendingApprovals error:", err);
    return NextResponse.json({ error: "Failed to fetch approvals" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { requestId, action, type } = await req.json();
  if (!requestId || !["approve", "reject"].includes(action) || !type) {
    return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
  }

  const OBJECTS: Record<string, { object: string; label: string }> = {
    Leave: { object: "Leave_Request__c", label: "Leave Request" },
    Regularization: { object: "Regularization_Request__c", label: "Attendance Regularization" },
    Expense: { object: "Expense_Report__c", label: "Expense Report" },
    Reimbursement: { object: "Reimbursement__c", label: "Reimbursement Claim" },
  };

  const target = OBJECTS[type as string];
  if (!target) {
    return NextResponse.json({ error: "Invalid approval type" }, { status: 400 });
  }

  try {
    const recordId = assertSalesforceId(requestId);
    const manager = await getEmployeeByEmail(session.user.email);
    const newStatus = action === "approve" ? "Approved" : "Rejected";

    // Authorization. The caller must be the approver recorded on the request
    // itself, or an admin. Without this check any authenticated employee could
    // approve their own request by posting its id, and the previous code then
    // overwrote Approver__c with the caller, erasing who should have decided.
    const [record] = await query<{
      Id: string;
      Approver__c: string | null;
      Employee__c: string | null;
      Status__c: string | null;
    }>(`
      SELECT Id, Approver__c, Employee__c, Status__c
      FROM ${target.object}
      WHERE Id = '${recordId}'
      LIMIT 1
    `);

    if (!record) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const isAdmin = session.user.role === "admin";
    if (!isAdmin && record.Approver__c !== manager.Id) {
      return NextResponse.json(
        { error: "You are not the approver for this request" },
        { status: 403 }
      );
    }

    if (record.Employee__c === manager.Id && !isAdmin) {
      return NextResponse.json(
        { error: "You cannot approve your own request" },
        { status: 403 }
      );
    }

    // Only a request still awaiting a decision can be actioned. This also closes
    // the double-submit race where two approvers act on the same record.
    if (record.Status__c !== "Submitted") {
      return NextResponse.json(
        { error: `This request is already ${record.Status__c}` },
        { status: 409 }
      );
    }

    // employeeId is taken from the record, never from the request body, so a
    // caller cannot direct the resulting history and notification at someone else.
    const employeeId = record.Employee__c;

    await updateRecord(target.object, recordId, { Status__c: newStatus });

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    await createHistoryRecord({
      employeeId: manager.Id,
      date: today,
      type: `${action === "approve" ? "Approved" : "Rejected"} ${type}`,
      description: `${action === "approve" ? "Approved" : "Rejected"} a ${target.label}.`
    });

    if (employeeId) {
      await createHistoryRecord({
        employeeId,
        date: today,
        type: `${type} ${newStatus}`,
        description: `Your ${target.label} was ${newStatus.toLowerCase()} by ${manager.Name || "your manager"}.`
      });

      // Leave notifications are raised by LeaveRequestTriggerHandler in Salesforce,
      // so only the other types need one written here.
      if (type !== "Leave") {
        try {
          await createRecord("Notification__c", {
            Employee__c: employeeId,
            Message__c: `Your ${target.label} has been ${newStatus.toLowerCase()} by ${manager.Name || "your manager"}.`,
            Type__c: type,
            Is_Read__c: false,
            Related_Record_Id__c: recordId,
          });
        } catch (notifErr) {
          console.warn("Notification creation failed (non-fatal):", notifErr);
        }
      }
    }

    return NextResponse.json({
      request: { id: recordId, status: newStatus },
      message: `${target.label} ${action}d successfully`
    });

  } catch (err) {
    if (err instanceof InvalidSalesforceIdError) {
      return NextResponse.json({ error: "Invalid request id" }, { status: 400 });
    }
    console.error("Salesforce approval update error:", err);
    return NextResponse.json({ error: "Failed to process approval" }, { status: 500 });
  }
}
