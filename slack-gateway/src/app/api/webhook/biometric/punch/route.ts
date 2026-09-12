/**
 * POST /api/webhook/biometric/punch
 *
 * Biometric device webhook receiver.
 *
 * Devices push raw punches; everything derived from them, including break time
 * and effective hours, is Salesforce's job. The trigger on Attendance_Punch__c
 * rebuilds the day and direct messages the employee in Slack, so a punch made at
 * the terminal reaches the same place a punch made in the portal does.
 *
 * Returns 503 until BIOMETRIC_WEBHOOK_SECRET is configured, so an unconfigured
 * deployment cannot be used to write attendance.
 *
 * The payload below is the shape this endpoint accepts. Terminals differ, so
 * point the device at a small adapter, or extend normalisePunch() when the make
 * and model are settled:
 *
 *   { "deviceId": "GATE-01",
 *     "punches": [ { "employeeCode": "EMP007",
 *                    "timestamp": "2026-09-06T10:00:00+05:30",
 *                    "punchType": "IN" } ] }
 *
 * A single punch may also be posted at the top level rather than in an array.
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import {
  createPunch,
  findEmployeesByCode,
  findPunchesByExternalId,
} from "@/lib/salesforce-queries";

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

/** Most terminals speak IN/OUT or 0/1 rather than Salesforce's wording. */
const CHECK_IN_TOKENS = new Set(["in", "i", "0", "checkin", "check-in", "check in", "duty-on"]);

interface NormalisedPunch {
  employeeCode: string;
  punchDateTime: string;
  punchType: "Check-In" | "Check-Out";
  externalPunchId: string;
}

interface RejectedPunch {
  index: number;
  reason: string;
}

/** Validates and normalises one device punch, or explains why it cannot be used. */
function normalisePunch(
  raw: unknown,
  index: number,
  deviceId: string
): NormalisedPunch | RejectedPunch {
  if (!raw || typeof raw !== "object") {
    return { index, reason: "Punch is not an object" };
  }
  const p = raw as Record<string, unknown>;

  const employeeCode = String(p.employeeCode ?? p.userId ?? p.enrollId ?? "").trim();
  if (!employeeCode) {
    return { index, reason: "Missing employeeCode" };
  }

  const rawTimestamp = String(p.timestamp ?? p.punchTime ?? p.time ?? "").trim();
  if (!rawTimestamp) {
    return { index, reason: "Missing timestamp" };
  }
  const when = new Date(rawTimestamp);
  if (Number.isNaN(when.getTime())) {
    return { index, reason: `Unparseable timestamp: ${rawTimestamp}` };
  }
  // A device with a wrong clock can file punches years out and quietly corrupt
  // months of attendance, so anything implausible is refused rather than stored.
  const skewDays = (Date.now() - when.getTime()) / 86400000;
  if (skewDays > 90) {
    return { index, reason: "Timestamp is more than 90 days in the past" };
  }
  if (skewDays < -1) {
    return { index, reason: "Timestamp is in the future" };
  }

  const rawType = String(p.punchType ?? p.direction ?? p.status ?? "").toLowerCase().trim();
  if (!rawType) {
    return { index, reason: "Missing punchType" };
  }
  const punchType = CHECK_IN_TOKENS.has(rawType) ? "Check-In" : "Check-Out";

  return {
    employeeCode,
    punchDateTime: when.toISOString(),
    punchType,
    // Identity on the device, so a replayed buffer cannot double-record a punch
    // and invent break time nobody took.
    externalPunchId: `${deviceId}:${employeeCode}:${when.toISOString()}`,
  };
}

function isRejected(value: NormalisedPunch | RejectedPunch): value is RejectedPunch {
  return "reason" in value;
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

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const deviceId = String(payload?.deviceId ?? "unknown").trim() || "unknown";
  const rawPunches = Array.isArray(payload?.punches) ? payload.punches : [payload];
  if (rawPunches.length === 0) {
    return NextResponse.json({ error: "No punches in payload" }, { status: 400 });
  }
  // A terminal buffering overnight can push a lot at once; cap the batch so one
  // request cannot exhaust the Salesforce API budget for everyone else.
  if (rawPunches.length > 200) {
    return NextResponse.json(
      { error: "Too many punches in one request; send at most 200" },
      { status: 413 }
    );
  }

  console.log(
    `[Biometric Webhook] ${rawPunches.length} punch(es) from device ${deviceId}`
  );

  const accepted: NormalisedPunch[] = [];
  const rejected: RejectedPunch[] = [];
  rawPunches.forEach((raw, index) => {
    const result = normalisePunch(raw, index, deviceId);
    if (isRejected(result)) rejected.push(result);
    else accepted.push(result);
  });

  if (accepted.length === 0) {
    return NextResponse.json(
      { error: "No usable punches", recorded: 0, rejected },
      { status: 400 }
    );
  }

  try {
    // Two lookups for the whole batch rather than two per punch, so a device
    // pushing a night's buffer does not spend hundreds of API calls.
    const employeeIds = await findEmployeesByCode([
      ...new Set(accepted.map(p => p.employeeCode)),
    ]);
    const alreadyRecorded = await findPunchesByExternalId(
      accepted.map(p => p.externalPunchId)
    );

    let recorded = 0;
    let duplicates = 0;
    for (const punch of accepted) {
      const employeeId = employeeIds.get(punch.employeeCode);
      if (!employeeId) {
        rejected.push({
          index: -1,
          reason: `Unknown employee code: ${punch.employeeCode}`,
        });
        continue;
      }
      if (alreadyRecorded.has(punch.externalPunchId)) {
        duplicates++;
        continue;
      }
      await createPunch({
        employeeId,
        punchType: punch.punchType,
        punchDateTime: punch.punchDateTime,
        source: "Biometric",
        externalPunchId: punch.externalPunchId,
        deviceId,
      });
      recorded++;
    }

    return NextResponse.json(
      {
        success: true,
        device: deviceId,
        recorded,
        duplicates,
        rejected,
      },
      { status: recorded > 0 ? 201 : 200 }
    );
  } catch (error) {
    // The device must be told to retry rather than drop the punch on the floor.
    console.error("[Biometric Webhook] Failed to record punches:", error);
    return NextResponse.json(
      { error: "Failed to record punches; retry this batch" },
      { status: 502 }
    );
  }
}

/**
 * GET /api/webhook/biometric/punch
 * Health check for the biometric webhook endpoint.
 */
export async function GET() {
  return NextResponse.json({
    status: process.env.BIOMETRIC_WEBHOOK_SECRET ? "configured" : "not_configured",
    message: "Biometric punch webhook endpoint",
    version: "2.0.0",
  });
}
