"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

interface ExpenseLine { Id: string; Category__c: string; Description__c: string; Amount__c: number; Date__c: string; }
interface ExpenseReport {
  Id: string; Name: string; Title__c: string; Total_Amount__c: number; Status__c: string;
  Submitted_On__c?: string; Approver__r?: { Name: string }; CreatedDate: string;
  Lines__r?: { records: ExpenseLine[] };
}

export default function ExpensesPage() {
  const { data: session } = useSession();
  const [reports, setReports] = useState<ExpenseReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [form, setForm] = useState({ title: "", notes: "" });
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { if (session) fetchReports(); }, [session]);

  async function fetchReports() {
    try {
      const res = await fetch("/api/expenses");
      const data = await res.json();
      if (res.ok) setReports(data.reports || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  const handleSubmit = async () => {
    if (!form.title) { setMsg({ text: "Title is required", type: "error" }); return; }
    try {
      const res = await fetch("/api/expenses", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setMsg({ text: "Expense report created!", type: "success" });
        setShowForm(false); setForm({ title: "", notes: "" }); fetchReports();
      } else { const d = await res.json(); setMsg({ text: d.error, type: "error" }); }
    } catch { setMsg({ text: "Failed to submit", type: "error" }); }
  };

  const statusColor = (s: string) => {
    if (s === "Approved" || s === "Paid") return "bg-green-100 text-green-700";
    if (s === "Rejected") return "bg-red-100 text-red-700";
    if (s === "Submitted") return "bg-blue-100 text-blue-700";
    return "bg-gray-100 text-gray-600";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expense Reports</h1>
          <p className="text-gray-500 mt-1">Submit and track expense reimbursements</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setMsg(null); }}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
          {showForm ? "✕ Cancel" : "+ New Report"}
        </button>
      </div>

      {msg && <div className={`px-4 py-3 rounded-lg text-sm border ${msg.type === "success" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>{msg.text}</div>}

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h3 className="font-semibold text-gray-900">New Expense Report</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Client Visit - Delhi" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <button onClick={handleSubmit}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">Create Report</button>
        </div>
      )}

      <div className="space-y-4">
        {loading ? <div className="text-center py-10 text-gray-400">Loading...</div> :
          reports.length > 0 ? reports.map(r => (
            <div key={r.Id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-5 flex items-center justify-between cursor-pointer" onClick={() => setExpanded(expanded === r.Id ? null : r.Id)}>
                <div>
                  <h3 className="font-semibold text-gray-900">{r.Title__c || r.Name}</h3>
                  <p className="text-sm text-gray-500 mt-1">{new Date(r.CreatedDate).toLocaleDateString("en-IN")} • Approver: {r.Approver__r?.Name || "—"}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-bold text-gray-900">₹{(r.Total_Amount__c || 0).toLocaleString("en-IN")}</span>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor(r.Status__c)}`}>{r.Status__c}</span>
                </div>
              </div>
              {expanded === r.Id && r.Lines__r?.records && r.Lines__r.records.length > 0 && (
                <div className="border-t border-gray-200 px-5 py-4 bg-gray-50">
                  <table className="w-full text-sm">
                    <thead><tr className="text-gray-500"><th className="text-left py-1">Category</th><th className="text-left py-1">Description</th><th className="text-left py-1">Date</th><th className="text-right py-1">Amount</th></tr></thead>
                    <tbody>
                      {r.Lines__r.records.map(l => (
                        <tr key={l.Id} className="border-t border-gray-200">
                          <td className="py-2">{l.Category__c}</td>
                          <td className="py-2">{l.Description__c}</td>
                          <td className="py-2">{l.Date__c ? new Date(l.Date__c).toLocaleDateString("en-IN") : "—"}</td>
                          <td className="py-2 text-right">₹{(l.Amount__c || 0).toLocaleString("en-IN")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )) : <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center text-gray-500">No expense reports found.</div>
        }
      </div>
    </div>
  );
}
