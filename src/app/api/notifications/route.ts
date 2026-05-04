import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEmployeeByEmail, getSalesforceConnection } from "@/lib/salesforce-queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const conn = await getSalesforceConnection();
    const sfEmp = await getEmployeeByEmail(session.user.email);

    const query = `
      SELECT Id, Message__c, Is_Read__c, Type__c, CreatedDate
      FROM Notification__c
      WHERE Employee__c = '${sfEmp.Id}'
      ORDER BY CreatedDate DESC
      LIMIT 20
    `;
    const sfRecords = (await conn.query(query)).records as any[];

    const notifications = sfRecords.map(r => ({
      id: r.Id,
      title: r.Type__c || "Notification",
      body: r.Message__c,
      read: r.Is_Read__c || false,
      createdAt: r.CreatedDate
    }));

    const unreadCount = notifications.filter(n => !n.read).length;

    return NextResponse.json({ notifications, unreadCount, source: "salesforce" });
  } catch (err) {
    console.error("Salesforce getNotifications error:", err);
    return NextResponse.json({ notifications: [], unreadCount: 0, source: "salesforce" });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const conn = await getSalesforceConnection();
    const sfEmp = await getEmployeeByEmail(session.user.email);

    const body = await req.json();
    if (body.action === "markAllRead") {
      const query = `SELECT Id FROM Notification__c WHERE Employee__c = '${sfEmp.Id}' AND Is_Read__c = false`;
      const unread = (await conn.query(query)).records as any[];
      if (unread.length > 0) {
        const toUpdate = unread.map(r => ({ Id: r.Id, Is_Read__c: true }));
        await conn.update("Notification__c", toUpdate);
      }
    }
    
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Salesforce markAllRead error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
