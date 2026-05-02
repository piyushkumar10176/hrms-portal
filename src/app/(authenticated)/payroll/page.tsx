"use client";

import { useEffect, useState } from "react";

interface Payslip {
  id: string; month: string; basic: number; hra: number; conveyance: number;
  medical: number; special: number; grossEarnings: number; pf: number; esi: number;
  professionalTax: number; tds: number; totalDeductions: number; netPay: number;
  status: string; paidOn?: string;
}

export default function PayrollPage() {
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [selected, setSelected] = useState<Payslip | null>(null);
  const [latest, setLatest] = useState<Payslip | null>(null);

  useEffect(() => {
    fetch("/api/payroll").then(r => r.json()).then(d => {
      setPayslips(d.payslips || []);
      setLatest(d.latest || null);
      if (d.latest) setSelected(d.latest);
    });
  }, []);

  const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  const monthName = (m: string) => {
    const [y, mo] = m.split("-");
    return new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payroll & Payslips</h1>
        <p className="text-gray-500 mt-1">View your salary details and download payslips</p>
      </div>

      {/* Latest Pay Summary */}
      {latest && (
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-6 text-white">
          <p className="text-sm opacity-80">Latest Net Pay — {monthName(latest.month)}</p>
          <p className="text-4xl font-bold mt-2">{fmt(latest.netPay)}</p>
          <div className="flex gap-6 mt-4 text-sm opacity-80">
            <span>Gross: {fmt(latest.grossEarnings)}</span>
            <span>Deductions: {fmt(latest.totalDeductions)}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Payslip List */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Payslip History</h3>
          <div className="space-y-2">
            {payslips.map(p => (
              <button key={p.id} onClick={() => setSelected(p)}
                className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors ${selected?.id === p.id ? "bg-indigo-50 border border-indigo-200" : "hover:bg-gray-50"}`}>
                <div>
                  <p className="text-sm font-medium text-gray-900">{monthName(p.month)}</p>
                  <p className="text-xs text-gray-500">Net: {fmt(p.netPay)}</p>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${p.status === "Paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                  {p.status}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Payslip Detail */}
        <div className="lg:col-span-2">
          {selected ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Payslip — {monthName(selected.month)}</h3>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${selected.status === "Paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                  {selected.status} {selected.paidOn && `on ${new Date(selected.paidOn).toLocaleDateString("en-IN")}`}
                </span>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Earnings */}
                <div>
                  <h4 className="text-sm font-semibold text-green-700 mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500" /> Earnings
                  </h4>
                  <div className="space-y-2">
                    {[
                      { label: "Basic Salary", val: selected.basic },
                      { label: "HRA", val: selected.hra },
                      { label: "Conveyance Allowance", val: selected.conveyance },
                      { label: "Medical Allowance", val: selected.medical },
                      { label: "Special Allowance", val: selected.special },
                    ].map((item, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-gray-600">{item.label}</span>
                        <span className="font-medium">{fmt(item.val)}</span>
                      </div>
                    ))}
                    <div className="border-t border-gray-200 pt-2 flex justify-between text-sm font-semibold text-green-700">
                      <span>Gross Earnings</span>
                      <span>{fmt(selected.grossEarnings)}</span>
                    </div>
                  </div>
                </div>

                {/* Deductions */}
                <div>
                  <h4 className="text-sm font-semibold text-red-700 mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500" /> Deductions
                  </h4>
                  <div className="space-y-2">
                    {[
                      { label: "Provident Fund (PF)", val: selected.pf },
                      { label: "ESI", val: selected.esi },
                      { label: "Professional Tax", val: selected.professionalTax },
                      { label: "TDS (Income Tax)", val: selected.tds },
                    ].map((item, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-gray-600">{item.label}</span>
                        <span className="font-medium text-red-600">-{fmt(item.val)}</span>
                      </div>
                    ))}
                    <div className="border-t border-gray-200 pt-2 flex justify-between text-sm font-semibold text-red-700">
                      <span>Total Deductions</span>
                      <span>-{fmt(selected.totalDeductions)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Net Pay */}
              <div className="px-6 py-4 bg-indigo-50 border-t border-indigo-100">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold text-indigo-900">Net Pay</span>
                  <span className="text-2xl font-bold text-indigo-700">{fmt(selected.netPay)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 text-center py-20">
              <span className="text-4xl">💰</span>
              <p className="text-gray-400 mt-4">Select a payslip to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
