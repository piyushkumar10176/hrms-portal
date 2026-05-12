import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEmployeeByEmail, getTaxDeclaration } from "@/lib/salesforce-queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const emp = await getEmployeeByEmail(session.user.email);
    const fy = req.nextUrl.searchParams.get("fy") || undefined;
    const declaration = await getTaxDeclaration(emp.Id, fy);
    return NextResponse.json({ declaration, source: "salesforce" });
  } catch (err) {
    console.error("Tax Declaration API Error:", err);
    return NextResponse.json({ error: "Failed to fetch tax declaration" }, { status: 500 });
  }
}
