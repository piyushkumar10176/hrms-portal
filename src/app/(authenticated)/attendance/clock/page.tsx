"use client";

import { useEffect, useState } from "react";

export default function ClockPage() {
  const [mounted, setMounted] = useState(false);
  const [time, setTime] = useState(new Date());
  const [today, setToday] = useState<{ clockIn: string | null; clockOut: string | null; status: string; totalHours: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!mounted) return;
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, [mounted]);

  useEffect(() => {
    fetch("/api/attendance/punch").then(r => r.json()).then(d => setToday(d.today)).catch(() => {});
  }, []);

  const handlePunch = async (action: "clockIn" | "clockOut") => {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/attendance/punch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok) {
        setToday(data.record);
        setMessage(data.message);
      } else {
        setMessage(data.error || "Failed");
      }
    } catch { setMessage("Network error"); }
    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Clock In / Out</h1>
        <p className="text-gray-500 mt-1">Record your attendance for today</p>
      </div>

      {/* Time Display */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl p-8 text-center text-white">
        <p className="text-sm opacity-80">Current Time</p>
        <p className="text-5xl font-bold tabular-nums mt-2" suppressHydrationWarning>
          {mounted ? time.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--"}
        </p>
        <p className="text-sm opacity-80 mt-2" suppressHydrationWarning>
          {mounted ? time.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Loading..."}
        </p>
      </div>

      {/* Status */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className={`w-3 h-3 rounded-full ${today?.clockIn ? (today.clockOut ? "bg-gray-400" : "bg-green-500 animate-pulse") : "bg-orange-400"}`} />
          <span className="font-medium text-gray-700">
            {today?.clockIn ? (today.clockOut ? `Shift Complete (${today.totalHours?.toFixed(1)}h)` : `Working since ${today.clockIn}`) : "Not Clocked In Yet"}
          </span>
        </div>
        <p className="text-xs text-gray-400 mb-6">📍 GPS will be captured on punch</p>

        <div className="flex gap-4">
          <button onClick={() => handlePunch("clockIn")} disabled={!!loading || !!(today?.clockIn && !today?.clockOut)}
            className="flex-1 py-4 rounded-xl font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-lg">
            🕐 Clock In
          </button>
          <button onClick={() => handlePunch("clockOut")} disabled={!!loading || !today?.clockIn || !!today?.clockOut}
            className="flex-1 py-4 rounded-xl font-semibold text-white bg-rose-500 hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-lg">
            🕐 Clock Out
          </button>
        </div>

        {message && (
          <p className="mt-4 text-sm font-medium text-green-600 bg-green-50 p-3 rounded-lg">{message}</p>
        )}
      </div>

      {/* Today's Log */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Today&apos;s Punch Log</h3>
        {today?.clockIn ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm text-gray-600">Clock In:</span>
              <span className="text-sm font-medium">{today.clockIn}</span>
            </div>
            {today.clockOut && (
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-sm text-gray-600">Clock Out:</span>
                <span className="text-sm font-medium">{today.clockOut}</span>
              </div>
            )}
            {today.totalHours > 0 && (
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-sm text-gray-600">Total Hours:</span>
                <span className="text-sm font-medium">{today.totalHours.toFixed(2)} hrs</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">No punches recorded today</p>
        )}
      </div>
    </div>
  );
}
