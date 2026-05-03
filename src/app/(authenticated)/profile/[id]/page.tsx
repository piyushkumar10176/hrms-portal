"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Emp {
  id:string; employeeId:string; firstName:string; lastName:string; email:string; phone:string;
  department:string; designation:string; dateOfJoining:string; role:string; status:string;
  dateOfBirth?:string; gender?:string;
}

interface HistoryRecord {
  id: string; date: string; type: string; description: string;
}

export default function EmployeeProfilePage() {
  const params = useParams();
  const empId = params.id as string;
  const [emp, setEmp] = useState<Emp|null>(null);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [managerName, setManagerName] = useState<string>("");

  useEffect(() => {
    if (!empId) return;
    fetch(`/api/employees/${empId}`).then(r=>r.json()).then(d=>{
      if(d.employee) setEmp(d.employee);
      if(d.history) setHistory(d.history);
    }).catch(()=>{});

    fetch("/api/org").then(r=>r.json()).then(d=>{
      const me = d.employees?.find((e:any)=>e.id===empId);
      if(me?.managerName) setManagerName(me.managerName);
    }).catch(()=>{});
  }, [empId]);

  if(!emp) return <div className="text-center py-20 text-gray-400">Loading employee profile...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 text-white flex items-center gap-6">
        <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center text-3xl font-bold shrink-0">{emp.firstName[0]}{emp.lastName?.[0] || ""}</div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{emp.firstName} {emp.lastName}</h1>
          <p className="opacity-80">{emp.designation} • {emp.department}</p>
          <p className="text-sm opacity-60 mt-1">{emp.employeeId} • {emp.email}</p>
        </div>
      </div>

      {/* Personal Info */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50"><h3 className="font-semibold text-gray-900">Personal Information</h3></div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className="text-xs text-gray-500 uppercase tracking-wide">Phone</label><p className="text-sm font-medium mt-1">{emp.phone||"—"}</p></div>
          <div><label className="text-xs text-gray-500 uppercase tracking-wide">Date of Birth</label><p className="text-sm font-medium mt-1">{emp.dateOfBirth?new Date(emp.dateOfBirth).toLocaleDateString("en-IN"):"—"}</p></div>
          <div><label className="text-xs text-gray-500 uppercase tracking-wide">Gender</label><p className="text-sm font-medium mt-1">{emp.gender||"—"}</p></div>
        </div>
      </div>

      {/* Employment Info */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50"><h3 className="font-semibold text-gray-900">Employment Details</h3></div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className="text-xs text-gray-500 uppercase tracking-wide">Employee ID</label><p className="text-sm font-medium mt-1">{emp.employeeId}</p></div>
          <div><label className="text-xs text-gray-500 uppercase tracking-wide">Department</label><p className="text-sm font-medium mt-1">{emp.department}</p></div>
          <div><label className="text-xs text-gray-500 uppercase tracking-wide">Designation</label><p className="text-sm font-medium mt-1">{emp.designation}</p></div>
          <div><label className="text-xs text-gray-500 uppercase tracking-wide">Date of Joining</label><p className="text-sm font-medium mt-1">{new Date(emp.dateOfJoining).toLocaleDateString("en-IN")}</p></div>
          <div><label className="text-xs text-gray-500 uppercase tracking-wide">Reporting Manager</label><p className="text-sm font-medium mt-1">{managerName||"No Manager"}</p></div>
          <div><label className="text-xs text-gray-500 uppercase tracking-wide">Status</label><p className="text-sm font-medium mt-1">{emp.status}</p></div>
        </div>
      </div>

      {/* History / Timeline */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50"><h3 className="font-semibold text-gray-900">Career History</h3></div>
        <div className="p-6">
          {history.length > 0 ? (
            <div className="space-y-4">
              {history.map(h => (
                <div key={h.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs shrink-0 ${h.type === "Joining" ? "bg-green-100 text-green-700" : h.type === "Promotion" ? "bg-indigo-100 text-indigo-700" : h.type === "Salary Revision" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                    {h.type === "Joining" ? "👋" : h.type === "Promotion" ? "🚀" : h.type === "Salary Revision" ? "💵" : "📋"}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{h.type}</p>
                    <p className="text-xs text-gray-500">{h.description}</p>
                    <p className="text-xs text-gray-400 mt-1">{new Date(h.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center">No history available.</p>
          )}
        </div>
      </div>
    </div>
  );
}
