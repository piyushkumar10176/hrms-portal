import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query, createRecord, updateRecord, deleteRecord } from "@/lib/salesforce";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const designations = await query<{
      Id: string; Name: string; Code__c: string; Status__c: string;
      Grade__c: number; Department__c: string;
      Department__r: { Name: string } | null;
    }>(`
      SELECT Id, Name, Code__c, Status__c, Grade__c,
             Department__c, Department__r.Name
      FROM Designation__c
      ORDER BY Grade__c DESC, Name ASC
    `);

    const result = designations.map(d => ({
      id: d.Id,
      name: d.Name,
      code: d.Code__c || "",
      status: d.Status__c || "Active",
      grade: d.Grade__c || 0,
      departmentId: d.Department__c || null,
      departmentName: d.Department__r?.Name || null,
    }));

    return NextResponse.json({ designations: result, source: "salesforce" });
  } catch (err) {
    console.error("Get designations error:", err);
    return NextResponse.json({ error: "Failed to fetch designations" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    if (!body.name) return NextResponse.json({ error: "Designation name is required" }, { status: 400 });

    const id = await createRecord("Designation__c", {
      Name: body.name,
      Code__c: body.code || null,
      Status__c: body.status || "Active",
      Grade__c: body.grade || null,
      Department__c: body.departmentId || null,
    });

    return NextResponse.json({ id, message: "Designation created" }, { status: 201 });
  } catch (err) {
    console.error("Create designation error:", err);
    return NextResponse.json({ error: "Failed to create designation" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "Designation ID is required" }, { status: 400 });

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.Name = body.name;
    if (body.code !== undefined) data.Code__c = body.code;
    if (body.status !== undefined) data.Status__c = body.status;
    if (body.grade !== undefined) data.Grade__c = body.grade;
    if (body.departmentId !== undefined) data.Department__c = body.departmentId || null;

    await updateRecord("Designation__c", body.id, data);
    return NextResponse.json({ message: "Designation updated" });
  } catch (err) {
    console.error("Update designation error:", err);
    return NextResponse.json({ error: "Failed to update designation" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Designation ID is required" }, { status: 400 });

    await deleteRecord("Designation__c", id);
    return NextResponse.json({ message: "Designation deleted" });
  } catch (err) {
    console.error("Delete designation error:", err);
    return NextResponse.json({ error: "Failed to delete designation" }, { status: 500 });
  }
}
