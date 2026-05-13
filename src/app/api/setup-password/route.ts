import { NextRequest, NextResponse } from "next/server";
import { queryOneOrNull, updateRecord } from "@/lib/salesforce";
import { hashSync } from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();
    if (!token || !password) {
      return NextResponse.json({ error: "Token and password are required" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    // Find employee by invite token + check expiry
    const emp = await queryOneOrNull<{ Id: string; Invite_Token_Expires_At__c: string }>(`
      SELECT Id, Invite_Token_Expires_At__c
      FROM Employee__c
      WHERE Invite_Token__c = '${token.replace(/'/g, "\\'")}'
        AND Employee_Status__c = 'Active'
      LIMIT 1
    `);

    if (!emp) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
    }

    // Validate token expiry
    if (emp.Invite_Token_Expires_At__c) {
      const expiresAt = new Date(emp.Invite_Token_Expires_At__c);
      if (expiresAt < new Date()) {
        return NextResponse.json({ error: "Token has expired. Please request a new invitation." }, { status: 400 });
      }
    }

    // Hash password and save to SF; clear token
    const hash = hashSync(password, 10);
    await updateRecord("Employee__c", emp.Id, {
      Password_Hash__c: hash,
      Invite_Token__c: null,
      Invite_Token_Expires_At__c: null,
    });

    return NextResponse.json({ message: "Password setup successfully. You can now log in." }, { status: 200 });
  } catch (error) {
    console.error("Setup password error:", error);
    return NextResponse.json({ error: "An error occurred" }, { status: 500 });
  }
}
