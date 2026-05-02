"use client";

import { useEffect, useState } from "react";

interface Balance { leaveType: string; code: string; total: number; used: number; available: number; color: string; }
interface LeaveReq { id: string; leaveType: string; fromDate: string; toDate: string; days: number; reason: string; status: string; appliedOn: string; }

export default function LeavePage() {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [requests, setRequests] = useState<LeaveReq[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ leaveType: "Casual Leave", fromDate: "", toDate: "", reason: "" });
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refreshData = () => {
    fetch("/api/leave/balances").then(r => r.json()).then(d => setBalances(d.balances || []));
    fetch("/api/leave/apply").then(r => r.json()).then(d => setRequests(d.requests || []));
  };

  useEffect(() => { refreshData(); }, []);

  const handleApply = async () => {
    if (!form.fromDate || !form.toDate) { setMsg({ text: "Please select both from and to dates", type: "error" }); return; }
    if (new Date(form.fromDate) > new Date(form.toDate)) { setMsg({ text: "From date must be before to date", type: "error" }); return; }
    if (new Date(form.fromDate) < new Date(new Date().toISOString().split("T")[0])) { setMsg({ text: "Cannot apply leave for past dates", type: "error" }); return; }

    setSubmitting(true);
    const from = new Date(form.fromDate);
    const to = new Date(form.toDate);
    const days = Math.ceil((to.getTime() - from.getTime()) / 86400000) + 1;

    const res = await fetch("/api/leave/apply", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, days }),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg({ text: data.message, type: "success" });
      setShowForm(false);
      setForm({ leaveType: "Casual Leave", fromDate: "", toDate: "", reason: "" });
      refreshData();
    } else {
      setMsg({ text: data.error, type: "error" });
    }
    setSubmitting(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Management</h1>
          <p className="text-gray-500 mt-1">View balances and apply for leave</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setMsg(null); }} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
          {showForm ? "✕ Cancel" : "+ Apply Leave"}
        </button>
      </div>

      {msg && (
        <div className={`px-4 py-3 rounded-lg text-sm border ${msg.type === "success" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
          {msg.text}
        </div>
      )}

      {/* Leave Balances */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {balances.map((b, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: b.color }} />
            <p className="text-xs text-gray-500 uppercase tracking-wide">{b.code}</p>
            <p className="text-sm font-medium text-gray-700 mt-1">{b.leaveType}</p>
            <div className="flex items-end gap-1 mt-3">
              <span className="text-3xl font-bold" style={{ color: b.color }}>{b.available}</span>
              <span className="text-sm text-gray-400 mb-1">/ {b.total}</span>
            </div>
            <div className="mt-2 bg-gray-100 rounded-full h-1.5 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${(b.used / b.total) * 100}%`, backgroundColor: b.color }} />
            </div>
            <p className="text-xs text-gray-400 mt-1">{b.used} used</p>
          </div>
        ))}
      </div>

      {/* Apply Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Apply for Leave</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Leave Type</label>
              <select value={form.leaveType} onChange={e => setForm({ ...form, leaveType: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {balances.map((b, i) => <option key={i} value={b.leaveType}>{b.leaveType} ({b.available} available)</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
              <input type="date" value={form.fromDate} onChange={e => setForm({ ...form, fromDate: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
              <input type="date" value={form.toDate} onChange={e => setForm({ ...form, toDate: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <input type="text" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Optional reason" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <button onClick={handleApply} disabled={submitting} className="mt-4 bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {submitting ? "Submitting..." : "Submit Leave Request"}
          </button>
        </div>
      )}

      {/* Leave History */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Leave History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">From</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">To</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Days</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Reason</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">No leave requests yet</td></tr>
              ) : requests.map((r, i) => (
                <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{r.leaveType}</td>
                  <td className="px-4 py-3">{new Date(r.fromDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                  <td className="px-4 py-3">{new Date(r.toDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                  <td className="px-4 py-3">{r.days}</td>
                  <td className="px-4 py-3 text-gray-500">{r.reason || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      r.status === "Approved" ? "bg-green-100 text-green-700" :
                      r.status === "Rejected" ? "bg-red-100 text-red-700" :
                      "bg-yellow-100 text-yellow-700"
                    }`}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
