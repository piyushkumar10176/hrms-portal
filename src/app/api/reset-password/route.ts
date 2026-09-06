/**
 * POST /api/reset-password
 *
 * Completes a reset. The token is looked up by its hash, used once, and cleared.
 * Setting a password also stamps Password_Changed_At__c, which invalidates any
 * session issued before now.
 */

import { NextRequest, NextResponse } from "next/server";
import { queryOneOrNull, updateRecord } from "@/lib/salesforce";
import { escapeSoqlString } from "@/lib/soql";
import { hashToken, isExpired, validatePassword } from "@/lib/tokens";
import { sendEmail } from "@/lib/email";
import { passwordChangedEmail } from "@/lib/email-templates";
import { hashSync } from "bcryptjs";

export const dynamic = "force-dynamic";

const INVALID = "That reset link is invalid or has expired. Please request a new one.";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = String(body.token ?? "");
  const password = String(body.password ?? "");

  if (!token) return NextResponse.json({ error: INVALID }, { status: 400 });

  const problem = validatePassword(password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  try {
    // Looked up by hash, so the raw token never has to be compared in a scan.
    const employee = await queryOneOrNull<{
      Id: string;
      First_Name__c: string | null;
      Official_Email__c: string;
      Reset_Token_Expires_At__c: string | null;
    }>(`
      SELECT Id, First_Name__c, Official_Email__c, Reset_Token_Expires_At__c
      FROM Employee__c
      WHERE Reset_Token_Hash__c = '${escapeSoqlString(hashToken(token))}'
        AND Employee_Status__c = 'Active'
      LIMIT 1
    `);

    if (!employee || isExpired(employee.Reset_Token_Expires_At__c)) {
      return NextResponse.json({ error: INVALID }, { status: 400 });
    }

    const changedAt = new Date();
    await updateRecord("Employee__c", employee.Id, {
      Password_Hash__c: hashSync(password, 12),
      Password_Changed_At__c: changedAt.toISOString(),
      // Single use: the token is spent whether or not the email lands.
      Reset_Token_Hash__c: null,
      Reset_Token_Expires_At__c: null,
      // A completed reset also clears any lockout.
      Failed_Login_Attempts__c: 0,
      Lockout_Until__c: null,
    });

    await sendEmail(
      employee.Official_Email__c,
      passwordChangedEmail(
        employee.First_Name__c ?? "",
        changedAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
      )
    );

    return NextResponse.json({
      message: "Your password has been set. You can sign in now.",
    });
  } catch (err) {
    console.error("[reset-password] failed:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please request a new link." },
      { status: 500 }
    );
  }
}
