"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

interface Approval {
  id: string; 
  type: string; 
  employeeId: string; 
  employeeName: string; 
  details: string; 
  reason: string; 
  appliedOn: string;
}

interface EmpInfo { id: string; firstName: string; lastName: string; department: string; }

export default function ApprovalsPage() {
  const { data: session } = useSession();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [employees, setEmployees] = useState<EmpInfo[]>([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/approvals").then(r => r.json()).then(d => setApprovals(d.approvals || []));
    fetch("/api/employees").then(r => r.json()).then(d => setEmployees(d.employees || [])).catch(() => {});
  }, [session]);

  const getEmpDept = (id: string) => {
    const e = employees.find(emp => emp.id === id);
    return e?.department || "";
  };

  const handleAction = async (requestId: string, type: string, employeeId: string, action: "approve" | "reject") => {
    setLoading(requestId);
    const res = await fetch("/api/approvals", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, action, type, employeeId }),
    });
    const data = await res.json();
    setMsg(data.message);
    setApprovals(prev => prev.filter(a => a.id !== requestId));
    setLoading(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Unified Approvals Inbox</h1>
        <p className="text-gray-500 mt-1">Review and approve all pending requests from your team</p>
      </div>

      {msg && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">{msg}</div>}

      {approvals.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 text-center py-16">
          <span className="text-5xl">✅</span>
          <p className="text-lg font-semibold text-gray-900 mt-4">All caught up!</p>
          <p className="text-gray-500 mt-1">No pending requests to review.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {approvals.map(a => (
            <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-sm transition-all">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-bold text-indigo-600 shrink-0">
                    {a.employeeName.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-gray-900">{a.employeeName}</p>
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-bold uppercase rounded-full tracking-wide">
                        {a.type}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mb-2">{getEmpDept(a.employeeId)}</p>
                    <p className="text-sm text-gray-700 font-medium">{a.details}</p>
                    {a.reason && <p className="text-sm text-gray-600 mt-2 italic border-l-2 border-gray-200 pl-3 py-1 bg-gray-50">&ldquo;{a.reason}&rdquo;</p>}
                    <p className="text-xs text-gray-400 mt-3">Applied on {new Date(a.appliedOn).toLocaleString("en-IN")}</p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => handleAction(a.id, a.type, a.employeeId, "approve")} disabled={loading === a.id}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
                    ✓ Approve
                  </button>
                  <button onClick={() => handleAction(a.id, a.type, a.employeeId, "reject")} disabled={loading === a.id}
                    className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50 transition-colors">
                    ✕ Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
