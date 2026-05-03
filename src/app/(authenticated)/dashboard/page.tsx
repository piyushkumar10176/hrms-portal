"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function DashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [time, setTime] = useState(new Date());
  const [todayAttendance, setTodayAttendance] = useState<{ clockIn: string | null; clockOut: string | null; status: string } | null>(null);
  const [leaveBalances, setLeaveBalances] = useState<{ leaveType: string; code: string; available: number; total: number; used: number; color: string }[]>([]);
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
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-[#2c2759] to-[#3b3469] rounded-2xl p-6 text-white">
        <h1 className="text-xl font-bold">Welcome {session?.user?.name?.split(" ")[0]}!</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* ── Left Column: Quick Access ── */}
        <div className="space-y-4">
          {/* Inbox Status */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 text-sm mb-2">Inbox</h3>
            <div className="flex items-center gap-3">
              <span className="text-2xl">🎉</span>
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {pendingCount > 0 ? `${pendingCount} pending action(s)` : "Good job!"}
                </p>
                <p className="text-xs text-gray-500">
                  {pendingCount > 0 ? "Review required" : "You have no pending actions."}
                </p>
              </div>
            </div>
            {pendingCount > 0 && (
              <Link href="/approvals" className="mt-3 inline-block text-xs text-indigo-600 font-medium hover:underline">
                View Pending →
              </Link>
            )}
          </div>

          {/* Holidays Widget */}
          <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-4 text-white relative overflow-hidden">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-sm">🎌 Holidays</h3>
              <Link href="/attendance" className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full hover:bg-white/30 transition">View All</Link>
            </div>
            {holidays.length > 0 ? (
              <div className="mt-2">
                <p className="text-lg font-bold">{holidays[0].name}</p>
                <p className="text-sm opacity-80">{new Date(holidays[0].date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}</p>
              </div>
            ) : (
              <p className="text-sm opacity-80 mt-2">No upcoming holidays</p>
            )}
          </div>

          {/* On Leave Today */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 text-sm mb-2">On Leave Today</h3>
            {teamOnLeave.length > 0 ? (
              <div className="space-y-2">
                {teamOnLeave.slice(0, 3).map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center text-[10px] font-bold text-orange-600">{t.name[0]}</div>
                    <span className="text-xs text-gray-700">{t.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="text-sm font-medium text-gray-800">Everyone&apos;s working today!</p>
                  <p className="text-xs text-gray-500">No one is on leave today.</p>
                </div>
              </div>
            )}
          </div>

          {/* Working Remotely */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 text-sm mb-2">Working Remotely</h3>
            <div className="flex items-center gap-3">
              <span className="text-2xl">🏢</span>
              <div>
                <p className="text-sm font-medium text-gray-800">Everyone is at office!</p>
                <p className="text-xs text-gray-500">No one is working remotely today.</p>
              </div>
            </div>
          </div>

          {/* Time + Web Clock-In */}
          <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl p-4 text-white">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs opacity-80">Time Today — {mounted ? time.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : ""}</p>
              <Link href="/attendance" className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full hover:bg-white/30 transition">View All</Link>
            </div>
            <p className="text-xs opacity-60 mt-1">CURRENT TIME</p>
            <p className="text-3xl font-bold tabular-nums" suppressHydrationWarning>
              {mounted ? time.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "--:--"}
              <span className="text-sm font-normal ml-1 opacity-80" suppressHydrationWarning>
                {mounted ? time.toLocaleTimeString("en-IN", { second: "2-digit" }).split(":").pop()?.replace(/[^\d]/g, "") : ""}
                {mounted ? (time.getHours() >= 12 ? " PM" : " AM") : ""}
              </span>
            </p>
            {!todayAttendance?.clockIn ? (
              <button onClick={handleClockIn} className="mt-3 bg-white/20 hover:bg-white/30 border border-white/30 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors w-full">
                Web Clock-In
              </button>
            ) : (
              <p className="text-xs opacity-60 mt-3">Clocked in at {todayAttendance.clockIn}</p>
            )}
          </div>

          {/* Leave Balances */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 text-sm mb-3">Leave Balances</h3>
            <div className="flex gap-2 flex-wrap">
              {leaveBalances.slice(0, 3).map((b, i) => (
                <div key={i} className="flex-1 min-w-[70px] text-center p-2 rounded-lg border border-gray-100 bg-gray-50">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mx-auto" style={{ backgroundColor: b.color + "20", color: b.color }}>
                    {b.available}
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-wide">{b.code || b.leaveType?.split(" ")[0]}</p>
                  <p className="text-[10px] text-gray-400">Days</p>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-3">
              <Link href="/leave" className="text-xs text-indigo-600 font-medium hover:underline">Request Leave</Link>
              <Link href="/leave" className="text-xs text-indigo-600 font-medium hover:underline">View All Balances</Link>
            </div>
          </div>
        </div>

        {/* ── Right Column: Main Content ── */}
        <div className="lg:col-span-3 space-y-6">
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

          {/* Birthdays + Anniversaries Bar */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-6 text-sm text-gray-600">
              <span className="flex items-center gap-1.5">🎂 <strong>{birthdays.length}</strong> Birthdays</span>
              <span className="flex items-center gap-1.5">🎉 0 Work Anniversaries</span>
              <span className="flex items-center gap-1.5">👤 0 New Joinees</span>
            </div>
          </div>

          {/* Birthdays Today + Upcoming */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-4">🎂 Birthdays Today</h3>
              {birthdays.filter(b => b.daysAway === 0).length > 0 ? (
                <div className="space-y-3">
                  {birthdays.filter(b => b.daysAway === 0).map((b, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-pink-50 to-purple-50">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
                        {b.employee.firstName[0]}{b.employee.lastName?.[0] || ""}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{b.employee.firstName} {b.employee.lastName}</p>
                        <p className="text-xs text-gray-500">{b.employee.department}</p>
                      </div>
                      <span className="ml-auto text-xs bg-pink-100 text-pink-700 px-2 py-1 rounded-full font-medium">🎉 Today!</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <span className="text-3xl">👤</span>
                  <p className="text-sm text-gray-400 mt-2">No birthdays today.</p>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-4">📅 Upcoming Birthdays</h3>
              {birthdays.filter(b => b.daysAway > 0).length > 0 ? (
                <div className="space-y-3">
                  {birthdays.filter(b => b.daysAway > 0).slice(0, 5).map((b, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white font-bold text-xs">
                        {b.employee.firstName[0]}{b.employee.lastName?.[0] || ""}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{b.employee.firstName} {b.employee.lastName}</p>
                        <p className="text-xs text-gray-500">{b.daysAway === 1 ? "Tomorrow" : `${b.daysAway} days away`}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-6">No upcoming birthdays this month</p>
              )}
            </div>
          </div>

          {/* Upcoming Holidays */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">📅 Upcoming Holidays</h3>
            {holidays.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {holidays.map((h, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-blue-50">
                    <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-sm">
                      {new Date(h.date).getDate()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{h.name}</p>
                      <p className="text-xs text-gray-500">{new Date(h.date).toLocaleDateString("en-IN", { weekday: "short", month: "short", year: "numeric" })}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">No upcoming holidays</p>
            )}
          </div>

          {/* Manager Leave Dashboard */}
          {directReportsLeaves.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
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
    </div>
  );
}
