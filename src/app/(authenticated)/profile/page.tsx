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
  const [showPw, setShowPw] = useState(false);
  const [pw, setPw] = useState({old:"",new:"",confirm:""});
  const [pwMsg, setPwMsg] = useState<{text:string;type:"success"|"error"}|null>(null);

  useEffect(() => {
    fetch("/api/employees/me").then(r=>r.json()).then(d=>{
      if(d.employee) setEmp(d.employee);
      if(d.history) setHistory(d.history);
    });
    fetch("/api/org").then(r=>r.json()).then(d=>{
      const me = d.employees?.find((e:any)=>e.id===session?.user?.id);
      if(me?.managerName) setManagerName(me.managerName);
    }).catch(()=>{});
  }, [session?.user?.id]);

  const handleChangePw = async () => {
    if(pw.new!==pw.confirm){setPwMsg({text:"Passwords don't match",type:"error"});return;}
    if(pw.new.length<4){setPwMsg({text:"Min 4 characters",type:"error"});return;}
    const res = await fetch("/api/password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({oldPassword:pw.old,newPassword:pw.new})});
    const d = await res.json();
    if(res.ok){setPwMsg({text:d.message,type:"success"});setPw({old:"",new:"",confirm:""});setShowPw(false);}
    else setPwMsg({text:d.error,type:"error"});
  };

  if(!emp) return <div className="text-center py-20 text-gray-400">Loading...</div>;

  const sections = [
    { title:"Personal Information", fields:[
      {label:"Full Name",value:`${emp.firstName} ${emp.lastName}`},
      {label:"Email",value:emp.email}, {label:"Phone",value:emp.phone},
      {label:"Date of Birth",value:emp.dateOfBirth?new Date(emp.dateOfBirth).toLocaleDateString("en-IN"):"—"},
      {label:"Gender",value:emp.gender||"—"}, {label:"Address",value:emp.address||"—"}, {label:"City",value:emp.city||"—"},
    ]},
    { title:"Employment Details", fields:[
      {label:"Employee ID",value:emp.employeeId}, {label:"Department",value:emp.department},
      {label:"Designation",value:emp.designation},
      {label:"Date of Joining",value:new Date(emp.dateOfJoining).toLocaleDateString("en-IN",{day:"2-digit",month:"long",year:"numeric"})},
      {label:"Reporting Manager",value:managerName||"No Manager"}, {label:"Role",value:emp.role==="admin"?"Administrator":"Employee"},
      {label:"Status",value:emp.status},
    ]},
    { title:"Bank & Tax", fields:[
      {label:"Bank Name",value:emp.bankName||"—"}, {label:"Account Number",value:emp.accountNumber||"—"},
      {label:"IFSC Code",value:emp.ifscCode||"—"}, {label:"PAN",value:emp.panNumber||"—"}, {label:"Aadhar",value:emp.aadharNumber||"—"},
    ]},
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 text-white flex items-center gap-6">
        <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center text-3xl font-bold">{emp.firstName[0]}{emp.lastName[0]}</div>
        <div>
          <h1 className="text-2xl font-bold">{emp.firstName} {emp.lastName}</h1>
          <p className="opacity-80">{emp.designation} • {emp.department}</p>
          <p className="text-sm opacity-60 mt-1">{emp.employeeId} • {emp.email}</p>
        </div>
      </div>

      {/* Info Sections */}
      {sections.map((sec,i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50"><h3 className="font-semibold text-gray-900">{sec.title}</h3></div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {sec.fields.map((f,j) => (
              <div key={j}><label className="text-xs text-gray-500 uppercase tracking-wide">{f.label}</label><p className="text-sm font-medium text-gray-900 mt-1">{f.value}</p></div>
            ))}
          </div>
        </div>
      ))}

      {/* History / Timeline */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50"><h3 className="font-semibold text-gray-900">Career History</h3></div>
        <div className="p-6">
          {history.length > 0 ? (
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-300 before:to-transparent">
              {history.map((h, i) => (
                <div key={h.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full border-4 border-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow ${h.type === "Joining" ? "bg-green-500" : h.type === "Promotion" ? "bg-indigo-500" : h.type === "Salary Revision" ? "bg-amber-500" : "bg-blue-500"}`}>
                    <span className="text-[10px]">
                      {h.type === "Joining" ? "👋" : h.type === "Promotion" ? "🚀" : h.type === "Salary Revision" ? "💵" : "🏢"}
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
