"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface Payslip {
  id: string; month: string; basic: number; hra: number; conveyance: number;
  medical: number; special: number; grossEarnings: number; pf: number; esi: number;
  professionalTax: number; tds: number; totalDeductions: number; netPay: number;
  status: string; paidOn?: string;
}

interface SalaryComponent { id: string; component: string; monthly: number; annual: number; isTaxable?: boolean; isStatutory?: boolean; }
interface SalaryStructure { ctc: number; grossMonthly: number; netMonthly: number; effectiveDate: string | null; earnings: SalaryComponent[]; deductions: SalaryComponent[]; }
interface TaxDeclaration {
  id: string; financialYear: string; taxRegime: string; section80C: number;
  section80D: number; section80G: number; hraRentPaid: number; landlordPAN: string;
  homeLoanInterest: number; otherIncome: number; previousEmployerTDS: number; status: string;
}
interface PayrollCycle { id: string; name: string; month: string; year: number; startDate: string; endDate: string; status: string; totalGross: number; totalNet: number; totalEmployees: number; }

type Tab = "payslips" | "structure" | "tax" | "cycles";

function PayrollContent() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "payslips";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [selected, setSelected] = useState<Payslip | null>(null);
  const [latest, setLatest] = useState<Payslip | null>(null);
  const [salary, setSalary] = useState<SalaryStructure | null>(null);
  const [taxDecl, setTaxDecl] = useState<TaxDeclaration | null>(null);
  const [cycles, setCycles] = useState<PayrollCycle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/payroll").then(r => r.json()).then(d => {
      setPayslips(d.payslips || []);
      setLatest(d.latest || null);
      if (d.latest) setSelected(d.latest);
      setSalary(d.salaryStructure || null);
      setTaxDecl(d.taxDeclaration || null);
      setCycles(d.payrollCycles || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const fmt = (n: number) => `₹${(n || 0).toLocaleString("en-IN")}`;
  const monthName = (m: string) => {
    const [y, mo] = m.split("-");
    return new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  };

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "payslips", label: "Payslips", icon: "📄" },
    { key: "structure", label: "Salary Structure", icon: "💰" },
    { key: "tax", label: "Tax Declarations", icon: "🏛️" },
    { key: "cycles", label: "Payroll Cycles", icon: "🔄" },
  ];

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Finances</h1>
        <p className="text-gray-500 mt-1">Salary structure, payslips, tax declarations & payroll cycles</p>
      </div>

      {/* Summary Banner */}
      {salary && (
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-6 text-white">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm opacity-80">Annual CTC</p>
              <p className="text-2xl font-bold mt-1">{fmt(salary.ctc)}</p>
            </div>
            <div>
              <p className="text-sm opacity-80">Monthly Gross</p>
              <p className="text-2xl font-bold mt-1">{fmt(salary.grossMonthly)}</p>
            </div>
            <div>
              <p className="text-sm opacity-80">Monthly Net</p>
              <p className="text-2xl font-bold mt-1">{fmt(salary.netMonthly)}</p>
            </div>
            <div>
              <p className="text-sm opacity-80">Latest Net Pay</p>
              <p className="text-2xl font-bold mt-1">{latest ? fmt(latest.netPay) : "—"}</p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${tab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            <span className="mr-1.5">{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "payslips" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
              {payslips.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No payslips found</p>}
            </div>
          </div>

          <div className="lg:col-span-2">
            {selected ? (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">Payslip — {monthName(selected.month)}</h3>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${selected.status === "Paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                      {selected.status} {selected.paidOn && `on ${new Date(selected.paidOn).toLocaleDateString("en-IN")}`}
                    </span>
                    <button onClick={() => window.print()} className="print:hidden text-indigo-600 hover:text-indigo-800 text-sm font-medium bg-indigo-50 px-3 py-1.5 rounded-lg">⬇ Download</button>
                  </div>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-sm font-semibold text-green-700 mb-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500" /> Earnings</h4>
                    <div className="space-y-2">
                      {[{ label: "Basic Salary", val: selected.basic }, { label: "HRA", val: selected.hra }, { label: "Conveyance", val: selected.conveyance }, { label: "Medical", val: selected.medical }, { label: "Special Allowance", val: selected.special }].map((item, i) => (
                        <div key={i} className="flex justify-between text-sm"><span className="text-gray-600">{item.label}</span><span className="font-medium">{fmt(item.val)}</span></div>
                      ))}
                      <div className="border-t border-gray-200 pt-2 flex justify-between text-sm font-semibold text-green-700"><span>Gross Earnings</span><span>{fmt(selected.grossEarnings)}</span></div>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-red-700 mb-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500" /> Deductions</h4>
                    <div className="space-y-2">
                      {[{ label: "PF", val: selected.pf }, { label: "ESI", val: selected.esi }, { label: "Professional Tax", val: selected.professionalTax }, { label: "TDS", val: selected.tds }].map((item, i) => (
                        <div key={i} className="flex justify-between text-sm"><span className="text-gray-600">{item.label}</span><span className="font-medium text-red-600">-{fmt(item.val)}</span></div>
                      ))}
                      <div className="border-t border-gray-200 pt-2 flex justify-between text-sm font-semibold text-red-700"><span>Total Deductions</span><span>-{fmt(selected.totalDeductions)}</span></div>
                    </div>
                  </div>
                </div>
                <div className="px-6 py-4 bg-indigo-50 border-t border-indigo-100">
                  <div className="flex justify-between items-center"><span className="text-lg font-semibold text-indigo-900">Net Pay</span><span className="text-2xl font-bold text-indigo-700">{fmt(selected.netPay)}</span></div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 text-center py-20"><span className="text-4xl">💰</span><p className="text-gray-400 mt-4">Select a payslip to view details</p></div>
            )}
          </div>
        </div>
      )}

      {tab === "structure" && salary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-green-50">
              <h3 className="font-semibold text-green-800 flex items-center gap-2">💸 Earnings</h3>
            </div>
            <div className="p-6 space-y-3">
              {salary.earnings.map((e, i) => (
                <div key={i} className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{e.component}</p>
                    <p className="text-xs text-gray-400">{e.isTaxable ? "Taxable" : "Non-Taxable"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">{fmt(e.monthly)}<span className="text-xs text-gray-400">/mo</span></p>
                    <p className="text-xs text-gray-500">{fmt(e.annual)}/yr</p>
                  </div>
                </div>
              ))}
              <div className="border-t border-gray-200 pt-3 flex justify-between text-sm font-bold text-green-700">
                <span>Total Gross</span><span>{fmt(salary.grossMonthly)}/mo</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-red-50">
              <h3 className="font-semibold text-red-800 flex items-center gap-2">📉 Deductions</h3>
            </div>
            <div className="p-6 space-y-3">
              {salary.deductions.map((d, i) => (
                <div key={i} className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{d.component}</p>
                    <p className="text-xs text-gray-400">{d.isStatutory ? "Statutory" : "Voluntary"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-red-600">-{fmt(d.monthly)}<span className="text-xs text-gray-400">/mo</span></p>
                    <p className="text-xs text-gray-500">-{fmt(d.annual)}/yr</p>
                  </div>
                </div>
              ))}
              <div className="border-t border-gray-200 pt-3 flex justify-between text-sm font-bold text-red-700">
                <span>Total Deductions</span><span>-{fmt(salary.deductions.reduce((s, d) => s + d.monthly, 0))}/mo</span>
              </div>
            </div>
          </div>

          <div className="md:col-span-2 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-white">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm opacity-80">Net Take Home (Monthly)</p>
                <p className="text-3xl font-bold mt-1">{fmt(salary.netMonthly)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm opacity-80">Effective From</p>
                <p className="text-lg font-semibold mt-1">{salary.effectiveDate ? new Date(salary.effectiveDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "tax" && (
        <div className="space-y-6">
          {taxDecl ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">FY {taxDecl.financialYear}</h3>
                  <p className="text-sm text-gray-500">Tax Regime: <span className="font-medium text-indigo-600">{taxDecl.taxRegime}</span></p>
                </div>
                <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${taxDecl.status === "Verified" ? "bg-green-100 text-green-700" : taxDecl.status === "Submitted" ? "bg-blue-100 text-blue-700" : "bg-yellow-100 text-yellow-700"}`}>
                  {taxDecl.status}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { label: "Section 80C", sublabel: "PPF, ELSS, LIC, NSC", value: taxDecl.section80C, max: 150000, icon: "🏦" },
                  { label: "Section 80D", sublabel: "Medical Insurance", value: taxDecl.section80D, max: 75000, icon: "🏥" },
                  { label: "Section 80G", sublabel: "Donations", value: taxDecl.section80G, max: null, icon: "🤝" },
                  { label: "HRA Rent Paid", sublabel: "Annual Rent", value: taxDecl.hraRentPaid, max: null, icon: "🏠" },
                  { label: "Home Loan Interest", sublabel: "Section 24(b)", value: taxDecl.homeLoanInterest, max: 200000, icon: "🏗️" },
                  { label: "Previous Employer TDS", sublabel: "Already deducted", value: taxDecl.previousEmployerTDS, max: null, icon: "📋" },
                ].map((item, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-2xl">{item.icon}</span>
                        <p className="text-sm font-semibold text-gray-900 mt-2">{item.label}</p>
                        <p className="text-xs text-gray-400">{item.sublabel}</p>
                      </div>
                      <p className="text-lg font-bold text-indigo-700">{fmt(item.value)}</p>
                    </div>
                    {item.max && (
                      <div className="mt-3">
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${Math.min((item.value / item.max) * 100, 100)}%` }} />
                        </div>
                        <p className="text-xs text-gray-400 mt-1 text-right">Max: {fmt(item.max)}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {taxDecl.landlordPAN && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm text-gray-500">Landlord PAN: <span className="font-mono font-semibold text-gray-900">{taxDecl.landlordPAN}</span></p>
                </div>
              )}

              {taxDecl.otherIncome > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                  <p className="text-sm font-semibold text-amber-800">⚠️ Other Income Declared: {fmt(taxDecl.otherIncome)}</p>
                  <p className="text-xs text-amber-600 mt-1">This will be added to your taxable income for TDS calculation</p>
                </div>
              )}
            </>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 text-center py-16">
              <span className="text-5xl">🏛️</span>
              <p className="text-gray-500 mt-4 text-lg">No tax declaration found for this financial year</p>
              <p className="text-gray-400 text-sm mt-1">Contact HR to submit your investment declarations</p>
            </div>
          )}
        </div>
      )}

      {tab === "cycles" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3">Cycle</th>
                <th className="px-6 py-3">Period</th>
                <th className="px-6 py-3">Employees</th>
                <th className="px-6 py-3">Gross</th>
                <th className="px-6 py-3">Net</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cycles.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{c.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{new Date(c.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – {new Date(c.endDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{c.totalEmployees}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{fmt(c.totalGross)}</td>
                  <td className="px-6 py-4 text-sm font-medium text-green-700">{fmt(c.totalNet)}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                      c.status === "Paid" ? "bg-green-100 text-green-700" :
                      c.status === "Finalized" ? "bg-blue-100 text-blue-700" :
                      c.status === "Processing" ? "bg-amber-100 text-amber-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>{c.status}</span>
                  </td>
                </tr>
              ))}
              {cycles.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400">No payroll cycles found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function PayrollPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>}>
      <PayrollContent />
    </Suspense>
  );
}
