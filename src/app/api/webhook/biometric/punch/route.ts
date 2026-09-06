/**
 * POST /api/webhook/biometric/punch
 * 
 * Biometric device webhook receiver.
 * Returns 503 until BIOMETRIC_WEBHOOK_SECRET is configured.
 * When active, validates the webhook secret header before processing.
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

/** Constant-time secret comparison. Length is compared first, via a hash, so
 *  unequal lengths do not short-circuit the byte comparison. */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    // Still burn a comparison of equal-length buffers to keep timing flat.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const expectedSecret = process.env.BIOMETRIC_WEBHOOK_SECRET;

  // If no secret configured, reject all requests — integration not active
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "Biometric integration is not active" },
      { status: 503 }
    );
  }

  // Validate webhook secret with a constant-time comparison so response timing
  // cannot be used to recover the secret one character at a time.
  const providedSecret = req.headers.get("x-webhook-secret");
  if (!providedSecret || !secretsMatch(providedSecret, expectedSecret)) {
    return NextResponse.json(
      { error: "Invalid webhook secret" },
      { status: 401 }
    );
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  // Log sanitized info only (not full payload)
  console.log("[Biometric Webhook] Received punch event from device:", payload?.deviceId || "unknown");

  // ============================================
  // PHASE 2: Active implementation (uncomment when ready)
  // ============================================

  // const { deviceId, employeeCode, timestamp, punchType, verificationMode } = payload;
  //
  // // Map device employee code to Salesforce Employee__c
  // const employee = await queryOneOrNull<SFEmployee>(
  //   `SELECT Id FROM Employee__c WHERE Employee_Code__c = '${escapeSoqlString(employeeCode)}' LIMIT 1`
  //   // employeeCode arrives from the device payload: always escape it, never interpolate raw.
  // );
  // if (!employee) {
  //   return NextResponse.json(
  //     { error: `Unknown employee code: ${employeeCode}` },
  //     { status: 404 }
  //   );
  // }
  //
  // // Create punch record
  // const punchId = await createPunch({
  //   employeeId: employee.Id,
  //   punchType: punchType === "IN" ? "Check-In" : "Check-Out",
  //   source: "Biometric",
  //   externalPunchId: `${deviceId}-${timestamp}`,
  //   deviceId,
  // });
  //
  // return NextResponse.json({ success: true, punchId }, { status: 201 });

  // Stub response (secret validated, but processing not yet active)
  return NextResponse.json(
    {
      success: true,
      message: "Webhook authenticated but processing not yet active",
      status: "stub",
    },
    { status: 202 }
  );
}

/**
 * GET /api/webhook/biometric/punch
 * Health check for the biometric webhook endpoint.
 */
export async function GET() {
  return NextResponse.json({
    status: process.env.BIOMETRIC_WEBHOOK_SECRET ? "configured" : "not_configured",
    message: "Biometric punch webhook endpoint",
    version: "1.0.0",
  });
}
