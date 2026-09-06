import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSalesforceConnection } from "@/lib/salesforce";
import { assertSalesforceId } from "@/lib/soql";
import { getSessionEmployee, StaleSessionError } from "@/lib/session-employee";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const conn = await getSalesforceConnection();
    const sfEmp = await getSessionEmployee(session);

    const query = `
      SELECT Id, Message__c, Is_Read__c, Type__c, CreatedDate
      FROM Notification__c
      WHERE Employee__c = '${assertSalesforceId(sfEmp.Id)}'
      ORDER BY CreatedDate DESC
      LIMIT 20
    `;
    interface NotificationRow {
      Id: string;
      Message__c?: string | null;
      Is_Read__c?: boolean | null;
      Type__c?: string | null;
      CreatedDate?: string;
    }
    const sfRecords = (await conn.query(query)).records as unknown as NotificationRow[];

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
    if (err instanceof StaleSessionError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    // Previously this returned an empty list, so a broken query left the bell
    // permanently empty with no signal to anyone. Surface it instead.
    console.error("Salesforce getNotifications error:", err);
    return NextResponse.json(
      { error: "Failed to load notifications", notifications: [], unreadCount: 0 },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const conn = await getSalesforceConnection();
    const sfEmp = await getSessionEmployee(session);

    const body = await req.json();
    if (body.action === "markAllRead") {
      const query = `SELECT Id FROM Notification__c WHERE Employee__c = '${assertSalesforceId(sfEmp.Id)}' AND Is_Read__c = false`;
      const unread = (await conn.query(query)).records as unknown as { Id: string }[];
      if (unread.length > 0) {
        const toUpdate = unread.map(r => ({ Id: r.Id, Is_Read__c: true }));
        await conn.update("Notification__c", toUpdate);
      }
    }
    
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof StaleSessionError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("Salesforce markAllRead error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
