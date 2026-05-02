"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

interface SalaryRow { employeeId:string; employeeName:string; designation:string; basic:number; hra:number; conveyance:number; medical:number; special:number; gross:number; effectiveFrom:string; }

export default function SalaryPage() {
  const { data:session } = useSession();
  const [salaries, setSalaries] = useState<SalaryRow[]>([]);
  const [employees, setEmployees] = useState<{id:string;firstName:string;lastName:string;designation:string}[]>([]);
  const [editing, setEditing] = useState<string|null>(null);
  const [form, setForm] = useState({basic:0,hra:0,conveyance:0,medical:0,special:0,effectiveFrom:""});
  const [msg, setMsg] = useState<{text:string;type:"success"|"error"}|null>(null);

  const isAdmin = session?.user?.role==="admin";

  useEffect(() => {
    if(!isAdmin) return;
    fetch("/api/salary").then(r=>r.json()).then(d=>setSalaries(d.salaries||[]));
    fetch("/api/employees").then(r=>r.json()).then(d=>setEmployees(d.employees||[]));
  }, [isAdmin]);

  const fmt = (n:number) => `₹${n.toLocaleString("en-IN")}`;

  const startEdit = (s:SalaryRow) => {
    setEditing(s.employeeId);
    setForm({basic:s.basic,hra:s.hra,conveyance:s.conveyance,medical:s.medical,special:s.special,effectiveFrom:s.effectiveFrom});
  };

  const saveEdit = async () => {
    if(!editing) return;
    const res = await fetch("/api/salary",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({employeeId:editing,...form})});
    const d = await res.json();
    if(res.ok) {
      setMsg({text:d.message,type:"success"});
      setEditing(null);
      fetch("/api/salary").then(r=>r.json()).then(d=>setSalaries(d.salaries||[]));
    } else setMsg({text:d.error,type:"error"});
  };

  if(!isAdmin) return <div className="text-center py-20"><span className="text-5xl">🔒</span><p className="text-gray-500 mt-4">Admin access required.</p></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Salary Management</h1>
        <p className="text-gray-500 mt-1">View and update employee compensation</p>
      </div>

      {msg && <div className={`px-4 py-3 rounded-lg text-sm border ${msg.type==="success"?"bg-green-50 border-green-200 text-green-700":"bg-red-50 border-red-200 text-red-700"}`}>{msg.text}</div>}

      {/* Edit Modal */}
      {editing && (
        <div className="bg-white rounded-xl border border-indigo-200 p-6 shadow-lg">
          <h3 className="font-semibold text-gray-900 mb-4">Edit Salary — {salaries.find(s=>s.employeeId===editing)?.employeeName}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {([["basic","Basic"],["hra","HRA"],["conveyance","Conveyance"],["medical","Medical"],["special","Special"]] as const).map(([key,label])=>(
              <div key={key}><label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input type="number" value={form[key]} onChange={e=>setForm({...form,[key]:Number(e.target.value)})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
            ))}
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Effective From</label>
            <input type="date" value={form.effectiveFrom} onChange={e=>setForm({...form,effectiveFrom:e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
          </div>
          <p className="text-sm text-gray-500 mt-3">Gross: {fmt(form.basic+form.hra+form.conveyance+form.medical+form.special)}</p>
          <div className="flex gap-2 mt-4">
            <button onClick={saveEdit} className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">Save</button>
            <button onClick={()=>setEditing(null)} className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg text-sm font-medium hover:bg-gray-200">Cancel</button>
          </div>
        </div>
      )}

      {/* Salary Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Employee</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Basic</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">HRA</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Gross</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Effective</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Action</th>
              </tr>
            </thead>
            <tbody>
              {salaries.map(s=>(
                <tr key={s.employeeId} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3"><p className="font-medium text-gray-900">{s.employeeName}</p><p className="text-xs text-gray-400">{s.designation}</p></td>
                  <td className="px-4 py-3 text-right">{fmt(s.basic)}</td>
                  <td className="px-4 py-3 text-right">{fmt(s.hra)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-green-700">{fmt(s.gross)}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{new Date(s.effectiveFrom).toLocaleDateString("en-IN",{month:"short",year:"numeric"})}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={()=>startEdit(s)} className="text-indigo-600 hover:text-indigo-800 text-sm font-medium">✏️ Edit</button>
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
