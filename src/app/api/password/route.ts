import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { queryOneOrNull, updateRecord } from "@/lib/salesforce";
import { compareSync, hashSync } from "bcryptjs";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { oldPassword, newPassword } = await req.json();
  if (!oldPassword || !newPassword) return NextResponse.json({ error: "Both old and new password are required" }, { status: 400 });
  if (newPassword.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });

  try {
    // Fetch current hash from SF
    const emp = await queryOneOrNull<{ Id: string; Password_Hash__c: string }>(`
      SELECT Id, Password_Hash__c FROM Employee__c WHERE Id = '${session.user.id}' LIMIT 1
    `);
    if (!emp || !emp.Password_Hash__c) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

    // Verify old password
    if (!compareSync(oldPassword, emp.Password_Hash__c)) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }

    // Hash new password and update in SF
    const newHash = hashSync(newPassword, 10);
    await updateRecord("Employee__c", emp.Id, { Password_Hash__c: newHash });

    return NextResponse.json({ message: "Password changed successfully" });
  } catch (err) {
    console.error("Password change error:", err);
    return NextResponse.json({ error: "Failed to change password" }, { status: 500 });
  }
}
