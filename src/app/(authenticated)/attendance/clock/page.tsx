"use client";

import { useCallback, useEffect, useState } from "react";
import { useClock } from "@/hooks/use-clock";
import {
  formatHours,
  formatMinutes,
  BREAK_ALLOWANCE_MINUTES,
  MINIMUM_EFFECTIVE_HOURS,
  type DaySummary,
} from "@/lib/attendance";

export default function ClockPage() {
  const time = useClock();
  const [today, setToday] = useState<DaySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    fetch("/api/attendance/punch")
      .then(r => r.json())
      .then(d => setToday(d.today))
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  const handlePunch = async (action: "clockIn" | "clockOut") => {
    setLoading(true);
    setMessage("");
    setError("");
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
        setError(data.error || "Something went wrong. Try again.");
      }
    } catch { setError("Network error. Check your connection and try again."); }
    setLoading(false);
  };

  const onTheClock = today?.onTheClock ?? false;

  // Nothing in the punches says whether a clock-out was a coffee break or the
  // end of the day, so the page states the fact and lets the employee decide.
  // It used to guess "on break", which meant anyone who finished at 19:00 was
  // told they were on a break and offered a "Back from Break" button, and never
  // saw the hours they had worked.
  const statusLabel = !today
    ? "Not clocked in yet"
    : onTheClock
      ? `Working since ${today.clockIn}`
      : `Clocked out at ${today.clockOut} — ${formatHours(today.effectiveHours)} worked so far`;

  const statusDot = !today
    ? "bg-orange-400"
    : onTheClock
      ? "bg-green-500 animate-pulse"
      : "bg-gray-400";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Clock In / Out</h1>
        <p className="text-gray-500 mt-1">
          A {MINIMUM_EFFECTIVE_HOURS + BREAK_ALLOWANCE_MINUTES / 60}-hour shift: {MINIMUM_EFFECTIVE_HOURS} effective
          hours plus {formatMinutes(BREAK_ALLOWANCE_MINUTES)} of break. Clock out when you step away and back in when
          you return, and the gap counts as your break.
        </p>
      </div>

      {/* Time Display */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl p-8 text-center text-white">
        <p className="text-sm opacity-80">Current Time</p>
        <p className="text-5xl font-bold tabular-nums mt-2" suppressHydrationWarning>
          {time ? time.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--"}
        </p>
        <p className="text-sm opacity-80 mt-2" suppressHydrationWarning>
          {time ? time.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Loading..."}
        </p>
      </div>

      {/* Status */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className={`w-3 h-3 rounded-full ${statusDot}`} />
          <span className="font-medium text-gray-700">{statusLabel}</span>
        </div>
        <p className="text-xs text-gray-400 mb-6">📍 GPS will be captured on punch</p>

        <div className="flex gap-4">
          <button onClick={() => handlePunch("clockIn")} disabled={loading || onTheClock}
            className="flex-1 py-4 rounded-xl font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-lg">
            🕐 Clock In
          </button>
          <button onClick={() => handlePunch("clockOut")} disabled={loading || !onTheClock}
            className="flex-1 py-4 rounded-xl font-semibold text-white bg-rose-500 hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-lg">
            🕐 Clock Out
          </button>
        </div>

        {message && (
          <p className="mt-4 text-sm font-medium text-green-700 bg-green-50 p-3 rounded-lg">{message}</p>
        )}
        {error && (
          <p className="mt-4 text-sm font-medium text-red-700 bg-red-50 p-3 rounded-lg">{error}</p>
        )}
      </div>

      {/* Today's totals */}
      {today && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-gray-900 tabular-nums">{formatHours(today.effectiveHours)}</p>
            <p className="text-xs text-gray-500 mt-1">Effective of {MINIMUM_EFFECTIVE_HOURS}h</p>
          </div>
          <div className={`rounded-xl border p-4 text-center ${today.breakOverAllowance ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200"}`}>
            <p className={`text-2xl font-bold tabular-nums ${today.breakOverAllowance ? "text-amber-700" : "text-gray-900"}`}>
              {formatMinutes(today.breakMinutes)}
            </p>
            <p className={`text-xs mt-1 ${today.breakOverAllowance ? "text-amber-600" : "text-gray-500"}`}>
              Break of {formatMinutes(BREAK_ALLOWANCE_MINUTES)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-gray-900 tabular-nums">{formatHours(today.grossHours)}</p>
            <p className="text-xs text-gray-500 mt-1">On premises</p>
          </div>
        </div>
      )}

      {/* Today's Log */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Today&apos;s Punch Log</h3>
        {today && today.log.length > 0 ? (
          <ol className="space-y-3">
            {today.log.map((entry, i) => (
              <li key={`${entry.at}-${i}`} className="space-y-3">
                {entry.breakBeforeMinutes ? (
                  <div className="flex items-center gap-3 text-amber-700">
                    <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                    <span className="text-sm">Break of {formatMinutes(entry.breakBeforeMinutes)}</span>
                  </div>
                ) : null}
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${entry.type === "Check-In" ? "bg-green-500" : "bg-rose-500"}`} />
                  <span className="text-sm text-gray-600 w-20">
                    {entry.type === "Check-In" ? "Clock in" : "Clock out"}
                  </span>
                  <span className="text-sm font-medium tabular-nums">{entry.time}</span>
                  {entry.source && (
                    <span className="text-xs text-gray-400 ml-auto">via {entry.source}</span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">No punches recorded today</p>
        )}
      </div>
    </div>
  );
}
