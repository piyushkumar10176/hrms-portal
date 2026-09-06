"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

interface Emp {
  id:string; employeeId:string; firstName:string; lastName:string; email:string; phone:string;
  department:string; designation:string; dateOfJoining:string; role:string; status:string;
  dateOfBirth?:string; gender?:string; address?:string; city?:string;
  bankName?:string; accountNumber?:string; ifscCode?:string; panNumber?:string; aadharNumber?:string;
  reportingManagerId?:string|null;
}

interface HistoryRecord {
  id: string; date: string; type: string; description: string;
}

export default function ProfilePage() {
  const { data:session } = useSession();
  const [emp, setEmp] = useState<Emp|null>(null);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [managerName, setManagerName] = useState<string>("");
  
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Emp>>({});
  
  const [showPw, setShowPw] = useState(false);
  const [pw, setPw] = useState({old:"",new:"",confirm:""});
  const [pwMsg, setPwMsg] = useState<{text:string;type:"success"|"error"}|null>(null);
  const [msg, setMsg] = useState<{text:string;type:"success"|"error"}|null>(null);


  const employeeId = session?.user?.id;

  useEffect(() => {
    if (!employeeId) return;
    fetch("/api/employees/me").then(r=>r.json()).then(d=>{
      if(d.employee) {
        setEmp(d.employee);
        setEditForm(d.employee);
      }
      if(d.history) setHistory(d.history);
    });
    fetch("/api/org").then(r=>r.json()).then(d=>{
      const me = d.employees?.find((e: { id: string })=>e.id===employeeId);
      if(me?.managerName) setManagerName(me.managerName);
    }).catch(()=>{});
  
  }, [employeeId]);

  const handleSaveProfile = async () => {
    const res = await fetch("/api/employees/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm)
    });
    const d = await res.json();
    if(res.ok) {
      setEmp(d.employee);
      setIsEditing(false);
      setMsg({text: "Profile updated successfully!", type: "success"});
      setTimeout(() => setMsg(null), 3000);
    } else {
      setMsg({text: d.error, type: "error"});
    }
  };

  const handleChangePw = async () => {
    if(pw.new!==pw.confirm){setPwMsg({text:"Passwords don't match",type:"error"});return;}
    if(pw.new.length<4){setPwMsg({text:"Min 4 characters",type:"error"});return;}
    const res = await fetch("/api/password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({oldPassword:pw.old,newPassword:pw.new})});
    const d = await res.json();
    if(res.ok){setPwMsg({text:d.message,type:"success"});setPw({old:"",new:"",confirm:""});setShowPw(false);}
    else setPwMsg({text:d.error,type:"error"});
  };

  if(!emp) return <div className="text-center py-20 text-gray-400">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {msg && <div className={`px-4 py-3 rounded-lg text-sm border ${msg.type==="success"?"bg-green-50 border-green-200 text-green-700":"bg-red-50 border-red-200 text-red-700"}`}>{msg.text}</div>}

      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 text-white flex items-center gap-6 relative">
        <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center text-3xl font-bold shrink-0">{emp.firstName[0]}{emp.lastName[0]}</div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{emp.firstName} {emp.lastName}</h1>
          <p className="opacity-80">{emp.designation} • {emp.department}</p>
          <p className="text-sm opacity-60 mt-1">{emp.employeeId} • {emp.email}</p>
        </div>
        <button onClick={() => isEditing ? handleSaveProfile() : setIsEditing(true)} 
          className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-white/20">
          {isEditing ? "💾 Save Profile" : "✏️ Edit Profile"}
        </button>
      </div>

      {/* Personal Info */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50"><h3 className="font-semibold text-gray-900">Personal Information</h3></div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className="text-xs text-gray-500 uppercase tracking-wide">Phone</label>
            {isEditing ? <input className="w-full border rounded mt-1 px-2 py-1 text-sm" value={editForm.phone||""} onChange={e=>setEditForm({...editForm, phone: e.target.value})} /> 
            : <p className="text-sm font-medium mt-1">{emp.phone||"—"}</p>}</div>
          <div><label className="text-xs text-gray-500 uppercase tracking-wide">Date of Birth</label>
            {isEditing ? <input type="date" className="w-full border rounded mt-1 px-2 py-1 text-sm" value={editForm.dateOfBirth||""} onChange={e=>setEditForm({...editForm, dateOfBirth: e.target.value})} /> 
            : <p className="text-sm font-medium mt-1">{emp.dateOfBirth?new Date(emp.dateOfBirth).toLocaleDateString("en-IN"):"—"}</p>}</div>
          <div><label className="text-xs text-gray-500 uppercase tracking-wide">Gender</label>
            {isEditing ? <select className="w-full border rounded mt-1 px-2 py-1 text-sm" value={editForm.gender||""} onChange={e=>setEditForm({...editForm, gender: e.target.value})}><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select>
            : <p className="text-sm font-medium mt-1">{emp.gender||"—"}</p>}</div>
          <div><label className="text-xs text-gray-500 uppercase tracking-wide">City</label>
            {isEditing ? <input className="w-full border rounded mt-1 px-2 py-1 text-sm" value={editForm.city||""} onChange={e=>setEditForm({...editForm, city: e.target.value})} /> 
            : <p className="text-sm font-medium mt-1">{emp.city||"—"}</p>}</div>
          <div className="md:col-span-2"><label className="text-xs text-gray-500 uppercase tracking-wide">Address</label>
            {isEditing ? <textarea className="w-full border rounded mt-1 px-2 py-1 text-sm" rows={2} value={editForm.address||""} onChange={e=>setEditForm({...editForm, address: e.target.value})} /> 
            : <p className="text-sm font-medium mt-1">{emp.address||"—"}</p>}</div>
        </div>
      </div>

      {/* Employment Info (Read Only) */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50"><h3 className="font-semibold text-gray-900">Employment Details <span className="text-xs font-normal text-gray-400 ml-2">(Contact HR to modify)</span></h3></div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className="text-xs text-gray-500 uppercase tracking-wide">Employee ID</label><p className="text-sm font-medium mt-1">{emp.employeeId}</p></div>
          <div><label className="text-xs text-gray-500 uppercase tracking-wide">Department</label><p className="text-sm font-medium mt-1">{emp.department}</p></div>
          <div><label className="text-xs text-gray-500 uppercase tracking-wide">Designation</label><p className="text-sm font-medium mt-1">{emp.designation}</p></div>
          <div><label className="text-xs text-gray-500 uppercase tracking-wide">Date of Joining</label><p className="text-sm font-medium mt-1">{new Date(emp.dateOfJoining).toLocaleDateString("en-IN")}</p></div>
          <div><label className="text-xs text-gray-500 uppercase tracking-wide">Reporting Manager</label><p className="text-sm font-medium mt-1">{managerName||"No Manager"}</p></div>
          <div><label className="text-xs text-gray-500 uppercase tracking-wide">Status</label><p className="text-sm font-medium mt-1">{emp.status}</p></div>
        </div>
      </div>

      {/* Bank Info */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50"><h3 className="font-semibold text-gray-900">Bank & Tax Information</h3></div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className="text-xs text-gray-500 uppercase tracking-wide">Bank Name</label>
            {isEditing ? <input className="w-full border rounded mt-1 px-2 py-1 text-sm" value={editForm.bankName||""} onChange={e=>setEditForm({...editForm, bankName: e.target.value})} /> 
            : <p className="text-sm font-medium mt-1">{emp.bankName||"—"}</p>}</div>
          <div><label className="text-xs text-gray-500 uppercase tracking-wide">Account Number</label>
            {isEditing ? <input type="password" placeholder="••••••••" className="w-full border rounded mt-1 px-2 py-1 text-sm" value={editForm.accountNumber||""} onChange={e=>setEditForm({...editForm, accountNumber: e.target.value})} /> 
            : <p className="text-sm font-medium mt-1">{emp.accountNumber?"••••"+emp.accountNumber.slice(-4):"—"}</p>}</div>
          <div><label className="text-xs text-gray-500 uppercase tracking-wide">IFSC Code</label>
            {isEditing ? <input className="w-full border rounded mt-1 px-2 py-1 text-sm uppercase" value={editForm.ifscCode||""} onChange={e=>setEditForm({...editForm, ifscCode: e.target.value.toUpperCase()})} /> 
            : <p className="text-sm font-medium mt-1">{emp.ifscCode||"—"}</p>}</div>
          <div><label className="text-xs text-gray-500 uppercase tracking-wide">PAN Number</label>
            {isEditing ? <input className="w-full border rounded mt-1 px-2 py-1 text-sm uppercase" value={editForm.panNumber||""} onChange={e=>setEditForm({...editForm, panNumber: e.target.value.toUpperCase()})} /> 
            : <p className="text-sm font-medium mt-1">{emp.panNumber||"—"}</p>}</div>
          <div><label className="text-xs text-gray-500 uppercase tracking-wide">Aadhar Number</label>
            {isEditing ? <input className="w-full border rounded mt-1 px-2 py-1 text-sm" value={editForm.aadharNumber||""} onChange={e=>setEditForm({...editForm, aadharNumber: e.target.value})} /> 
            : <p className="text-sm font-medium mt-1">{emp.aadharNumber?"•••• "+emp.aadharNumber.slice(-4):"—"}</p>}</div>
        </div>
      </div>

      {/* History / Timeline */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50"><h3 className="font-semibold text-gray-900">Career History</h3></div>
        <div className="p-6">
          {history.length > 0 ? (
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-300 before:to-transparent">
              {history.map((h) => (
                <div key={h.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full border-4 border-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow ${h.type === "Joining" ? "bg-green-500" : h.type === "Promotion" ? "bg-indigo-500" : h.type === "Salary Revision" ? "bg-amber-500" : h.type === "Clock In" ? "bg-teal-500" : h.type === "Clock Out" ? "bg-rose-400" : h.type === "Leave Approved" ? "bg-sky-500" : "bg-blue-500"}`}>
                    <span className="text-[10px]">
                      {h.type === "Joining" ? "👋" : h.type === "Promotion" ? "🚀" : h.type === "Salary Revision" ? "💵" : h.type === "Clock In" ? "🕐" : h.type === "Clock Out" ? "🔴" : h.type === "Leave Approved" ? "✅" : "🏢"}
                    </span>
                  </div>
                  <div className="w-[calc(100%-3rem)] md:w-[calc(50%-2rem)] bg-white border border-gray-200 p-4 rounded-lg shadow-sm">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-bold text-gray-900 text-sm">{h.type}</h4>
                      <time className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{new Date(h.date).toLocaleDateString("en-IN", {month: "short", year: "numeric"})}</time>
                    </div>
                    <p className="text-sm text-gray-600">{h.description}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center">No history available yet.</p>
          )}
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Security</h3>
          <button onClick={()=>{setShowPw(!showPw);setPwMsg(null);}} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
            {showPw?"Cancel":"🔒 Change Password"}
          </button>
        </div>
        {showPw && (
          <div className="p-6 space-y-4">
            {pwMsg && <div className={`px-4 py-3 rounded-lg text-sm border ${pwMsg.type==="success"?"bg-green-50 border-green-200 text-green-700":"bg-red-50 border-red-200 text-red-700"}`}>{pwMsg.text}</div>}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
              <input type="password" value={pw.old} onChange={e=>setPw({...pw,old:e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input type="password" value={pw.new} onChange={e=>setPw({...pw,new:e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
              <input type="password" value={pw.confirm} onChange={e=>setPw({...pw,confirm:e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
            </div>
            <button onClick={handleChangePw} className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">Update Password</button>
          </div>
        )}
      </div>
    </div>
  );
}
