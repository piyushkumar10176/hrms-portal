"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [time, setTime] = useState(new Date());
  const [todayAttendance, setTodayAttendance] = useState<{ clockIn: string | null; clockOut: string | null; status: string } | null>(null);
  const [leaveBalances, setLeaveBalances] = useState<{ available: number }[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [monthlyStats, setMonthlyStats] = useState({ present: 0, total: 0 });
  const [holidays, setHolidays] = useState<{ name: string; date: string }[]>([]);
  const [birthdays, setBirthdays] = useState<{ employee: { firstName: string; lastName: string; department: string }; daysAway: number }[]>([]);
  const [teamOnLeave, setTeamOnLeave] = useState<{ name: string; leaveType: string; fromDate?: string; toDate?: string }[]>([]);
  const [directReportsLeaves, setDirectReportsLeaves] = useState<any[]>([]);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!mounted) return;
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, [mounted]);

  useEffect(() => {
    Promise.all([
      fetch("/api/attendance/punch").then(r => r.json()),
      fetch("/api/leave/balances").then(r => r.json()),
      fetch("/api/attendance/monthly").then(r => r.json()),
      fetch("/api/holidays").then(r => r.json()),
      fetch("/api/approvals").then(r => r.json()),
      fetch("/api/dashboard").then(r => r.json()),
    ]).then(([att, leave, monthly, hol, approvals, dash]) => {
      setTodayAttendance(att.today);
      setLeaveBalances(leave.balances || []);
      setMonthlyStats(monthly.summary || { present: 0, total: 0 });
      setHolidays((hol.holidays || []).filter((h: { date: string }) => new Date(h.date) >= new Date()).slice(0, 3));
      setPendingCount((approvals.approvals || []).length);
      setBirthdays(dash.birthdays || []);
      setTeamOnLeave(dash.teamOnLeave || []);
      setDirectReportsLeaves(dash.directReportsLeaves || []);
    }).catch(() => {});
  }, []);

  const isAdmin = session?.user?.role === "admin";
  const greeting = mounted ? (time.getHours() < 12 ? "Good morning" : time.getHours() < 17 ? "Good afternoon" : "Good evening") : "Welcome";
  const totalLeave = leaveBalances.reduce((sum, b) => sum + (b.available || 0), 0);

  const handleClockIn = async () => {
    const res = await fetch("/api/attendance/punch", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clockIn" }),
    });
    const data = await res.json();
    if (res.ok) setTodayAttendance(data.record);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{greeting}! ☀️</h1>
          {mounted && (
            <p className="text-gray-500 mt-1">
              {time.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          )}
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-gray-900 tabular-nums" suppressHydrationWarning>
            {mounted ? time.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--"}
          </div>
          {!todayAttendance?.clockIn && (
            <button onClick={handleClockIn} className="mt-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2 ml-auto">
              🕐 Clock In
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
          <p className="text-sm text-gray-500">Today&apos;s Status</p>
          <p className="text-xl font-bold mt-1">{todayAttendance?.clockIn ? "Clocked In" : "Not Clocked In"}</p>
          <span className={`inline-block mt-2 text-xs px-2 py-1 rounded-full ${todayAttendance?.clockIn ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
            {todayAttendance?.clockIn ? `Since ${todayAttendance.clockIn}` : "Pending"}
          </span>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
          <p className="text-sm text-gray-500">Present This Month</p>
          <p className="text-xl font-bold mt-1">{monthlyStats.present} / {monthlyStats.total}</p>
          <span className="text-xs text-green-600 mt-2 inline-block">📈 On track</span>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
          <p className="text-sm text-gray-500">Leave Balance</p>
          <p className="text-xl font-bold mt-1">{totalLeave}</p>
          <span className="text-xs text-gray-500 mt-2 inline-block">Combined available</span>
        </div>
        <div 
          onClick={() => router.push("/approvals")}
          className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer"
        >
          <p className="text-sm text-gray-500">{isAdmin ? "Pending Approvals" : "My Requests"}</p>
          <p className="text-xl font-bold mt-1">{pendingCount}</p>
          <span className={`text-xs mt-2 inline-block ${pendingCount > 0 ? "text-orange-600" : "text-green-600"}`}>
            {pendingCount > 0 ? "⚠️ Action needed" : "✅ All clear"}
          </span>
        </div>
      </div>

      {/* Quick Actions + Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="space-y-2">
            {[
              { label: "Apply Leave", href: "/leave", icon: "🏖️" },
              { label: "Clock In/Out", href: "/attendance/clock", icon: "🕐" },
              { label: "View Attendance", href: "/attendance", icon: "📅" },
              { label: "My Payslips", href: "/payroll", icon: "💰" },
              { label: "My Profile", href: "/profile", icon: "👤" },
            ].map(item => (
              <button key={item.href} onClick={() => router.push(item.href)} className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors text-left">
                <span className="text-lg">{item.icon}</span>
                <span className="text-sm font-medium text-gray-700">{item.label}</span>
                <span className="ml-auto text-gray-400">→</span>
              </button>
            ))}
          </div>
        </div>

        {/* Upcoming Birthdays 🎂 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">🎂 Upcoming Birthdays</h3>
          {birthdays.length > 0 ? (
            <div className="space-y-3">
              {birthdays.slice(0, 5).map((b, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-pink-50 to-purple-50">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
                    {b.employee.firstName[0]}{b.employee.lastName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{b.employee.firstName} {b.employee.lastName}</p>
                    <p className="text-xs text-gray-500">{b.employee.department}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${b.daysAway === 0 ? "bg-pink-100 text-pink-700" : b.daysAway <= 7 ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-600"}`}>
                    {b.daysAway === 0 ? "Today! 🎉" : b.daysAway === 1 ? "Tomorrow" : `In ${b.daysAway} days`}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <span className="text-3xl">🎂</span>
              <p className="text-sm text-gray-400 mt-2">No upcoming birthdays this month</p>
            </div>
          )}
        </div>

        {/* Team on Leave + Holidays */}
        <div className="space-y-6">
          {/* Team on Leave */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">👥 Team on Leave Today</h3>
            {teamOnLeave.length > 0 ? (
              <div className="space-y-2">
                {teamOnLeave.map((t, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-orange-50">
                    <div className="w-8 h-8 rounded-full bg-orange-200 flex items-center justify-center text-xs font-bold text-orange-700">{t.name[0]}</div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{t.name}</p>
                      <p className="text-xs text-gray-500">
                        {t.leaveType}
                        {t.fromDate && t.toDate && (
                          <span className="block mt-0.5 text-orange-600">
                            {new Date(t.fromDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} 
                            {" - "} 
                            {new Date(t.toDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <span className="text-2xl">✅</span>
                <p className="text-sm text-green-600 font-medium mt-1">Everyone&apos;s in!</p>
              </div>
            )}
          </div>

          {/* Upcoming Holidays */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">📅 Upcoming Holidays</h3>
            {holidays.length > 0 ? (
              <div className="space-y-2">
                {holidays.map((h, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-blue-50">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs">
                      {new Date(h.date).getDate()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{h.name}</p>
                      <p className="text-xs text-gray-500">{new Date(h.date).toLocaleDateString("en-IN", { month: "short", weekday: "short" })}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">No upcoming holidays</p>
            )}
          </div>
        </div>
        {/* Manager Leave Dashboard (Only visible to managers) */}
        {directReportsLeaves.length > 0 && (
          <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-5 mt-6">
            <h3 className="font-semibold text-gray-900 mb-4">👑 Manager Dashboard: Team Leaves</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 rounded-tl-lg">Employee</th>
                    <th className="px-4 py-3 text-center">Total Used</th>
                    <th className="px-4 py-3">Leave Breakdown</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {directReportsLeaves.map((report: any) => (
                    <tr key={report.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{report.name}</div>
                        <div className="text-xs text-gray-500">{report.designation}</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center justify-center px-2 py-1 rounded-full text-xs font-medium ${report.usedLeaves > 15 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                          {report.usedLeaves} / {report.totalLeaves} days
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 flex-wrap">
                          {report.balances.map((b: any) => (
                            <span key={b.code} title={b.leaveType} className="text-xs px-2 py-1 rounded border border-gray-200 bg-white">
                              {b.code}: <strong className={b.used > 0 ? "text-gray-900" : "text-gray-400"}>{b.used}</strong>/{b.total}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
