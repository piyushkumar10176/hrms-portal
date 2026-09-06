/**
 * API Route Helper Utilities
 * 
 * Reusable patterns for Next.js API routes:
 * - Session validation
 * - Employee ID resolution
 * - Error response formatting
 * - Request parsing
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "./auth";
import { getEmployeeByEmail } from "./salesforce-queries";
import { createErrorResponse, SalesforceError } from "./salesforce";

// In-memory cache for employee ID lookups (cleared on server restart)
const employeeIdCache = new Map<string, { id: string; expiresAt: number }>();

/**
 * Get the authenticated user's session from a request.
 * Returns null if not authenticated.
 */
export async function getSession() {
  return await auth();
}

/**
 * Resolve the Salesforce Employee ID from the authenticated user's email.
 * Caches the result for 30 minutes to avoid repeated Salesforce calls.
 */
export async function resolveEmployeeId(email: string): Promise<string> {
  // Check cache first
  const cached = employeeIdCache.get(email);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.id;
  }

  // Query Salesforce
  const employee = await getEmployeeByEmail(email);
  const id = employee.Id;

  // Cache for 30 minutes
  employeeIdCache.set(email, {
    id,
    expiresAt: Date.now() + 30 * 60 * 1000,
  });

  return id;
}

/**
 * Standard authenticated API route wrapper.
 * Handles session validation, employee ID resolution, and error handling.
 * 
 * Usage:
 * ```ts
 * export async function GET(req: NextRequest) {
 *   return withAuth(req, async ({ employeeId, email, session }) => {
 *     // Your API logic here
 *     return NextResponse.json({ data: "..." });
 *   });
 * }
 * ```
 */
 
type SessionData = { user: { name?: string | null; email?: string | null; image?: string | null; employeeId?: string; role?: string } } | null;

export async function withAuth(
  req: NextRequest,
  handler: (ctx: {
    employeeId: string;
    email: string;
    session: SessionData;
  }) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const session = await getSession();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Not authenticated", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const email = session.user.email;

    let employeeId: string;
    try {
      employeeId = await resolveEmployeeId(email);
    } catch {
      return NextResponse.json(
        {
          error: "No employee record found for this email. Contact HR.",
          code: "EMPLOYEE_NOT_FOUND",
        },
        { status: 403 }
      );
    }

    return await handler({ employeeId, email, session });
  } catch (error) {
    console.error("[API Error]", error);

    if (error instanceof SalesforceError) {
      const status = error.code === "AUTH_LOGIN_FAILED" ? 503 : 500;
      return NextResponse.json(createErrorResponse(error), { status });
    }

    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

/**
 * Parse and validate JSON body from a request.
 */
export async function parseBody<T>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new SalesforceError("Invalid JSON body", "INVALID_REQUEST");
  }
}

/**
 * Create a success response with standard envelope.
 */
export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

/**
 * Create an error response.
 */
export function errorResponse(message: string, code: string, status = 400) {
  return NextResponse.json({ success: false, error: message, code }, { status });
}
