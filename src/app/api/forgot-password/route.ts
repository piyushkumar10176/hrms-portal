/**
 * POST /api/forgot-password
 *
 * Starts a password reset. Always answers the same way whether or not the
 * address exists, so this endpoint cannot be used to discover who works here.
 */

import { NextRequest, NextResponse } from "next/server";
import { queryOneOrNull, updateRecord } from "@/lib/salesforce";
import { escapeSoqlString } from "@/lib/soql";
import { verifyCaptcha } from "@/lib/captcha";
import { sendEmail } from "@/lib/email";
import { passwordResetEmail } from "@/lib/email-templates";
import {
  generateToken,
  hashToken,
  expiryFromNow,
  RESET_TTL_MINUTES,
  RESET_THROTTLE_MINUTES,
} from "@/lib/tokens";

export const dynamic = "force-dynamic";

/** The one answer this endpoint ever gives. */
const NEUTRAL = {
  message:
    "If that address belongs to an account, a reset link is on its way. Check your inbox and spam folder.",
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const captchaToken = body.captchaToken as string | undefined;

  const captcha = await verifyCaptcha(
    captchaToken,
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  );
  if (!captcha.ok) {
    return NextResponse.json(
      { error: "Please complete the verification and try again." },
      { status: 400 }
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    // Even a malformed address gets the neutral answer, so probing tells nothing.
    return NextResponse.json(NEUTRAL);
  }

  try {
    const employee = await queryOneOrNull<{
      Id: string;
      First_Name__c: string | null;
      Official_Email__c: string;
      Reset_Requested_At__c: string | null;
    }>(`
      SELECT Id, First_Name__c, Official_Email__c, Reset_Requested_At__c
      FROM Employee__c
      WHERE Official_Email__c = '${escapeSoqlString(email)}'
        AND Employee_Status__c = 'Active'
      LIMIT 1
    `);

    if (!employee) return NextResponse.json(NEUTRAL);

    // Throttle repeats for the same account so this cannot be used to flood
    // someone's inbox. Still answers neutrally.
    if (employee.Reset_Requested_At__c) {
      const since = Date.now() - new Date(employee.Reset_Requested_At__c).getTime();
      if (since < RESET_THROTTLE_MINUTES * 60_000) {
        return NextResponse.json(NEUTRAL);
      }
    }

    const token = generateToken();
    await updateRecord("Employee__c", employee.Id, {
      Reset_Token_Hash__c: hashToken(token),
      Reset_Token_Expires_At__c: expiryFromNow(RESET_TTL_MINUTES),
      Reset_Requested_At__c: new Date().toISOString(),
    });

    const base = process.env.NEXTAUTH_URL ?? req.nextUrl.origin;
    const link = `${base}/reset-password/${token}`;
    const result = await sendEmail(
      employee.Official_Email__c,
      passwordResetEmail(employee.First_Name__c ?? "", link, RESET_TTL_MINUTES)
    );

    if (!result.sent) {
      console.error(
        `[forgot-password] reset prepared for ${employee.Id} but not delivered: ${result.error}`
      );
    }
  } catch (err) {
    // Never leak the failure shape to the caller.
    console.error("[forgot-password] failed:", err);
  }

  return NextResponse.json(NEUTRAL);
}
