import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAllEmployees } from "@/lib/salesforce-queries";

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sfEmployees = await getAllEmployees();
    
    const tree = sfEmployees.map(e => ({
      id: e.Id,
      name: e.Name,
      designation: e.Designation__c || "Employee",
      department: e.Department__c || "General",
      managerId: e.Reporting_Manager__c || null,
      employeeId: e.Employee_Code__c || e.Id
    }));
    
    const employees = sfEmployees.map(e => {
      const directReports = sfEmployees
        .filter(r => r.Reporting_Manager__c === e.Id)
        .map(r => ({ id: r.Id, name: r.Name, designation: r.Designation__c || "Employee" }));
      
      return {
        id: e.Id,
        firstName: e.First_Name__c || e.Name.split(" ")[0],
        lastName: e.Last_Name__c || e.Name.split(" ")[1] || "",
        employeeId: e.Employee_Code__c || e.Id,
        department: e.Department__c || "",
        designation: e.Designation__c || "",
        email: e.Official_Email__c,
        dateOfJoining: e.Date_of_Joining__c,
        managerId: e.Reporting_Manager__c || null,
        managerName: e.Reporting_Manager__r?.Name || null,
        directReports
      };
    });
    
    return NextResponse.json({ tree, employees, source: "salesforce" });
  } catch (error) {
    console.error("Salesforce get org tree error:", error);
    return NextResponse.json({ error: "Failed to fetch organization data" }, { status: 500 });
  }
}
