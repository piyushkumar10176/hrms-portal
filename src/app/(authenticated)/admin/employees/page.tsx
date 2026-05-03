"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";

interface Employee {
  id: string; employeeId: string; firstName: string; lastName: string;
  email: string; phone: string; department: string; designation: string;
  dateOfJoining: string; role: string; status: string; city?: string; reportingManagerId?: string | null;
  dateOfBirth?: string;
}

export default function AdminEmployeesPage() {
  const { data: session } = useSession();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState<{text:string, type:string}|null>(null);
  
  const formRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", department: "Engineering",
    designation: "", dateOfJoining: "", role: "employee", gender: "", city: "", reportingManagerId: "",
    dateOfBirth: ""
  });

  const isAdmin = session?.user?.role === "admin";
  const userId = session?.user?.id;

  const fetchEmployees = () => {
    fetch("/api/employees").then(r => r.json()).then(d => {
      let emps = d.employees || [];
      if (!isAdmin) {
        // If not admin, only show direct reports (or self if no direct reports, though usually just direct reports)
        emps = emps.filter((e: Employee) => e.reportingManagerId === userId);
      }
      setEmployees(emps);
    });
  };

  useEffect(() => {
    if (session) {
      fetchEmployees();
    }
  }, [session]);

  const handleSave = async () => {
    if (!form.firstName || !form.lastName || !form.email) {
      setMsg({text: "First name, last name, and email are required", type: "error"}); return;
    }
    
    const url = editingId ? `/api/employees/${editingId}` : "/api/employees";
    const method = editingId ? "PUT" : "POST";

    const res = await fetch(url, {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (res.ok) {
      fetchEmployees();
      setShowForm(false);
      setEditingId(null);
      setMsg({
        text: data.inviteLink 
          ? `Added ${data.employee.firstName}! An email was sent. Invite Link: ${data.inviteLink}` 
          : `${data.employee.firstName} ${editingId ? "updated" : "added"} successfully!`, 
        type: "success"
      });
    } else { setMsg({text: data.error, type: "error"}); }
  };

  const openEdit = (emp: Employee) => {
    setEditingId(emp.id);
    setForm({
      firstName: emp.firstName, lastName: emp.lastName, email: emp.email, phone: emp.phone || "",
      department: emp.department, designation: emp.designation, dateOfJoining: emp.dateOfJoining,
      role: emp.role, gender: "", city: emp.city || "", reportingManagerId: emp.reportingManagerId || "",
      dateOfBirth: emp.dateOfBirth || ""
    });
    setShowForm(true);
    setMsg(null);
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm({ firstName: "", lastName: "", email: "", phone: "", department: "Engineering", designation: "", dateOfJoining: "", role: "employee", gender: "", city: "", reportingManagerId: "", dateOfBirth: "" });
    setShowForm(true);
    setMsg(null);
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const filtered = employees.filter(e =>
    `${e.firstName} ${e.lastName} ${e.email} ${e.department}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{isAdmin ? "Employee Management" : "My Team"}</h1>
          <p className="text-gray-500 mt-1">{employees.length} employees in your team</p>
        </div>
        {isAdmin && (
          <button onClick={() => showForm ? setShowForm(false) : openAdd()} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
            {showForm ? "✕ Cancel" : "+ Add Employee"}
          </button>
        )}
      </div>

      {msg && <div className={`px-4 py-3 rounded-lg text-sm border ${msg.type === "success" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>{msg.text}</div>}

      {/* Add / Edit Employee Form */}
      {showForm && (
        <div ref={formRef} className="bg-white rounded-xl border border-gray-200 p-6 shadow-lg">
          <h3 className="font-semibold text-gray-900 mb-4">{editingId ? "Edit Employee Details" : "Add New Employee"}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: "First Name *", key: "firstName", type: "text" },
              { label: "Last Name *", key: "lastName", type: "text" },
              { label: "Email *", key: "email", type: "email" },
              { label: "Phone", key: "phone", type: "tel" },
              { label: "Designation", key: "designation", type: "text" },
              { label: "Date of Joining", key: "dateOfJoining", type: "date" },
              { label: "Birth Date", key: "dateOfBirth", type: "date" },
              { label: "City", key: "city", type: "text" },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                <input type={f.type} value={form[f.key as keyof typeof form]} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <select value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {["Executive", "Engineering", "Design", "Sales", "Marketing", "HR", "Finance", "Management", "Operations"].map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="employee">Employee</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reporting Manager</label>
              <select value={form.reportingManagerId} onChange={e => setForm({ ...form, reportingManagerId: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">None (Top Level)</option>
                {employees.filter(e => e.id !== editingId).map(e => (
                  <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.designation})</option>
                ))}
              </select>
            </div>
          </div>
          <button onClick={handleSave} className="mt-4 bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
            {editingId ? "Save Changes" : "Add Employee"}
          </button>
        </div>
      )}

      {/* Search */}
      <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employees..."
        className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 text-sm" />

      {/* Employee Table or Grid */}
      {isAdmin ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Employee</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">ID</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Department</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Designation</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Manager</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => {
                  const manager = employees.find(m => m.id === e.reportingManagerId);
                  return (
                    <tr key={e.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600">
                            {e.firstName[0]}{e.lastName[0]}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{e.firstName} {e.lastName}</p>
                            <p className="text-xs text-gray-400">{e.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium">{e.employeeId}</td>
                      <td className="px-4 py-3">
                        <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded-md text-xs">{e.department}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{e.designation}</td>
                      <td className="px-4 py-3 text-gray-600">{manager ? `${manager.firstName} ${manager.lastName}` : "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${e.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                          {e.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={(ev) => { ev.stopPropagation(); openEdit(e); }} className="text-indigo-600 hover:text-indigo-800 font-medium px-3 py-1 bg-indigo-50 rounded hover:bg-indigo-100 transition-colors">
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No employees found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((e, i) => {
            const colors = ["bg-teal-500", "bg-green-500", "bg-sky-500", "bg-orange-500", "bg-blue-500"];
            const color = colors[i % colors.length];
            return (
              <div key={e.id} className="bg-white rounded border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow relative">
                <div className="flex gap-4">
                  <div className={`w-14 h-14 rounded-full ${color} flex items-center justify-center text-xl font-medium text-white shrink-0`}>
                    {e.firstName[0]}{e.lastName[0]}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{e.firstName} {e.lastName}</h3>
                    <p className="text-xs text-gray-500 mt-1 truncate">{e.designation}</p>
                    
                    <div className="mt-4 space-y-2 text-xs text-gray-500">
                      <p><span className="text-gray-400">Location :</span> {e.city || "Remote"}</p>
                      <p><span className="text-gray-400">Department :</span> {e.department}</p>
                      <p className="truncate"><span className="text-gray-400">Email :</span> {e.email}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full py-8 text-center text-gray-500">No team members found.</div>
          )}
        </div>
      )}
    </div>
  );
}
