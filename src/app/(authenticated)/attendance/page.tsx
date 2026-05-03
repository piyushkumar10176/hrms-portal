"use client";

import { useEffect, useState } from "react";

interface AttRecord { date: string; clockIn: string | null; clockOut: string | null; status: string; totalHours: number; }

export default function AttendancePage() {
  const [records, setRecords] = useState<AttRecord[]>([]);
  const [summary, setSummary] = useState({ present: 0, absent: 0, leaves: 0, total: 0 });
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year] = useState(now.getFullYear());

  useEffect(() => {
    fetch(`/api/attendance/monthly?year=${year}&month=${month}`)
      .then(r => r.json())
      .then(d => { setRecords(d.records || []); setSummary(d.summary || {}); })
      .catch(() => {});
  }, [month, year]);

  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
          <p className="text-gray-500 mt-1">Your monthly attendance records</p>
        </div>
        <div className="flex gap-4">
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
            {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <a href="/attendance/clock" className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2 shadow-sm">
            <span>⏱️</span> Web Clock-In
          </a>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-green-50 rounded-xl p-4 text-center border border-green-100">
          <p className="text-2xl font-bold text-green-700">{summary.present}</p>
          <p className="text-xs text-green-600 mt-1">Present</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 text-center border border-red-100">
          <p className="text-2xl font-bold text-red-700">{summary.absent}</p>
          <p className="text-xs text-red-600 mt-1">Absent</p>
        </div>
        <div className="bg-yellow-50 rounded-xl p-4 text-center border border-yellow-100">
          <p className="text-2xl font-bold text-yellow-700">{summary.leaves}</p>
          <p className="text-xs text-yellow-600 mt-1">On Leave</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 text-center border border-blue-100">
          <p className="text-2xl font-bold text-blue-700">{summary.total}</p>
          <p className="text-xs text-blue-600 mt-1">Total Days</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Day</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Clock In</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Clock Out</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Hours</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">{new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(r.date).toLocaleDateString("en-IN", { weekday: "short" })}</td>
                  <td className="px-4 py-3">{r.clockIn || "—"}</td>
                  <td className="px-4 py-3">{r.clockOut || "—"}</td>
                  <td className="px-4 py-3">{r.totalHours > 0 ? `${r.totalHours.toFixed(1)}h` : "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                      r.status === "Present" ? "bg-green-100 text-green-700" :
                      r.status === "Weekend" ? "bg-gray-100 text-gray-500" :
                      r.status === "Leave" ? "bg-yellow-100 text-yellow-700" :
                      "bg-red-100 text-red-700"
                    }`}>{r.status}</span>
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
