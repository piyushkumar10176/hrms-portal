"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

interface OrgNode { id:string; name:string; designation:string; department:string; managerId:string|null; employeeId:string; }
interface EmpDetail { id:string; firstName:string; lastName:string; employeeId:string; department:string; designation:string; email:string; dateOfJoining:string; managerId:string|null; managerName:string|null; directReports:{id:string;name:string;designation:string}[]; }

export default function OrgPage() {
  const [tree, setTree] = useState<OrgNode[]>([]);
  const [employees, setEmployees] = useState<EmpDetail[]>([]);
  const [selected, setSelected] = useState<EmpDetail|null>(null);
  const [view, setView] = useState<"tree"|"directory">("tree");

  useEffect(() => {
    fetch("/api/org").then(r=>r.json()).then(d=>{
      setTree(d.tree||[]);
      setEmployees(d.employees||[]);
    });
  }, []);

  const roots = tree.filter(n=>!n.managerId);
  const getChildren = (id:string) => tree.filter(n=>n.managerId===id);

  const renderNode = (node:OrgNode, depth:number) => {
    const children = getChildren(node.id);
    const emp = employees.find(e=>e.id===node.id);
    return (
      <div key={node.id} className={depth>0?"ml-8":""}>
        <button onClick={()=>emp&&setSelected(emp)}
          className={`flex items-center gap-3 p-3 rounded-xl border transition-all w-full text-left mb-2 ${selected?.id===node.id?"border-indigo-400 bg-indigo-50 shadow-sm":"border-gray-200 bg-white hover:border-indigo-200 hover:shadow-sm"}`}>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
            {node.name.split(" ").map(n=>n[0]).join("")}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-gray-900 text-sm truncate">{node.name}</p>
            <p className="text-xs text-gray-500">{node.designation} • {node.department}</p>
          </div>
          {children.length>0 && <span className="ml-auto bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full">{children.length}</span>}
        </button>
        {children.length>0 && (
          <div className="border-l-2 border-indigo-100 pl-2">
            {children.map(c=>renderNode(c, depth+1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organisation</h1>
          <p className="text-gray-500 mt-1">{employees.length} team members</p>
        </div>
        <div className="flex bg-gray-100 rounded-lg p-1">
          {(["tree","directory"] as const).map(v=>(
            <button key={v} onClick={()=>setView(v)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${view===v?"bg-white text-indigo-700 shadow-sm":"text-gray-500 hover:text-gray-700"}`}>
              {v==="tree"?"🏗️ Org Tree":"📋 Directory"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tree / Directory */}
        <div className="lg:col-span-2">
          {view==="tree" ? (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-4">Reporting Structure</h3>
              {roots.length===0 ? <p className="text-gray-400 text-center py-8">Loading...</p> : roots.map(r=>renderNode(r,0))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50"><h3 className="font-semibold text-gray-900">Employee Directory</h3></div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Employee</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Department</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Reports To</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map(e=>(
                      <tr key={e.id} onClick={()=>setSelected(e)} className="border-b border-gray-100 hover:bg-indigo-50 cursor-pointer transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600">{e.firstName[0]}{e.lastName[0]}</div>
                            <div><p className="font-medium text-gray-900">{e.firstName} {e.lastName}</p><p className="text-xs text-gray-400">{e.designation}</p></div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{e.department}</td>
                        <td className="px-4 py-3 text-gray-500">{e.managerName||"—"}</td>
                        <td className="px-4 py-3 text-gray-500">{new Date(e.dateOfJoining).toLocaleDateString("en-IN",{month:"short",year:"numeric"})}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div>
          {selected ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden sticky top-20">
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-5 text-white text-center">
                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold mx-auto">{selected.firstName[0]}{selected.lastName[0]}</div>
                <p className="font-bold mt-3">{selected.firstName} {selected.lastName}</p>
                <p className="text-sm opacity-80">{selected.designation}</p>
                <Link href={`/profile/${selected.id}`} className="inline-block mt-2 text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full border border-white/20 transition-colors">View Full Profile →</Link>
              </div>
              <div className="p-5 space-y-3">
                {[
                  {label:"Department",value:selected.department},
                  {label:"Email",value:selected.email},
                  {label:"Joined",value:new Date(selected.dateOfJoining).toLocaleDateString("en-IN",{day:"2-digit",month:"long",year:"numeric"})},
                  {label:"Reports To",value:selected.managerName||"No Manager (Top Level)"},
                ].map((f,i)=>(
                  <div key={i}><p className="text-xs text-gray-400 uppercase">{f.label}</p><p className="text-sm font-medium text-gray-900 mt-0.5">{f.value}</p></div>
                ))}
                {selected.directReports.length>0 && (
                  <div>
                    <p className="text-xs text-gray-400 uppercase mb-2">Direct Reports ({selected.directReports.length})</p>
                    <div className="space-y-1.5">
                      {selected.directReports.map(r=>(
                        <div key={r.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                          <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-600">{r.name.split(" ").map(n=>n[0]).join("")}</div>
                          <div><p className="text-xs font-medium text-gray-900">{r.name}</p><p className="text-[10px] text-gray-400">{r.designation}</p></div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 text-center py-16">
              <span className="text-4xl">👤</span>
              <p className="text-gray-400 mt-3 text-sm">Select an employee to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
