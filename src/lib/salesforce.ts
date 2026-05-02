/**
 * Salesforce Connection Helper
 * 
 * Reusable server-side Salesforce connection using JSforce.
 * This module provides:
 * - OAuth 2.0 Client Credentials flow (primary — no SOAP needed)
 * - Singleton connection management with auto-refresh
 * - Typed query helpers
 * - Error handling with meaningful messages
 * 
 * Used exclusively in Next.js API Routes (server-side only).
 */

import jsforce, { Connection } from "jsforce";

// ============================================
// Connection Management
// ============================================

let sfConnection: Connection | null = null;
let connectionExpiry: number = 0;

/**
 * Get an authenticated Salesforce connection.
 * 
 * Uses OAuth 2.0 Client Credentials flow (primary).
 * Falls back to Username-Password flow if no client_id/secret.
 * Caches the connection and auto-refreshes when expired.
 */
export async function getSalesforceConnection(): Promise<Connection> {
  // Return cached connection if still valid (with 5-min buffer)
  if (sfConnection && Date.now() < connectionExpiry - 300000) {
    return sfConnection;
  }

  const loginUrl = process.env.SF_LOGIN_URL || "https://login.salesforce.com";
  const clientId = process.env.SF_CLIENT_ID;
  const clientSecret = process.env.SF_CLIENT_SECRET;
  const refreshToken = process.env.SF_REFRESH_TOKEN;
  const instanceUrl = process.env.SF_INSTANCE_URL;

  // Priority 1: Refresh Token Flow (most reliable, works with any org)
  if (refreshToken && instanceUrl) {
    return getRefreshTokenConnection(loginUrl, refreshToken, instanceUrl, clientId, clientSecret);
  }

  // Priority 2: OAuth 2.0 Client Credentials Flow
  if (clientId && clientSecret) {
    return getClientCredentialsConnection(loginUrl, clientId, clientSecret);
  }

  // Priority 3: Username-Password flow
  return getUsernamePasswordConnection(loginUrl);
}

/**
 * OAuth 2.0 Refresh Token Flow.
 * 
 * Most reliable for developer/sandbox orgs where SOAP API 
 * and Client Credentials may be disabled.
 * Uses a long-lived refresh token obtained from SFDX CLI.
 */
async function getRefreshTokenConnection(
  loginUrl: string,
  refreshToken: string,
  instanceUrl: string,
  clientId?: string,
  clientSecret?: string,
): Promise<Connection> {
  try {
    const tokenUrl = `${loginUrl}/services/oauth2/token`;
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId || "PlatformCLI",
    });
    if (clientSecret) params.append("client_secret", clientSecret);

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new SalesforceError(
        `Refresh Token auth failed (${response.status}): ${errorBody}`,
        "AUTH_REFRESH_TOKEN_FAILED"
      );
    }

    const tokenData = await response.json();

    const conn = new Connection({
      instanceUrl: tokenData.instance_url || instanceUrl,
      accessToken: tokenData.access_token,
    });

    sfConnection = conn;
    connectionExpiry = Date.now() + 90 * 60 * 1000;
    console.log("[SF] Connected via OAuth 2.0 Refresh Token flow");
    console.log("[SF] Instance:", tokenData.instance_url || instanceUrl);
    return conn;
  } catch (error) {
    sfConnection = null;
    if (error instanceof SalesforceError) throw error;
    throw new SalesforceError(
      `Salesforce refresh token login failed: ${(error as Error).message}`,
      "AUTH_REFRESH_TOKEN_FAILED"
    );
  }
}

/**
 * OAuth 2.0 Client Credentials Flow.
 * 
 * Server-to-server authentication — no user interaction needed.
 * Requires a Connected App with Client Credentials enabled.
 * Does NOT require SOAP API to be enabled in the org.
 */
async function getClientCredentialsConnection(
  loginUrl: string,
  clientId: string,
  clientSecret: string
): Promise<Connection> {
  try {
    // Token endpoint for Client Credentials flow
    const tokenUrl = `${loginUrl}/services/oauth2/token`;

    const params = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    });

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new SalesforceError(
        `Client Credentials auth failed (${response.status}): ${errorBody}`,
        "AUTH_CLIENT_CREDENTIALS_FAILED"
      );
    }

    const tokenData = await response.json();

    // Create JSforce connection with the access token
    const conn = new Connection({
      instanceUrl: tokenData.instance_url,
      accessToken: tokenData.access_token,
    });

    sfConnection = conn;
    // Access tokens from Client Credentials last ~2 hours
    connectionExpiry = Date.now() + 90 * 60 * 1000;

    console.log("[SF] Connected via OAuth 2.0 Client Credentials flow");
    console.log("[SF] Instance:", tokenData.instance_url);
    return conn;
  } catch (error) {
    sfConnection = null;
    if (error instanceof SalesforceError) throw error;
    throw new SalesforceError(
      `Salesforce Client Credentials login failed: ${(error as Error).message}`,
      "AUTH_CLIENT_CREDENTIALS_FAILED"
    );
  }
}

/**
 * Username-Password OAuth flow (fallback).
 * Uses REST-based OAuth 2.0 password grant (NOT SOAP API).
 * This works even when SOAP API login is disabled.
 */
async function getUsernamePasswordConnection(loginUrl: string): Promise<Connection> {
  const username = process.env.SF_USERNAME;
  const password = process.env.SF_PASSWORD;
  const securityToken = process.env.SF_SECURITY_TOKEN || "";
  const clientId = process.env.SF_CLIENT_ID;
  const clientSecret = process.env.SF_CLIENT_SECRET;

  if (!username || !password) {
    throw new SalesforceError(
      "Missing Salesforce credentials. Set SF_USERNAME + SF_PASSWORD in .env.local",
      "AUTH_CONFIG_ERROR"
    );
  }

  try {
    const tokenUrl = `${loginUrl}/services/oauth2/token`;
    const params = new URLSearchParams({
      grant_type: "password",
      username: username,
      password: password + securityToken,
    });
    
    // Add client credentials if available (required for most Connected Apps)
    if (clientId) params.append("client_id", clientId);
    if (clientSecret) params.append("client_secret", clientSecret);

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new SalesforceError(
        `Password OAuth failed (${response.status}): ${errorBody}`,
        "AUTH_PASSWORD_FAILED"
      );
    }

    const tokenData = await response.json();

    const conn = new Connection({
      instanceUrl: tokenData.instance_url,
      accessToken: tokenData.access_token,
    });

    sfConnection = conn;
    connectionExpiry = Date.now() + 90 * 60 * 1000;
    console.log("[SF] Connected via OAuth 2.0 Password flow");
    console.log("[SF] Instance:", tokenData.instance_url);
    return conn;
  } catch (error) {
    sfConnection = null;
    if (error instanceof SalesforceError) throw error;
    throw new SalesforceError(
      `Salesforce password login failed: ${(error as Error).message}`,
      "AUTH_LOGIN_FAILED"
    );
  }
}

/**
 * Force-refresh the Salesforce connection.
 * Call this if you get a session expired error.
 */
export async function refreshConnection(): Promise<Connection> {
  sfConnection = null;
  connectionExpiry = 0;
  return getSalesforceConnection();
}

// ============================================
// Query Helpers
// ============================================

/**
 * Execute a SOQL query with automatic retry on session expiry.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function query<T>(soql: string): Promise<T[]> {
  const conn = await getSalesforceConnection();

  try {
    const result = await conn.query<T & Record<string, unknown>>(soql);
    return result.records as unknown as T[];
  } catch (error: unknown) {
    const err = error as { errorCode?: string; message?: string };
    // If session expired, refresh and retry once
    if (err.errorCode === "INVALID_SESSION_ID") {
      console.log("[SF] Session expired, refreshing...");
      const newConn = await refreshConnection();
      const result = await newConn.query<T & Record<string, unknown>>(soql);
      return result.records as unknown as T[];
    }
    throw new SalesforceError(
      `SOQL query failed: ${err.message}`,
      "QUERY_ERROR",
      soql
    );
  }
}

/**
 * Execute a SOQL query and return a single record.
 * Throws if no records found.
 */
export async function queryOne<T>(soql: string): Promise<T> {
  const records = await query<T>(soql);
  if (records.length === 0) {
    throw new SalesforceError("No records found", "QUERY_NO_RESULTS", soql);
  }
  return records[0];
}

/**
 * Execute a SOQL query and return a single record, or null if not found.
 */
export async function queryOneOrNull<T>(soql: string): Promise<T | null> {
  const records = await query<T>(soql);
  return records.length > 0 ? records[0] : null;
}

/**
 * Create a new record in Salesforce.
 */
export async function createRecord(
  objectName: string,
  data: Record<string, unknown>
): Promise<string> {
  const conn = await getSalesforceConnection();

  try {
    const result = await conn.sobject(objectName).create(data);
    if (Array.isArray(result)) {
      throw new SalesforceError("Unexpected array result for single create", "CREATE_ERROR");
    }
    if (!result.success) {
      throw new SalesforceError(
        `Create failed: ${JSON.stringify(result.errors)}`,
        "CREATE_FAILED"
      );
    }
    return result.id;
  } catch (error) {
    if (error instanceof SalesforceError) throw error;
    throw new SalesforceError(
      `Failed to create ${objectName}: ${(error as Error).message}`,
      "CREATE_ERROR"
    );
  }
}

/**
 * Update an existing record in Salesforce.
 */
export async function updateRecord(
  objectName: string,
  id: string,
  data: Record<string, unknown>
): Promise<void> {
  const conn = await getSalesforceConnection();

  try {
    const result = await conn.sobject(objectName).update({ Id: id, ...data });
    if (Array.isArray(result)) {
      throw new SalesforceError("Unexpected array result for single update", "UPDATE_ERROR");
    }
    if (!result.success) {
      throw new SalesforceError(
        `Update failed: ${JSON.stringify(result.errors)}`,
        "UPDATE_FAILED"
      );
    }
  } catch (error) {
    if (error instanceof SalesforceError) throw error;
    throw new SalesforceError(
      `Failed to update ${objectName}: ${(error as Error).message}`,
      "UPDATE_ERROR"
    );
  }
}

/**
 * Delete a record from Salesforce.
 */
export async function deleteRecord(objectName: string, id: string): Promise<void> {
  const conn = await getSalesforceConnection();

  try {
    const result = await conn.sobject(objectName).destroy(id);
    if (Array.isArray(result)) {
      throw new SalesforceError("Unexpected array result for single delete", "DELETE_ERROR");
    }
    if (!result.success) {
      throw new SalesforceError(
        `Delete failed: ${JSON.stringify(result.errors)}`,
        "DELETE_FAILED"
      );
    }
  } catch (error) {
    if (error instanceof SalesforceError) throw error;
    throw new SalesforceError(
      `Failed to delete ${objectName}: ${(error as Error).message}`,
      "DELETE_ERROR"
    );
  }
}

// ============================================
// Approval Process Helpers
// ============================================

/**
 * Submit a record for approval in Salesforce.
 */
export async function submitForApproval(
  recordId: string,
  comments?: string
): Promise<void> {
  const conn = await getSalesforceConnection();

  try {
    const request = {
      actionType: "Submit" as const,
      contextId: recordId,
      comments: comments || "Submitted via HRMS portal",
    };
    // Use Salesforce REST API for approval process
    await conn.request({
      method: "POST",
      url: "/services/data/v62.0/process/approvals",
      body: JSON.stringify({ requests: [request] }),
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    throw new SalesforceError(
      `Approval submission failed: ${(error as Error).message}`,
      "APPROVAL_ERROR"
    );
  }
}

// ============================================
// Error Handling
// ============================================

export class SalesforceError extends Error {
  code: string;
  soql?: string;

  constructor(message: string, code: string, soql?: string) {
    super(message);
    this.name = "SalesforceError";
    this.code = code;
    this.soql = soql;
  }
}

/**
 * Create a standardized API error response from a SalesforceError.
 */
export function createErrorResponse(error: unknown) {
  if (error instanceof SalesforceError) {
    return {
      error: error.message,
      code: error.code,
      ...(process.env.NODE_ENV === "development" && { soql: error.soql }),
    };
  }
  return {
    error: "An unexpected error occurred",
    code: "UNKNOWN_ERROR",
  };
}
