/**
 * Notification Service
 * 
 * Handles all notification channels:
 * 1. Email notifications (via Salesforce email)
 * 2. Salesforce Chatter notifications
 * 3. In-app push notifications (Web Push API)
 * 
 * Used when leave is applied, approved, or rejected.
 */

import { getSalesforceConnection } from "./salesforce";
import { queryOne } from "./salesforce";
import { assertSalesforceId } from "./soql";

// ============================================
// Types
// ============================================

export interface NotificationPayload {
  recipientEmail: string;
  recipientEmployeeId: string;
  subject: string;
  body: string;
  type: "leave_applied" | "leave_approved" | "leave_rejected" | "attendance_alert" | "general";
  relatedRecordId?: string;
  actionUrl?: string;
}

export interface LeaveNotificationData {
  applicantName: string;
  applicantEmail: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  managerId: string;
  leaveRequestId: string;
}

// ============================================
// Email via Salesforce
// ============================================

/**
 * Send email notification via Salesforce Single Email API.
 * This uses the org's email deliverability — no external SMTP needed.
 */
export async function sendEmailViaSalesforce(
  toEmail: string,
  subject: string,
  htmlBody: string
): Promise<boolean> {
  try {
    const conn = await getSalesforceConnection();

    await conn.request({
      method: "POST",
      url: "/services/data/v62.0/actions/standard/emailSimple",
      body: JSON.stringify({
        inputs: [
          {
            emailSubject: subject,
            emailBody: htmlBody,
            emailAddresses: toEmail,
            senderType: "OrgWideEmailAddress",
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
    });

    console.log(`[Notification] Email sent to ${toEmail}: ${subject}`);
    return true;
  } catch (error) {
    console.error("[Notification] Email send failed:", error);
    // Don't throw — notification failure shouldn't block the main flow
    return false;
  }
}

// ============================================
// Salesforce Chatter Notification
// ============================================

/**
 * Post a Chatter feed item to notify a user within Salesforce.
 */
export async function postChatterNotification(
  userId: string,
  message: string,
  relatedRecordId?: string
): Promise<boolean> {
  try {
    const conn = await getSalesforceConnection();

    const feedItem = {
      body: {
        messageSegments: [
          {
            type: "Text",
            text: message,
          },
        ],
      },
      feedElementType: "FeedItem",
      subjectId: relatedRecordId || userId,
    };

    await conn.request({
      method: "POST",
      url: "/services/data/v62.0/chatter/feed-elements",
      body: JSON.stringify(feedItem),
      headers: { "Content-Type": "application/json" },
    });

    console.log(`[Notification] Chatter post sent to ${userId}`);
    return true;
  } catch (error) {
    console.error("[Notification] Chatter post failed:", error);
    return false;
  }
}

// ============================================
// Leave Notification Templates
// ============================================

/**
 * Send all notifications when a leave request is submitted.
 * Notifies the manager via: Email, Salesforce Chatter, and App.
 */
export async function notifyManagerOnLeaveApplication(
  data: LeaveNotificationData
): Promise<{ email: boolean; chatter: boolean; app: boolean }> {
  // Get manager details
  let managerEmail = "";
  let managerName = "";

  try {
    const manager = await queryOne<{ Official_Email__c: string; First_Name__c: string; Name: string }>(
      `SELECT Official_Email__c, First_Name__c, Name 
       FROM Employee__c 
       WHERE Id = '${assertSalesforceId(data.managerId)}' LIMIT 1`
    );
    managerEmail = manager.Official_Email__c;
    managerName = manager.First_Name__c || manager.Name;
  } catch {
    console.error("[Notification] Could not fetch manager details");
    return { email: false, chatter: false, app: false };
  }

  // 1. Email notification to manager
  const emailSubject = `[HRMS] Leave Request from ${data.applicantName} — ${data.leaveType}`;
  const emailBody = generateLeaveEmailHTML(data, managerName);
  const emailSent = await sendEmailViaSalesforce(managerEmail, emailSubject, emailBody);

  // 2. Chatter notification
  const chatterMessage = `📋 Leave Request: ${data.applicantName} has applied for ${data.days} day(s) of ${data.leaveType} from ${data.fromDate} to ${data.toDate}. Reason: ${data.reason || "Not specified"}. Please review and approve/reject.`;
  const chatterSent = await postChatterNotification(data.managerId, chatterMessage, data.leaveRequestId);

  // 3. App notification (stored in-app for push)
  const appSent = await storeAppNotification({
    recipientEmail: managerEmail,
    recipientEmployeeId: data.managerId,
    subject: `Leave Request from ${data.applicantName}`,
    body: `${data.applicantName} applied for ${data.days} day(s) of ${data.leaveType} (${data.fromDate} to ${data.toDate})`,
    type: "leave_applied",
    relatedRecordId: data.leaveRequestId,
    actionUrl: "/approvals",
  });

  return { email: emailSent, chatter: chatterSent, app: appSent };
}

/**
 * Send notifications when a leave request is approved/rejected.
 */
export async function notifyEmployeeOnLeaveDecision(
  employeeId: string,
  decision: "Approved" | "Rejected",
  leaveType: string,
  fromDate: string,
  toDate: string,
  managerName: string
): Promise<void> {
  let employeeEmail = "";

  try {
    const employee = await queryOne<{ Official_Email__c: string; First_Name__c: string }>(
      `SELECT Official_Email__c, First_Name__c FROM Employee__c WHERE Id = '${assertSalesforceId(employeeId)}' LIMIT 1`
    );
    employeeEmail = employee.Official_Email__c;

    const subject = `[HRMS] Your ${leaveType} request has been ${decision}`;
    const emoji = decision === "Approved" ? "✅" : "❌";
    const body = `
      <div style="font-family: 'Inter', sans-serif; max-width: 500px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #4f46e5, #7c3aed); padding: 24px; border-radius: 12px 12px 0 0;">
          <h2 style="color: white; margin: 0;">Leave ${decision} ${emoji}</h2>
        </div>
        <div style="padding: 24px; background: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <p>Hi ${employee.First_Name__c},</p>
          <p>Your <strong>${leaveType}</strong> request for <strong>${fromDate}</strong> to <strong>${toDate}</strong> has been <strong>${decision.toLowerCase()}</strong> by ${managerName}.</p>
          <p style="margin-top: 16px; padding: 12px; background: ${decision === "Approved" ? "#ecfdf5" : "#fef2f2"}; border-radius: 8px; color: ${decision === "Approved" ? "#065f46" : "#991b1b"};">
            ${decision === "Approved" ? "Your leave balance has been updated." : "Please contact your manager for more details."}
          </p>
        </div>
      </div>
    `;

    await sendEmailViaSalesforce(employeeEmail, subject, body);
  } catch (error) {
    console.error("[Notification] Employee decision notification failed:", error);
  }
}

// ============================================
// In-App Notification Store
// ============================================

// In-memory store for app notifications (MVP — move to Salesforce custom object later)
const appNotifications: Map<string, NotificationPayload[]> = new Map();

async function storeAppNotification(payload: NotificationPayload): Promise<boolean> {
  try {
    const existing = appNotifications.get(payload.recipientEmail) || [];
    existing.unshift(payload);
    // Keep max 50 notifications per user
    if (existing.length > 50) existing.length = 50;
    appNotifications.set(payload.recipientEmail, existing);
    console.log(`[Notification] App notification stored for ${payload.recipientEmail}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get in-app notifications for a user.
 */
export function getAppNotifications(email: string): NotificationPayload[] {
  return appNotifications.get(email) || [];
}

/**
 * Get notification count for a user.
 */
export function getNotificationCount(email: string): number {
  return (appNotifications.get(email) || []).length;
}

// ============================================
// Email Template
// ============================================

function generateLeaveEmailHTML(data: LeaveNotificationData, managerName: string): string {
  return `
    <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 540px; margin: 0 auto; background: #f9fafb;">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #4f46e5, #7c3aed); padding: 32px 24px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0 0 4px 0; font-size: 22px;">New Leave Request 📋</h1>
        <p style="color: #c7d2fe; margin: 0; font-size: 14px;">Action required</p>
      </div>
      
      <!-- Body -->
      <div style="padding: 24px; background: white; border: 1px solid #e5e7eb; border-top: none;">
        <p style="color: #374151; font-size: 15px;">Hi ${managerName},</p>
        <p style="color: #374151; font-size: 15px;"><strong>${data.applicantName}</strong> has submitted a leave request for your approval.</p>
        
        <!-- Leave Details Card -->
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 13px; width: 120px;">Leave Type</td>
              <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${data.leaveType}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">From</td>
              <td style="padding: 8px 0; color: #111827; font-size: 14px;">${data.fromDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">To</td>
              <td style="padding: 8px 0; color: #111827; font-size: 14px;">${data.toDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Duration</td>
              <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${data.days} day(s)</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Reason</td>
              <td style="padding: 8px 0; color: #111827; font-size: 14px;">${data.reason || "Not specified"}</td>
            </tr>
          </table>
        </div>
        
        <!-- Action Buttons -->
        <div style="text-align: center; margin: 24px 0;">
          <a href="${process.env.NEXTAUTH_URL || "http://localhost:3000"}/approvals" 
             style="display: inline-block; background: #4f46e5; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
            Review & Approve
          </a>
        </div>
        
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 24px;">
          This is an automated notification from HRMS Portal. Do not reply to this email.
        </p>
      </div>
      
      <!-- Footer -->
      <div style="padding: 16px 24px; text-align: center; border-radius: 0 0 12px 12px;">
        <p style="color: #9ca3af; font-size: 11px; margin: 0;">HRMS Employee Portal — Powered by Salesforce</p>
      </div>
    </div>
  `;
}
