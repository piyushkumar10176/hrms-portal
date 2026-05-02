/**
 * POST /api/webhook/biometric/punch
 * 
 * PLACEHOLDER: Biometric device webhook receiver.
 * This endpoint is designed to receive punch events from
 * TruTime or similar biometric devices in the future.
 * 
 * Currently returns a stub response.
 * When biometric integration is activated:
 * 1. Validate the webhook secret
 * 2. Parse the device-specific payload
 * 3. Map device employee ID to Salesforce Employee__c
 * 4. Create Attendance_Punch__c with Source = 'Biometric'
 * 
 * Expected payload (TruTime format — adjust when integrating):
 * {
 *   deviceId: string,
 *   employeeCode: string,
 *   timestamp: string (ISO 8601),
 *   punchType: "IN" | "OUT",
 *   verificationMode: "fingerprint" | "face" | "card"
 * }
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // ============================================
  // PHASE 1: Stub implementation
  // ============================================

  // Validate webhook secret (uncomment when biometric is active)
  // const webhookSecret = req.headers.get("x-webhook-secret");
  // if (webhookSecret !== process.env.BIOMETRIC_WEBHOOK_SECRET) {
  //   return NextResponse.json(
  //     { error: "Invalid webhook secret" },
  //     { status: 401 }
  //   );
  // }

  // Log the incoming payload for future debugging
  let payload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  console.log("[Biometric Webhook] Received punch event:", JSON.stringify(payload));

  // ============================================
  // PHASE 2: Active implementation (uncomment when ready)
  // ============================================

  // const { deviceId, employeeCode, timestamp, punchType, verificationMode } = payload;
  //
  // // Map device employee code to Salesforce Employee__c
  // const employee = await queryOneOrNull<SFEmployee>(
  //   `SELECT Id FROM Employee__c WHERE Employee_Code__c = '${employeeCode}' LIMIT 1`
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

  // Stub response
  return NextResponse.json(
    {
      success: true,
      message: "Biometric webhook endpoint is ready but not yet active",
      received: payload,
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
    status: "ready",
    message: "Biometric punch webhook is configured but not yet active",
    version: "1.0.0",
    supportedDevices: ["TruTime"],
    documentation: "Contact admin when ready to integrate biometric devices",
  });
}
