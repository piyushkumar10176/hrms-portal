import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/mock-data";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const emp = db.getEmployee(session.user.id);
  if (!emp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const history = db.getHistory(session.user.id);

  return NextResponse.json({ employee: emp, history });
}
