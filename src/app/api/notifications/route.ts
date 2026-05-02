import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/mock-data";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const notifications = db.getNotifications(session.user.id);
  const unreadCount = db.getUnreadCount(session.user.id);
  return NextResponse.json({ notifications, unreadCount });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action, notificationId } = await req.json();
  if (action === "markRead" && notificationId) {
    db.markRead(notificationId);
  } else if (action === "markAllRead") {
    db.markAllRead(session.user.id);
  }

  return NextResponse.json({ success: true });
}
