/**
 * HRMS Data Store — Persistent file-based storage
 * Data saved to /data/hrms-data.json and survives restarts.
 */
import { loadData, saveData } from "./store";

export type Role = "admin" | "employee";

export interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  dateOfJoining: string;
  reportingManagerId: string | null;
  role: Role;
  status: "Active" | "Inactive";
  password: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  city?: string;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  panNumber?: string;
  aadharNumber?: string;
  inviteToken?: string;
}

export interface Salary {
  employeeId: string;
  basic: number;
  hra: number;
  conveyance: number;
  medical: number;
  special: number;
  gross: number;
  effectiveFrom: string;
}

export interface Payslip {
  id: string; employeeId: string; month: string;
  basic: number; hra: number; conveyance: number; medical: number; special: number; grossEarnings: number;
  pf: number; esi: number; professionalTax: number; tds: number; totalDeductions: number; netPay: number;
  status: "Paid" | "Pending"; paidOn?: string;
}

export interface AttendanceRecord {
  id: string; employeeId: string; date: string;
  clockIn: string | null; clockOut: string | null;
  status: "Present" | "Absent" | "Half Day" | "Weekend" | "Holiday" | "Leave";
  totalHours: number;
}

export interface LeaveBalance {
  employeeId: string; leaveType: string; code: string;
  total: number; used: number; available: number; color: string;
}

export interface LeaveRequest {
  id: string; employeeId: string; leaveType: string;
  fromDate: string; toDate: string; days: number; reason: string;
  status: "Pending" | "Approved" | "Rejected";
  appliedOn: string; approvedBy?: string; approvedOn?: string;
}

export interface Holiday { id: string; name: string; date: string; type: string; }
export interface Notification { id: string; recipientId: string; title: string; body: string; type: string; read: boolean; createdAt: string; actionUrl?: string; }

export interface HistoryRecord {
  id: string; employeeId: string; date: string;
  type: "Promotion" | "Salary Revision" | "Department Change" | "Joining";
  description: string;
}

const SEED_EMPLOYEES: Employee[] = [
  { id: "e1", employeeId: "EMP001", firstName: "Tushar", lastName: "Sharma", email: "emp001@test.com", phone: "9000000001", department: "Executive", designation: "CEO", dateOfJoining: "2020-01-01", reportingManagerId: null, role: "admin", status: "Active", password: "admin" },
  { id: "e2", employeeId: "EMP002", firstName: "Rajat", lastName: "Sharma", email: "emp002@test.com", phone: "9000000002", department: "Technical Delivery", designation: "Technical Delivery Head", dateOfJoining: "2020-06-01", reportingManagerId: "e1", role: "admin", status: "Active", password: "emp123" },
  { id: "e3", employeeId: "EMP003", firstName: "Shubham", lastName: "Bansal", email: "emp003@test.com", phone: "9000000003", department: "Growth & Marketing", designation: "Growth & Marketing - Head", dateOfJoining: "2020-06-01", reportingManagerId: "e1", role: "admin", status: "Active", password: "emp123" },
  { id: "e4", employeeId: "EMP004", firstName: "Bharat", lastName: "Sharma", email: "emp004@test.com", phone: "9000000004", department: "Operations", designation: "Head of Operations", dateOfJoining: "2020-06-01", reportingManagerId: "e1", role: "admin", status: "Active", password: "emp123" },
  { id: "e5", employeeId: "EMP005", firstName: "Ankur", lastName: "Trivedi", email: "emp005@test.com", phone: "9000000005", department: "Technical Delivery", designation: "Salesforce Developer", dateOfJoining: "2022-01-15", reportingManagerId: "e6", role: "employee", status: "Active", password: "emp123" },
  { id: "e6", employeeId: "EMP006", firstName: "Shainkey", lastName: "Pawaiya", email: "piyushkumarsingh8962@gmail.com", phone: "9000000006", department: "Technical Delivery", designation: "Project Manager", dateOfJoining: "2021-03-01", reportingManagerId: "e2", role: "employee", status: "Active", password: "emp123" },
  { id: "e7", employeeId: "EMP007", firstName: "Pranay", lastName: "Pandey", email: "emp007@test.com", phone: "9000000007", department: "QA", designation: "Team Lead - QA", dateOfJoining: "2021-05-10", reportingManagerId: "e6", role: "employee", status: "Active", password: "emp123" },
  { id: "e8", employeeId: "EMP008", firstName: "Arihanta", lastName: "Jain", email: "emp008@test.com", phone: "9000000008", department: "HR", designation: "Assistant Manager HR", dateOfJoining: "2021-08-20", reportingManagerId: "e4", role: "admin", status: "Active", password: "emp123" },
  { id: "e9", employeeId: "EMP009", firstName: "Shivam", lastName: "Goel", email: "emp009@test.com", phone: "9000000009", department: "Growth & Marketing", designation: "Strategy & Growth - Associate", dateOfJoining: "2022-02-15", reportingManagerId: "e3", role: "employee", status: "Active", password: "emp123" },
  { id: "e10", employeeId: "EMP010", firstName: "Prateek", lastName: "Jain", email: "emp010@test.com", phone: "9000000010", department: "Growth & Marketing", designation: "Strategy & Growth - Associate", dateOfJoining: "2022-04-10", reportingManagerId: "e3", role: "employee", status: "Active", password: "emp123" },
  { id: "e11", employeeId: "EMP011", firstName: "Tammana", lastName: "Gautam", email: "emp011@test.com", phone: "9000000011", department: "Technical Delivery", designation: "BA - Salesforce", dateOfJoining: "2022-06-05", reportingManagerId: "e6", role: "employee", status: "Active", password: "emp123" },
  { id: "e12", employeeId: "EMP012", firstName: "Vishal", lastName: "Yadav", email: "emp012@test.com", phone: "9000000012", department: "Technical Delivery", designation: "BA - Salesforce", dateOfJoining: "2022-07-15", reportingManagerId: "e6", role: "employee", status: "Active", password: "emp123" },
  { id: "e13", employeeId: "EMP013", firstName: "Abhishek", lastName: "Kaplesh", email: "emp013@test.com", phone: "9000000013", department: "Technical Delivery", designation: "Salesforce Developer", dateOfJoining: "2023-01-10", reportingManagerId: "e6", role: "employee", status: "Active", password: "emp123" },
  { id: "e14", employeeId: "EMP014", firstName: "Ishit", lastName: "Bansal", email: "emp014@test.com", phone: "9000000014", department: "Technical Delivery", designation: "Salesforce Developer", dateOfJoining: "2023-02-20", reportingManagerId: "e6", role: "employee", status: "Active", password: "emp123" },
  { id: "e15", employeeId: "EMP015", firstName: "Arun", lastName: "Kumar", email: "emp015@test.com", phone: "9000000015", department: "Technical Delivery", designation: "Salesforce Developer", dateOfJoining: "2023-03-15", reportingManagerId: "e6", role: "employee", status: "Active", password: "emp123" },
  { id: "e16", employeeId: "EMP016", firstName: "Divyansh", lastName: "Sharma", email: "emp016@test.com", phone: "9000000016", department: "Technical Delivery", designation: "Salesforce Developer", dateOfJoining: "2023-04-10", reportingManagerId: "e6", role: "employee", status: "Active", password: "emp123" },
  { id: "e17", employeeId: "EMP017", firstName: "Gaurav", lastName: "Khanna", email: "emp017@test.com", phone: "9000000017", department: "Technical Delivery", designation: "Salesforce Developer", dateOfJoining: "2023-05-05", reportingManagerId: "e6", role: "employee", status: "Active", password: "emp123" },
  { id: "e18", employeeId: "EMP018", firstName: "Piyush", lastName: "Kumar Singh", email: "piyush.kumar@cloudsheer.com", phone: "9876543210", department: "Technical Delivery", designation: "Salesforce Developer", dateOfJoining: "2023-06-01", reportingManagerId: "e6", role: "admin", status: "Active", password: "Piyush@1606" },
  { id: "e19", employeeId: "EMP019", firstName: "Rahul", lastName: "Babbar", email: "emp019@test.com", phone: "9000000019", department: "Technical Delivery", designation: "Salesforce Developer", dateOfJoining: "2023-07-20", reportingManagerId: "e6", role: "employee", status: "Active", password: "emp123" },
  { id: "e20", employeeId: "EMP020", firstName: "Vansh", lastName: "Nandan Mathur", email: "emp020@test.com", phone: "9000000020", department: "Technical Delivery", designation: "Associate Salesforce Developer", dateOfJoining: "2023-08-15", reportingManagerId: "e18", role: "employee", status: "Active", password: "emp123" },
  { id: "e21", employeeId: "EMP021", firstName: "Aayush", lastName: "Gupta", email: "emp021@test.com", phone: "9000000021", department: "Technical Delivery", designation: "Associate Salesforce Developer", dateOfJoining: "2023-09-10", reportingManagerId: "e18", role: "employee", status: "Active", password: "emp123" },
  { id: "e22", employeeId: "EMP022", firstName: "Himanshu", lastName: "Yadav", email: "emp022@test.com", phone: "9000000022", department: "QA", designation: "QA", dateOfJoining: "2023-10-05", reportingManagerId: "e7", role: "employee", status: "Active", password: "emp123" },
  { id: "e23", employeeId: "EMP023", firstName: "Manish", lastName: "Pavadiya", email: "emp023@test.com", phone: "9000000023", department: "Technical Delivery", designation: "Salesforce Consultant", dateOfJoining: "2023-11-20", reportingManagerId: "e2", role: "employee", status: "Active", password: "emp123" },
  { id: "e24", employeeId: "EMP024", firstName: "Sweety", lastName: "Singh", email: "emp024@test.com", phone: "9000000024", department: "Technical Delivery", designation: "Associate Salesforce Developer", dateOfJoining: "2024-01-15", reportingManagerId: "e18", role: "employee", status: "Active", password: "emp123" },
  { id: "e25", employeeId: "EMP025", firstName: "Alka", lastName: "Yadav", email: "emp025@test.com", phone: "9000000025", department: "HR", designation: "HR Associate", dateOfJoining: "2024-02-10", reportingManagerId: "e8", role: "employee", status: "Active", password: "emp123" },
  { id: "e26", employeeId: "EMP026", firstName: "Bhu Garima", lastName: "Yadav", email: "emp026@test.com", phone: "9000000026", department: "Technical Delivery", designation: "Associate Salesforce Developer", dateOfJoining: "2024-03-05", reportingManagerId: "e18", role: "employee", status: "Active", password: "emp123" },
  { id: "e27", employeeId: "EMP027", firstName: "Utkarsh", lastName: "", email: "emp027@test.com", phone: "9000000027", department: "Technical Delivery", designation: "Salesforce Developer", dateOfJoining: "2024-04-01", reportingManagerId: "e6", role: "employee", status: "Active", password: "emp123" },
];

const SEED_SALARIES: Salary[] = SEED_EMPLOYEES.map(e => {
  let basic = 40000, hra = 16000, conveyance = 2000, medical = 2000, special = 20000, gross = 80000;
  if (e.designation === "CEO") {
    basic = 200000; hra = 80000; special = 120000; gross = 400000;
  } else if (e.designation.includes("Head")) {
    basic = 100000; hra = 40000; special = 60000; gross = 200000;
  } else if (e.designation.includes("Manager")) {
    basic = 70000; hra = 28000; special = 52000; gross = 150000;
  } else if (e.designation.includes("Lead")) {
    basic = 60000; hra = 24000; special = 36000; gross = 120000;
  } else if (e.designation.includes("Associate") && !e.designation.includes("Developer")) {
    basic = 30000; hra = 12000; special = 18000; gross = 60000;
  } else if (e.designation === "Salesforce Developer" || e.designation === "QA" || e.designation === "BA - Salesforce") {
    basic = 50000; hra = 20000; special = 30000; gross = 100000;
  } else if (e.designation === "Associate Salesforce Developer" || e.designation === "HR Associate") {
    basic = 25000; hra = 10000; special = 15000; gross = 50000;
  }
  return {
    employeeId: e.id,
    basic, hra, conveyance, medical, special, gross, effectiveFrom: e.dateOfJoining
  };
});

const SEED_HISTORY: HistoryRecord[] = SEED_EMPLOYEES.map(e => ({
  id: `hist_${e.id}_join`, employeeId: e.id, date: e.dateOfJoining,
  type: "Joining", description: `Joined as ${e.designation} in ${e.department}`
}));

const SEED_HOLIDAYS: Holiday[] = [
  { id:"h1", name:"Republic Day", date:"2026-01-26", type:"National" },
  { id:"h2", name:"Holi", date:"2026-03-14", type:"National" },
  { id:"h3", name:"Independence Day", date:"2026-08-15", type:"National" },
  { id:"h4", name:"Gandhi Jayanti", date:"2026-10-02", type:"National" },
  { id:"h5", name:"Diwali", date:"2026-10-20", type:"National" },
  { id:"h6", name:"Christmas", date:"2026-12-25", type:"National" },
];

// ── DataStore Class ──
class DataStore {
  employees: Employee[];
  salaries: Salary[];
  attendance: AttendanceRecord[];
  leaveBalances: LeaveBalance[];
  leaveRequests: LeaveRequest[];
  holidays: Holiday[];
  notifications: Notification[];
  payslips: Payslip[];
  history: HistoryRecord[];

  constructor() {
    this.employees = loadData("employees", SEED_EMPLOYEES);
    this.salaries = loadData("salaries", SEED_SALARIES);
    this.attendance = loadData("attendance", this.genAttendance());
    this.leaveBalances = loadData("leaveBalances", this.genLeaveBalances());
    this.leaveRequests = loadData("leaveRequests", [] as LeaveRequest[]);
    this.holidays = loadData("holidays", SEED_HOLIDAYS);
    this.notifications = loadData("notifications", [] as Notification[]);
    this.payslips = loadData("payslips", this.genPayslips());
    this.history = loadData("history", SEED_HISTORY);
  }

  private save(key: string, val: unknown) { saveData(key, val); }

  private genAttendance(): AttendanceRecord[] {
    const r: AttendanceRecord[] = [];
    const t = new Date(); const y = t.getFullYear(); const m = t.getMonth();
    this.employees.forEach(e => {
      for (let d = 1; d <= t.getDate(); d++) {
        const dt = new Date(y, m, d); const dow = dt.getDay(); const ds = dt.toISOString().split("T")[0];
        if (dow === 0 || dow === 6) r.push({ id:`a-${e.id}-${ds}`, employeeId:e.id, date:ds, clockIn:null, clockOut:null, status:"Weekend", totalHours:0 });
        else if (d === t.getDate()) r.push({ id:`a-${e.id}-${ds}`, employeeId:e.id, date:ds, clockIn:null, clockOut:null, status:"Absent", totalHours:0 });
        else { const ci=`09:${String(Math.floor(Math.random()*15)).padStart(2,"0")}`; const co=`18:${String(Math.floor(Math.random()*30)).padStart(2,"0")}`; r.push({ id:`a-${e.id}-${ds}`, employeeId:e.id, date:ds, clockIn:ci, clockOut:co, status:"Present", totalHours:8+Math.random()*1.5 }); }
      }
    });
    return r;
  }

  private genLeaveBalances(): LeaveBalance[] {
    return this.employees.flatMap(e => [
      { employeeId:e.id, leaveType:"Casual Leave", code:"CL", total:12, used:4, available:8, color:"#3b82f6" },
      { employeeId:e.id, leaveType:"Sick Leave", code:"SL", total:6, used:1, available:5, color:"#f59e0b" },
      { employeeId:e.id, leaveType:"Earned Leave", code:"EL", total:15, used:3, available:12, color:"#10b981" },
      { employeeId:e.id, leaveType:"Comp Off", code:"CO", total:2, used:1, available:1, color:"#8b5cf6" },
    ]);
  }

  private genPayslips(): Payslip[] {
    const slips: Payslip[] = [];
    ["2026-01","2026-02","2026-03","2026-04"].forEach(m => {
      this.salaries.forEach(s => {
        const pf = Math.round(s.basic*0.12); const esi = s.gross<21000?Math.round(s.gross*0.0075):0;
        const pt=200; const tds=Math.round(s.gross*0.1); const td=pf+esi+pt+tds;
        slips.push({ id:`ps-${s.employeeId}-${m}`, employeeId:s.employeeId, month:m, basic:s.basic, hra:s.hra, conveyance:s.conveyance, medical:s.medical, special:s.special, grossEarnings:s.gross, pf, esi, professionalTax:pt, tds, totalDeductions:td, netPay:s.gross-td, status:"Paid", paidOn:`${m}-28` });
      });
    });
    return slips;
  }

  // ── Auth ──
  authenticate(email: string, password: string): Employee | null {
    return this.employees.find(e => e.email === email && e.password === password && e.status === "Active") || null;
  }
  changePassword(id: string, oldPw: string, newPw: string): boolean {
    const e = this.employees.find(x => x.id === id);
    if (!e || e.password !== oldPw) return false;
    e.password = newPw;
    this.save("employees", this.employees);
    return true;
  }
  setEmployeePasswordByToken(token: string, newPw: string): boolean {
    const e = this.employees.find(x => x.inviteToken === token);
    if (!e) return false;
    e.password = newPw;
    e.inviteToken = undefined;
    this.save("employees", this.employees);
    return true;
  }

  // ── History ──
  getHistory(eid: string) { return this.history.filter(h=>h.employeeId===eid).sort((a,b)=>b.date.localeCompare(a.date)); }
  addHistory(eid: string, type: HistoryRecord["type"], desc: string) {
    this.history.push({ id:`h_${Date.now()}`, employeeId:eid, date:new Date().toISOString().split("T")[0], type, description:desc });
    this.save("history", this.history);
  }

  // ── Employees ──
  getEmployee(id: string) { return this.employees.find(e => e.id === id) || null; }
  getAllEmployees() { return this.employees.filter(e => e.status === "Active"); }
  addEmployee(data: Omit<Employee, "id">): Employee {
    const id = String(Date.now());
    const emp: Employee = { ...data, id };
    this.employees.push(emp);
    this.leaveBalances.push(
      { employeeId:id, leaveType:"Casual Leave", code:"CL", total:12, used:0, available:12, color:"#3b82f6" },
      { employeeId:id, leaveType:"Sick Leave", code:"SL", total:6, used:0, available:6, color:"#f59e0b" },
      { employeeId:id, leaveType:"Earned Leave", code:"EL", total:15, used:0, available:15, color:"#10b981" },
      { employeeId:id, leaveType:"Comp Off", code:"CO", total:2, used:0, available:2, color:"#8b5cf6" },
    );
    this.addHistory(id, "Joining", `Joined as ${data.designation} in ${data.department}`);
    this.save("employees", this.employees);
    this.save("leaveBalances", this.leaveBalances);
    return emp;
  }
  updateEmployee(id: string, data: Partial<Employee>): Employee | null {
    const i = this.employees.findIndex(e => e.id === id);
    if (i === -1) return null;
    const old = this.employees[i];
    this.employees[i] = { ...old, ...data };
    
    // Check for changes to log history
    if (data.designation && data.designation !== old.designation) {
      this.addHistory(id, "Promotion", `Designation changed from ${old.designation} to ${data.designation}`);
    }
    if (data.department && data.department !== old.department) {
      this.addHistory(id, "Department Change", `Moved from ${old.department} to ${data.department}`);
    }
    
    this.save("employees", this.employees);
    return this.employees[i];
  }

  // ── Org Tree ──
  getOrgTree() {
    const active = this.getAllEmployees();
    return active.map(e => ({
      id: e.id, name: `${e.firstName} ${e.lastName}`, designation: e.designation,
      department: e.department, managerId: e.reportingManagerId, employeeId: e.employeeId,
    }));
  }
  getDirectReports(managerId: string) {
    return this.employees.filter(e => e.reportingManagerId === managerId && e.status === "Active");
  }
  getManagerOf(employeeId: string): Employee | null {
    const e = this.getEmployee(employeeId);
    if (!e?.reportingManagerId) return null;
    return this.getEmployee(e.reportingManagerId);
  }

  // ── Salary (Admin) ──
  getSalary(employeeId: string) { return this.salaries.find(s => s.employeeId === employeeId) || null; }
  getAllSalaries() { return this.salaries; }
  setSalary(employeeId: string, data: Omit<Salary, "employeeId">) {
    const idx = this.salaries.findIndex(s => s.employeeId === employeeId);
    const sal: Salary = { ...data, employeeId };
    
    let oldGross = 0;
    if (idx >= 0) {
      oldGross = this.salaries[idx].gross;
      this.salaries[idx] = sal;
    } else {
      this.salaries.push(sal);
    }
    
    if (oldGross > 0 && oldGross !== sal.gross) {
      this.addHistory(employeeId, "Salary Revision", `Gross salary revised from ₹${oldGross.toLocaleString("en-IN")} to ₹${sal.gross.toLocaleString("en-IN")}`);
    } else if (oldGross === 0) {
      this.addHistory(employeeId, "Salary Revision", `Initial salary structure set to ₹${sal.gross.toLocaleString("en-IN")} gross`);
    }

    this.save("salaries", this.salaries);
    return sal;
  }

  // ── Attendance ──
  getAttendanceForMonth(eid: string, y: number, m: number) {
    const p = `${y}-${String(m+1).padStart(2,"0")}`;
    return this.attendance.filter(a => a.employeeId === eid && a.date.startsWith(p));
  }
  clockIn(eid: string) {
    const today = new Date().toISOString().split("T")[0];
    const now = new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",hour12:false});
    let r = this.attendance.find(a => a.employeeId===eid && a.date===today);
    if (r) { r.clockIn=now; r.clockOut=null; r.status="Present"; }
    else { r={id:`a-${eid}-${today}`,employeeId:eid,date:today,clockIn:now,clockOut:null,status:"Present",totalHours:0}; this.attendance.push(r); }
    this.save("attendance",this.attendance); return r;
  }
  clockOut(eid: string) {
    const today=new Date().toISOString().split("T")[0];
    const now=new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",hour12:false});
    const r=this.attendance.find(a=>a.employeeId===eid&&a.date===today);
    if(!r) return null;
    r.clockOut=now;
    if(r.clockIn){
      const[ch,cm]=r.clockIn.split(":").map(Number);
      const[oh,om]=now.split(":").map(Number);
      const sessionHours = Math.max(0,(oh*60+om-ch*60-cm)/60);
      r.totalHours = (r.totalHours || 0) + sessionHours;
    }
    this.save("attendance",this.attendance); return r;
  }
  getTodayAttendance(eid: string) { const t=new Date().toISOString().split("T")[0]; return this.attendance.find(a=>a.employeeId===eid&&a.date===t)||null; }

  // ── Leave ──
  getLeaveBalances(eid: string) { return this.leaveBalances.filter(b=>b.employeeId===eid); }
  getLeaveRequests(eid: string) { return this.leaveRequests.filter(r=>r.employeeId===eid); }
  getAllLeaveRequests() { return this.leaveRequests; }
  getPendingApprovals(mid: string) {
    const reps=this.employees.filter(e=>e.reportingManagerId===mid).map(e=>e.id);
    return this.leaveRequests.filter(r=>reps.includes(r.employeeId)&&r.status==="Pending");
  }
  applyLeave(data: Omit<LeaveRequest,"id"|"status"|"appliedOn">) {
    const req:LeaveRequest={...data,id:`lr${Date.now()}`,status:"Pending",appliedOn:new Date().toISOString()};
    this.leaveRequests.push(req);
    const emp=this.getEmployee(data.employeeId);
    const mgr=this.getManagerOf(data.employeeId);
    if(emp&&mgr){this.notifications.push({id:`n${Date.now()}`,recipientId:mgr.id,title:"New Leave Request",body:`${emp.firstName} ${emp.lastName} applied for ${data.days} day(s) ${data.leaveType}`,type:"leave_applied",read:false,createdAt:new Date().toISOString(),actionUrl:"/approvals"});}
    this.save("leaveRequests",this.leaveRequests); this.save("notifications",this.notifications);
    return req;
  }
  approveLeave(rid: string, aid: string) {
    const r=this.leaveRequests.find(x=>x.id===rid); if(!r)return null;
    r.status="Approved"; r.approvedBy=aid; r.approvedOn=new Date().toISOString();
    const b=this.leaveBalances.find(x=>x.employeeId===r.employeeId&&x.leaveType===r.leaveType);
    if(b){b.used+=r.days;b.available=b.total-b.used;}
    this.notifications.push({id:`n${Date.now()}`,recipientId:r.employeeId,title:"Leave Approved ✅",body:`Your ${r.leaveType} has been approved`,type:"leave_approved",read:false,createdAt:new Date().toISOString(),actionUrl:"/leave"});
    this.save("leaveRequests",this.leaveRequests);this.save("leaveBalances",this.leaveBalances);this.save("notifications",this.notifications);
    return r;
  }
  rejectLeave(rid: string, aid: string) {
    const r=this.leaveRequests.find(x=>x.id===rid); if(!r)return null;
    r.status="Rejected"; r.approvedBy=aid; r.approvedOn=new Date().toISOString();
    this.notifications.push({id:`n${Date.now()}`,recipientId:r.employeeId,title:"Leave Rejected ❌",body:`Your ${r.leaveType} has been rejected`,type:"leave_rejected",read:false,createdAt:new Date().toISOString(),actionUrl:"/leave"});
    this.save("leaveRequests",this.leaveRequests);this.save("notifications",this.notifications);
    return r;
  }

  // ── Payslips ──
  getPayslips(eid: string) { return this.payslips.filter(p=>p.employeeId===eid).sort((a,b)=>b.month.localeCompare(a.month)); }
  getPayslip(eid: string, month: string) { return this.payslips.find(p=>p.employeeId===eid&&p.month===month)||null; }
  getLatestPayslip(eid: string) { const s=this.getPayslips(eid); return s[0]||null; }

  // ── Holidays ──
  getHolidays() { return this.holidays; }

  // ── Birthdays & Team Leave ──
  getUpcomingBirthdays() {
    const now=new Date(); const results:{employee:Employee;daysAway:number}[]=[];
    this.getAllEmployees().filter(e=>e.dateOfBirth).forEach(e=>{
      const d=new Date(e.dateOfBirth!); const bd=new Date(now.getFullYear(),d.getMonth(),d.getDate());
      if(bd<now)bd.setFullYear(bd.getFullYear()+1);
      const diff=Math.ceil((bd.getTime()-now.getTime())/86400000);
      if(diff<=30)results.push({employee:e,daysAway:diff});
    });
    return results.sort((a,b)=>a.daysAway-b.daysAway);
  }
  getTeamOnLeave(eid: string) {
    const e=this.getEmployee(eid); if(!e)return[];
    const mid=e.reportingManagerId||e.id;
    const team=this.employees.filter(x=>(x.reportingManagerId===mid||x.id===mid)&&x.id!==eid&&x.status==="Active");
    const today=new Date().toISOString().split("T")[0];
    return team.map(t => {
      const lr = this.leaveRequests.find(r=>r.employeeId===t.id&&r.status==="Approved"&&r.fromDate<=today&&r.toDate>=today);
      if (!lr) return null;
      return { name:`${t.firstName} ${t.lastName}`, leaveType:lr.leaveType, fromDate: lr.fromDate, toDate: lr.toDate };
    }).filter(Boolean);
  }

  // ── Notifications ──
  getNotifications(uid: string) { return this.notifications.filter(n=>n.recipientId===uid).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)); }
  getUnreadCount(uid: string) { return this.notifications.filter(n=>n.recipientId===uid&&!n.read).length; }
  markRead(nid: string) { const n=this.notifications.find(x=>x.id===nid); if(n)n.read=true; this.save("notifications",this.notifications); }
  markAllRead(uid: string) { this.notifications.filter(n=>n.recipientId===uid).forEach(n=>{n.read=true;}); this.save("notifications",this.notifications); }
}

const g = globalThis as unknown as { __db?: DataStore };
if (!g.__db) g.__db = new DataStore();
export const db = g.__db;
