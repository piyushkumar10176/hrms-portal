import { NextRequest, NextResponse } from "next/server";
import { queryOneOrNull, updateRecord } from "@/lib/salesforce";
import { hashSync } from "bcryptjs";
import { escapeSoqlString } from "@/lib/soql";
import { hashToken, isExpired, validatePassword } from "@/lib/tokens";

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();
    if (!token || !password) {
      return NextResponse.json({ error: "Token and password are required" }, { status: 400 });
    }

    // The same rules the reset flow applies, rather than a bare length check.
    const weakness = validatePassword(password);
    if (weakness) {
      return NextResponse.json({ error: weakness }, { status: 400 });
    }

    // Looked up by hash. The token itself is never stored, so a reader of
    // Employee records cannot claim an account before its owner does.
    const emp = await queryOneOrNull<{ Id: string; Invite_Token_Expires_At__c: string }>(`
      SELECT Id, Invite_Token_Expires_At__c
      FROM Employee__c
      WHERE Invite_Token_Hash__c = '${escapeSoqlString(hashToken(token))}'
        AND Employee_Status__c = 'Active'
      LIMIT 1
    `);

    if (!emp) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
    }

    if (isExpired(emp.Invite_Token_Expires_At__c)) {
      return NextResponse.json(
        { error: "That invitation has expired. Ask HR to send a new one." },
        { status: 400 }
      );
    }

    // Hash password and save to SF; burn the token so the link is single use.
    const hash = hashSync(password, 10);
    await updateRecord("Employee__c", emp.Id, {
      Password_Hash__c: hash,
      Invite_Token_Hash__c: null,
      Invite_Token__c: null,
      Invite_Token_Expires_At__c: null,
      Password_Changed_At__c: new Date().toISOString(),
      Failed_Login_Attempts__c: 0,
      Lockout_Until__c: null,
    });

    return NextResponse.json({ message: "Password setup successfully. You can now log in." }, { status: 200 });
  } catch (error) {
    console.error("Setup password error:", error);
    return NextResponse.json({ error: "An error occurred" }, { status: 500 });
  }
}
