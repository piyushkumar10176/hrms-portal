"use client";

import { useEffect, useState } from "react";
import {
  formatHours,
  formatMinutes,
  BREAK_ALLOWANCE_MINUTES,
  MINIMUM_EFFECTIVE_HOURS,
} from "@/lib/attendance";

interface AttRecord {
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  status: string;
  totalHours: number;
  grossHours: number;
  breakMinutes: number;
  breakOverAllowance: boolean;
  penalty: boolean;
  penaltyReason: string | null;
}

interface AttSummary {
  present: number;
  absent: number;
  leaves: number;
  total: number;
  effectiveHours: number;
  breakMinutes: number;
  averageEffectiveHours: number;
  penalties: number;
}

const EMPTY_SUMMARY: AttSummary = {
  present: 0, absent: 0, leaves: 0, total: 0,
  effectiveHours: 0, breakMinutes: 0, averageEffectiveHours: 0, penalties: 0,
};

export default function AttendancePage() {
  const [records, setRecords] = useState<AttRecord[]>([]);
  const [summary, setSummary] = useState<AttSummary>(EMPTY_SUMMARY);
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year] = useState(now.getFullYear());

  useEffect(() => {
    fetch(`/api/attendance/monthly?year=${year}&month=${month}`)
      .then(r => r.json())
      .then(d => { setRecords(d.records || []); setSummary({ ...EMPTY_SUMMARY, ...(d.summary || {}) }); })
      .catch(() => {});
  }, [month, year]);

  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
          <p className="text-gray-500 mt-1">
            Effective hours exclude breaks. A break is the gap between a clock-out and your next clock-in.
          </p>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-green-50 rounded-xl p-4 text-center border border-green-100">
          <p className="text-2xl font-bold text-green-700 tabular-nums">{summary.present}</p>
          <p className="text-xs text-green-600 mt-1">Present</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 text-center border border-red-100">
          <p className="text-2xl font-bold text-red-700 tabular-nums">{summary.absent}</p>
          <p className="text-xs text-red-600 mt-1">Absent</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 text-center border border-blue-100">
          <p className="text-2xl font-bold text-blue-700 tabular-nums">{formatHours(summary.averageEffectiveHours)}</p>
          <p className="text-xs text-blue-600 mt-1">Average effective day</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-4 text-center border border-amber-100">
          <p className="text-2xl font-bold text-amber-700 tabular-nums">{formatMinutes(summary.breakMinutes)}</p>
          <p className="text-xs text-amber-600 mt-1">Break this month</p>
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
                <th className="text-left px-4 py-3 font-medium text-gray-600">Break</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600" title={`Hours worked with breaks excluded, against the ${MINIMUM_EFFECTIVE_HOURS}-hour policy`}>
                  Effective
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600" title="First clock-in to last clock-out, breaks included">
                  On Premises
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    No attendance recorded for {months[month]}.
                  </td>
                </tr>
              )}
              {records.map((r, i) => (
                <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">{new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(r.date).toLocaleDateString("en-IN", { weekday: "short" })}</td>
                  <td className="px-4 py-3 tabular-nums">{r.clockIn || "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{r.clockOut || "—"}</td>
                  <td className={`px-4 py-3 tabular-nums ${r.breakOverAllowance ? "text-amber-700 font-medium" : ""}`}
                      title={r.breakOverAllowance ? `Over the ${formatMinutes(BREAK_ALLOWANCE_MINUTES)} allowance` : undefined}>
                    {r.breakMinutes > 0 ? formatMinutes(r.breakMinutes) : "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums font-medium">{r.totalHours > 0 ? formatHours(r.totalHours) : "—"}</td>
                  <td className="px-4 py-3 tabular-nums text-gray-500">{r.grossHours > 0 ? formatHours(r.grossHours) : "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                        r.status === "Present" ? "bg-green-100 text-green-700" :
                        r.status === "Half Day" ? "bg-orange-100 text-orange-700" :
                        r.status === "Week Off" || r.status === "Holiday" ? "bg-gray-100 text-gray-500" :
                        r.status === "Leave" ? "bg-yellow-100 text-yellow-700" :
                        "bg-red-100 text-red-700"
                      }`}>{r.status}</span>
                      {r.penalty && (
                        <span className="text-amber-600 cursor-help" title={r.penaltyReason || "Flagged"}>⚠</span>
                      )}
                    </div>
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
