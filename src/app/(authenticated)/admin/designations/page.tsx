"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

interface Designation {
  id: string; name: string; code: string; status: string;
  grade: number; departmentId: string | null; departmentName: string | null;
}
interface Department { id: string; name: string; }

export default function AdminDesignationsPage() {
  const { data: session } = useSession();
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{text:string, type:string}|null>(null);
  const [form, setForm] = useState({ name: "", code: "", status: "Active", grade: "", departmentId: "" });

  const isAdmin = session?.user?.role === "admin";

  const fetchData = () => {
    fetch("/api/designations").then(r => r.json()).then(d => setDesignations(d.designations || []));
    fetch("/api/departments").then(r => r.json()).then(d => setDepartments(d.departments || []));
  };

  useEffect(() => { if (session) fetchData(); }, [session]);

  const handleSave = async () => {
    if (!form.name) { setMsg({ text: "Designation name is required", type: "error" }); return; }
    const method = editingId ? "PUT" : "POST";
    const body = editingId
      ? { id: editingId, name: form.name, code: form.code, status: form.status, grade: form.grade ? Number(form.grade) : null, departmentId: form.departmentId || null }
      : { name: form.name, code: form.code, status: form.status, grade: form.grade ? Number(form.grade) : null, departmentId: form.departmentId || null };
    const res = await fetch("/api/designations", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) {
      fetchData(); setShowForm(false); setEditingId(null);
      setMsg({ text: `Designation ${editingId ? "updated" : "created"} successfully!`, type: "success" });
    } else { const d = await res.json(); setMsg({ text: d.error, type: "error" }); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete designation "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/designations?id=${id}`, { method: "DELETE" });
    if (res.ok) { fetchData(); setMsg({ text: "Designation deleted", type: "success" }); }
    else { const d = await res.json(); setMsg({ text: d.error, type: "error" }); }
  };

  const openEdit = (desig: Designation) => {
    setEditingId(desig.id);
    setForm({ name: desig.name, code: desig.code, status: desig.status, grade: desig.grade ? String(desig.grade) : "", departmentId: desig.departmentId || "" });
    setShowForm(true); setMsg(null);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm({ name: "", code: "", status: "Active", grade: "", departmentId: "" });
    setShowForm(true); setMsg(null);
  };

  if (!isAdmin) return <div className="text-center py-10 text-gray-500">Admin access required</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Designation Management</h1>
          <p className="text-gray-500 mt-1">{designations.length} designations configured</p>
        </div>
        <button onClick={() => showForm ? setShowForm(false) : openAdd()} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
          {showForm ? "✕ Cancel" : "+ Add Designation"}
        </button>
      </div>

      {msg && <div className={`px-4 py-3 rounded-lg text-sm border ${msg.type === "success" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>{msg.text}</div>}

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-lg">
          <h3 className="font-semibold text-gray-900 mb-4">{editingId ? "Edit Designation" : "Add Designation"}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Designation Name *</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. Salesforce Developer" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
              <input type="text" value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. SFDEV" maxLength={20} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Grade Level</label>
              <input type="number" value={form.grade} onChange={e => setForm({ ...form, grade: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="1-99" min={1} max={99} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <select value={form.departmentId} onChange={e => setForm({ ...form, departmentId: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">No specific department</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
          <button onClick={handleSave} className="mt-4 bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
            {editingId ? "Save Changes" : "Create Designation"}
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Designation</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Code</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Grade</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Department</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {designations.map(d => (
              <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{d.name}</td>
                <td className="px-4 py-3"><span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-mono">{d.code || "—"}</span></td>
                <td className="px-4 py-3 text-gray-600">{d.grade || "—"}</td>
                <td className="px-4 py-3 text-gray-600">{d.departmentName || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${d.status === "Active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {d.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => openEdit(d)} className="text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 bg-indigo-50 rounded hover:bg-indigo-100 transition-colors text-xs">Edit</button>
                  <button onClick={() => handleDelete(d.id, d.name)} className="text-red-600 hover:text-red-800 font-medium px-2 py-1 bg-red-50 rounded hover:bg-red-100 transition-colors text-xs">Delete</button>
                </td>
              </tr>
            ))}
            {designations.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No designations found. Add your first one!</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
