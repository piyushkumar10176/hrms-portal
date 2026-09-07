/**
 * POST /api/employees/[id]/invite
 *
 * Re-issues a portal invitation. Needed because an invite expires after three
 * days, an address can be wrong at the point of hiring, and the six employees
 * already in the system were created before invitations were ever sent.
 *
 * Issuing a new invite invalidates the previous one.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { queryOneOrNull } from "@/lib/salesforce";
import { toRole, canSeeCompanyWideData } from "@/lib/authz";
import { isSalesforceId } from "@/lib/soql";
import { issueInvite } from "@/lib/invite";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Inviting someone to the portal is an HR act, not something a colleague may
  // trigger on another person's behalf.
  const actor = { id: session.user.id, role: toRole(session.user.role) };
  if (!canSeeCompanyWideData(actor)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!isSalesforceId(id)) {
    return NextResponse.json({ error: "Invalid employee id" }, { status: 400 });
  }

  try {
    const emp = await queryOneOrNull<{
      Id: string;
      First_Name__c: string | null;
      Official_Email__c: string | null;
      Employee_Status__c: string;
      Password_Hash__c: string | null;
    }>(`
      SELECT Id, First_Name__c, Official_Email__c, Employee_Status__c, Password_Hash__c
      FROM Employee__c
      WHERE Id = '${id}'
      LIMIT 1
    `);

    if (!emp) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }
    if (emp.Employee_Status__c !== "Active") {
      return NextResponse.json(
        { error: "That employee is not active, so they cannot be invited." },
        { status: 409 }
      );
    }
    if (!emp.Official_Email__c) {
      return NextResponse.json(
        { error: "That employee has no email address on record. Add one first." },
        { status: 409 }
      );
    }
    // A placeholder address silently swallows the invitation. Twenty-six of the
    // twenty-eight employees still carry one, so this is worth refusing loudly
    // rather than reporting a delivery that cannot have happened.
    if (/@(test|example)\.(com|org|net)$/i.test(emp.Official_Email__c)) {
      return NextResponse.json(
        {
          error:
            `${emp.Official_Email__c} is a placeholder address, not a real mailbox. ` +
            `Replace it with the employee's real address before inviting them.`,
        },
        { status: 409 }
      );
    }

    const invite = await issueInvite(
      emp.Id,
      emp.First_Name__c || "there",
      emp.Official_Email__c,
      req.nextUrl.origin
    );

    return NextResponse.json({
      inviteLink: invite.link,
      inviteExpiresAt: invite.expiresAt,
      inviteEmailed: invite.email.sent,
      inviteEmailError: invite.email.sent ? undefined : invite.email.error,
      // Says plainly whether this replaces an unused invite or resets an
      // account that already has a password.
      hadPassword: Boolean(emp.Password_Hash__c),
    });
  } catch (err) {
    console.error("Resend invite error:", err);
    return NextResponse.json({ error: "Failed to issue the invitation" }, { status: 500 });
  }
}
