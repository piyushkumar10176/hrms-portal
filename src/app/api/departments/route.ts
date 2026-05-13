import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query, createRecord, updateRecord, deleteRecord } from "@/lib/salesforce";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const departments = await query<{
      Id: string; Name: string; Code__c: string; Status__c: string;
      Head__c: string; Head__r: { Name: string } | null;
      Parent_Department__c: string; Parent_Department__r: { Name: string } | null;
    }>(`
      SELECT Id, Name, Code__c, Status__c,
             Head__c, Head__r.Name,
             Parent_Department__c, Parent_Department__r.Name,
             (SELECT Id FROM Employees__r)
      FROM Department__c
      ORDER BY Name ASC
    `);

    const result = departments.map(d => ({
      id: d.Id,
      name: d.Name,
      code: d.Code__c || "",
      status: d.Status__c || "Active",
      headId: d.Head__c || null,
      headName: d.Head__r?.Name || null,
      parentDepartmentId: d.Parent_Department__c || null,
      parentDepartmentName: d.Parent_Department__r?.Name || null,
    }));

    return NextResponse.json({ departments: result, source: "salesforce" });
  } catch (err) {
    console.error("Get departments error:", err);
    return NextResponse.json({ error: "Failed to fetch departments" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    if (!body.name) return NextResponse.json({ error: "Department name is required" }, { status: 400 });

    const id = await createRecord("Department__c", {
      Name: body.name,
      Code__c: body.code || null,
      Status__c: body.status || "Active",
      Head__c: body.headId || null,
      Parent_Department__c: body.parentDepartmentId || null,
    });

    return NextResponse.json({ id, message: "Department created" }, { status: 201 });
  } catch (err) {
    console.error("Create department error:", err);
    return NextResponse.json({ error: "Failed to create department" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "Department ID is required" }, { status: 400 });

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.Name = body.name;
    if (body.code !== undefined) data.Code__c = body.code;
    if (body.status !== undefined) data.Status__c = body.status;
    if (body.headId !== undefined) data.Head__c = body.headId || null;
    if (body.parentDepartmentId !== undefined) data.Parent_Department__c = body.parentDepartmentId || null;

    await updateRecord("Department__c", body.id, data);
    return NextResponse.json({ message: "Department updated" });
  } catch (err) {
    console.error("Update department error:", err);
    return NextResponse.json({ error: "Failed to update department" }, { status: 500 });
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
    if (!id) return NextResponse.json({ error: "Department ID is required" }, { status: 400 });

    await deleteRecord("Department__c", id);
    return NextResponse.json({ message: "Department deleted" });
  } catch (err) {
    console.error("Delete department error:", err);
    return NextResponse.json({ error: "Failed to delete department" }, { status: 500 });
  }
}
