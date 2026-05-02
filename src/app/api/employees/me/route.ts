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

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  
  // Restrict what an employee can self-edit
  const allowedUpdates = {
    phone: body.phone,
    dateOfBirth: body.dateOfBirth,
    gender: body.gender,
    address: body.address,
    city: body.city,
    bankName: body.bankName,
    accountNumber: body.accountNumber,
    ifscCode: body.ifscCode,
    panNumber: body.panNumber,
    aadharNumber: body.aadharNumber
  };

  const updated = db.updateEmployee(session.user.id, allowedUpdates);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ employee: updated }, { status: 200 });
}
