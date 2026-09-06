"use client";

import { useEffect, useState } from "react";

interface Holiday {
  id: string;
  name: string;
  date: string;
  type: string;
}

export default function HolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/holidays")
      .then(r => r.json())
      .then(d => { setHolidays(d.holidays || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // "Today" has to be the business day, not the browser's midnight, or a
  // holiday reads as past for anyone whose device is behind Asia/Kolkata.
  const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
  const sorted = [...holidays].sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = sorted.filter(h => new Date(h.date) >= today);
  const past = sorted.filter(h => new Date(h.date) < today).reverse();

  const dayName = (d: string) =>
    new Date(d).toLocaleDateString("en-IN", { weekday: "long" });
  const dateText = (d: string) =>
    new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const daysAway = (d: string) =>
    Math.round((new Date(d).getTime() - today.getTime()) / 86400000);

  const countdown = (d: string) => {
    const n = daysAway(d);
    if (n === 0) return "Today";
    if (n === 1) return "Tomorrow";
    return `In ${n} days`;
  };

  const row = (h: Holiday, isPast: boolean) => (
    <div
      key={h.id}
      className={`flex items-center gap-4 px-4 py-3 border-b border-gray-100 last:border-0 ${isPast ? "opacity-50" : ""}`}
    >
      <div className="w-14 shrink-0 text-center">
        <p className="text-lg font-bold text-gray-900 tabular-nums leading-none">
          {new Date(h.date).toLocaleDateString("en-IN", { day: "2-digit" })}
        </p>
        <p className="text-[10px] uppercase tracking-wide text-gray-500 mt-1">
          {new Date(h.date).toLocaleDateString("en-IN", { month: "short" })}
        </p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-900 truncate">{h.name}</p>
        <p className="text-xs text-gray-500">{dayName(h.date)}, {dateText(h.date)}</p>
      </div>
      <span className="shrink-0 inline-block px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
        {h.type}
      </span>
      {!isPast && (
        <span className="shrink-0 text-xs text-emerald-700 font-medium w-20 text-right">
          {countdown(h.date)}
        </span>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Holidays</h1>
        <p className="text-gray-500 mt-1">
          The company holiday calendar. Leave applications skip these days automatically,
          so a holiday inside a leave range does not cost you a day.
        </p>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
          Loading the calendar…
        </div>
      ) : holidays.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No holidays have been published yet.</p>
          <p className="text-sm text-gray-400 mt-1">Ask HR to add the calendar for this year.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-emerald-50 rounded-xl p-4 text-center border border-emerald-100">
              <p className="text-2xl font-bold text-emerald-700 tabular-nums">{upcoming.length}</p>
              <p className="text-xs text-emerald-600 mt-1">Still to come</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-center border border-gray-200">
              <p className="text-2xl font-bold text-gray-700 tabular-nums">{past.length}</p>
              <p className="text-xs text-gray-500 mt-1">Already passed</p>
            </div>
            <div className="bg-indigo-50 rounded-xl p-4 text-center border border-indigo-100 col-span-2 md:col-span-1">
              <p className="text-2xl font-bold text-indigo-700 tabular-nums">{holidays.length}</p>
              <p className="text-xs text-indigo-600 mt-1">Published in total</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900 text-sm">Upcoming</h2>
            </div>
            {upcoming.length > 0
              ? upcoming.map(h => row(h, false))
              : <p className="px-4 py-6 text-sm text-gray-400 text-center">Nothing left this year.</p>}
          </div>

          {past.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900 text-sm">Earlier this year</h2>
              </div>
              {past.map(h => row(h, true))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
