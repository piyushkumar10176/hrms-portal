"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

interface Department {
  id: string; name: string; code: string; status: string;
  headId: string | null; headName: string | null;
  parentDepartmentId: string | null; parentDepartmentName: string | null;
}
interface Employee { id: string; firstName: string; lastName: string; designation: string; }

export default function AdminDepartmentsPage() {
  const { data: session } = useSession();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{text:string, type:string}|null>(null);
  const [form, setForm] = useState({ name: "", code: "", status: "Active", headId: "", parentDepartmentId: "" });

  const isAdmin = session?.user?.role === "admin";

  const fetchData = () => {
    fetch("/api/departments").then(r => r.json()).then(d => setDepartments(d.departments || []));
    fetch("/api/employees").then(r => r.json()).then(d => setEmployees(d.employees || []));
  };

  useEffect(() => { if (session) fetchData(); }, [session]);

  const handleSave = async () => {
    if (!form.name) { setMsg({ text: "Department name is required", type: "error" }); return; }
    const method = editingId ? "PUT" : "POST";
    const body = editingId ? { id: editingId, ...form } : form;
    const res = await fetch("/api/departments", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) {
      fetchData(); setShowForm(false); setEditingId(null);
      setMsg({ text: `Department ${editingId ? "updated" : "created"} successfully!`, type: "success" });
    } else { const d = await res.json(); setMsg({ text: d.error, type: "error" }); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete department "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/departments?id=${id}`, { method: "DELETE" });
    if (res.ok) { fetchData(); setMsg({ text: "Department deleted", type: "success" }); }
    else { const d = await res.json(); setMsg({ text: d.error, type: "error" }); }
  };

  const openEdit = (dept: Department) => {
    setEditingId(dept.id);
    setForm({ name: dept.name, code: dept.code, status: dept.status, headId: dept.headId || "", parentDepartmentId: dept.parentDepartmentId || "" });
    setShowForm(true); setMsg(null);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm({ name: "", code: "", status: "Active", headId: "", parentDepartmentId: "" });
    setShowForm(true); setMsg(null);
  };

  if (!isAdmin) return <div className="text-center py-10 text-gray-500">Admin access required</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Department Management</h1>
          <p className="text-gray-500 mt-1">{departments.length} departments configured</p>
        </div>
        <button onClick={() => showForm ? setShowForm(false) : openAdd()} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
          {showForm ? "✕ Cancel" : "+ Add Department"}
        </button>
      </div>

      {msg && <div className={`px-4 py-3 rounded-lg text-sm border ${msg.type === "success" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>{msg.text}</div>}

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-lg">
          <h3 className="font-semibold text-gray-900 mb-4">{editingId ? "Edit Department" : "Add Department"}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department Name *</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. Technical Delivery" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
              <input type="text" value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. TD" maxLength={20} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department Head</label>
              <select value={form.headId} onChange={e => setForm({ ...form, headId: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">None</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parent Department</label>
              <select value={form.parentDepartmentId} onChange={e => setForm({ ...form, parentDepartmentId: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">None (Top Level)</option>
                {departments.filter(d => d.id !== editingId).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          <button onClick={handleSave} className="mt-4 bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
            {editingId ? "Save Changes" : "Create Department"}
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Department</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Code</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Head</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Parent</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {departments.map(d => (
              <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{d.name}</td>
                <td className="px-4 py-3"><span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-mono">{d.code || "—"}</span></td>
                <td className="px-4 py-3 text-gray-600">{d.headName || "—"}</td>
                <td className="px-4 py-3 text-gray-600">{d.parentDepartmentName || "—"}</td>
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
            {departments.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No departments found. Add your first one!</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
