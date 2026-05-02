import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/mock-data";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { oldPassword, newPassword } = await req.json();
  if (!oldPassword || !newPassword) return NextResponse.json({ error: "Both old and new password are required" }, { status: 400 });
  if (newPassword.length < 4) return NextResponse.json({ error: "Password must be at least 4 characters" }, { status: 400 });
  const ok = db.changePassword(session.user.id, oldPassword, newPassword);
  if (!ok) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  return NextResponse.json({ message: "Password changed successfully" });
}
