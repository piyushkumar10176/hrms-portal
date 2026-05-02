"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

interface Approval {
  id: string; employeeId: string; leaveType: string; fromDate: string;
  toDate: string; days: number; reason: string; status: string; appliedOn: string;
}
interface EmpInfo { id: string; firstName: string; lastName: string; department: string; }

export default function ApprovalsPage() {
  const { data: session } = useSession();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [employees, setEmployees] = useState<EmpInfo[]>([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  const isAdmin = session?.user?.role === "admin";

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/approvals").then(r => r.json()).then(d => setApprovals(d.approvals || []));
    fetch("/api/employees").then(r => r.json()).then(d => setEmployees(d.employees || [])).catch(() => {});
  }, [isAdmin]);

  const getEmpName = (id: string) => {
    const e = employees.find(emp => emp.id === id);
    return e ? `${e.firstName} ${e.lastName}` : `Employee #${id}`;
  };
  const getEmpDept = (id: string) => {
    const e = employees.find(emp => emp.id === id);
    return e?.department || "";
  };

  const handleAction = async (requestId: string, action: "approve" | "reject") => {
    setLoading(requestId);
    const res = await fetch("/api/approvals", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, action }),
    });
    const data = await res.json();
    setMsg(data.message);
    setApprovals(prev => prev.filter(a => a.id !== requestId));
    setLoading(null);
  };

  if (!isAdmin) {
    return (
      <div className="text-center py-20">
        <span className="text-5xl">🔒</span>
        <p className="text-gray-500 mt-4">This page is only accessible to administrators.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Leave Approvals</h1>
        <p className="text-gray-500 mt-1">Review and approve employee leave requests</p>
      </div>

      {msg && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">{msg}</div>}

      {approvals.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 text-center py-16">
          <span className="text-5xl">✅</span>
          <p className="text-lg font-semibold text-gray-900 mt-4">All caught up!</p>
          <p className="text-gray-500 mt-1">No pending leave requests to review.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {approvals.map(a => (
            <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-bold text-indigo-600 shrink-0">
                    {getEmpName(a.employeeId).split(" ").map(n => n[0]).join("")}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{getEmpName(a.employeeId)}</p>
                    <p className="text-xs text-gray-400">{getEmpDept(a.employeeId)}</p>
                    <p className="text-sm text-gray-500 mt-1">{a.leaveType} • {a.days} day(s)</p>
                    <p className="text-sm text-gray-500">
                      {new Date(a.fromDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} → {new Date(a.toDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                    {a.reason && <p className="text-sm text-gray-600 mt-2 italic">&ldquo;{a.reason}&rdquo;</p>}
                    <p className="text-xs text-gray-400 mt-2">Applied on {new Date(a.appliedOn).toLocaleString("en-IN")}</p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => handleAction(a.id, "approve")} disabled={loading === a.id}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
                    ✓ Approve
                  </button>
                  <button onClick={() => handleAction(a.id, "reject")} disabled={loading === a.id}
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
