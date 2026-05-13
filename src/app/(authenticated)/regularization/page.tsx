"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

interface RegRequest {
  Id: string;
  Date__c: string;
  Requested_Clock_In__c?: string;
  Requested_Clock_Out__c?: string;
  Reason__c: string;
  Status__c: string;
  Approver__r?: { Name: string };
  CreatedDate: string;
}

export default function RegularizationPage() {
  const { data: session } = useSession();
  const [requests, setRequests] = useState<RegRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [form, setForm] = useState({ date: "", clockIn: "", clockOut: "", reason: "" });

  useEffect(() => {
    if (session) fetchRequests();
  }, [session]);

  const fetchRequests = async () => {
    try {
      const res = await fetch("/api/regularization");
      const data = await res.json();
      if (res.ok) setRequests(data.requests || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleSubmit = async () => {
    if (!form.date || !form.reason) {
      setMsg({ text: "Date and reason are required", type: "error" }); return;
    }
    try {
      const res = await fetch("/api/regularization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg({ text: "Request submitted successfully!", type: "success" });
        setShowForm(false);
        setForm({ date: "", clockIn: "", clockOut: "", reason: "" });
        fetchRequests();
      } else {
        setMsg({ text: data.error, type: "error" });
      }
    } catch { setMsg({ text: "Failed to submit", type: "error" }); }
  };

  const statusColor = (s: string) => {
    if (s === "Approved") return "bg-green-100 text-green-700";
    if (s === "Rejected") return "bg-red-100 text-red-700";
    return "bg-yellow-100 text-yellow-700";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance Regularization</h1>
          <p className="text-gray-500 mt-1">Request corrections for missed or incorrect punches</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setMsg(null); }}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
          {showForm ? "✕ Cancel" : "+ New Request"}
        </button>
      </div>

      {msg && <div className={`px-4 py-3 rounded-lg text-sm border ${msg.type === "success" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>{msg.text}</div>}

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h3 className="font-semibold text-gray-900">New Regularization Request</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
                max={new Date().toISOString().split("T")[0]}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Clock In Time</label>
              <input type="time" value={form.clockIn} onChange={e => setForm({ ...form, clockIn: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Clock Out Time</label>
              <input type="time" value={form.clockOut} onChange={e => setForm({ ...form, clockOut: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
            <textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
              rows={3} placeholder="Explain why regularization is needed..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <button onClick={handleSubmit}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
            Submit Request
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h3 className="font-semibold text-gray-900">My Requests</h3>
        </div>
        {loading ? (
          <div className="p-6 text-center text-gray-400">Loading...</div>
        ) : requests.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Date</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Clock In</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Clock Out</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Reason</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Approver</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {requests.map(r => (
                  <tr key={r.Id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">{r.Date__c ? new Date(r.Date__c).toLocaleDateString("en-IN") : "—"}</td>
                    <td className="px-6 py-4 whitespace-nowrap">{r.Requested_Clock_In__c || "—"}</td>
                    <td className="px-6 py-4 whitespace-nowrap">{r.Requested_Clock_Out__c || "—"}</td>
                    <td className="px-6 py-4 max-w-[200px] truncate">{r.Reason__c}</td>
                    <td className="px-6 py-4 whitespace-nowrap">{r.Approver__r?.Name || "—"}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor(r.Status__c)}`}>{r.Status__c}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center text-gray-500">No regularization requests found.</div>
        )}
      </div>
    </div>
  );
}
