"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

interface LoanRepayment { Id: string; Amount__c: number; Date__c: string; }
interface Loan {
  Id: string; Name: string; Type__c: string; Principal__c: number; Interest_Rate__c: number;
  Tenure_Months__c: number; EMI__c: number; Outstanding__c: number;
  Start_Date__c: string; End_Date__c?: string; Status__c: string;
  Repayments__r?: { records: LoanRepayment[] };
}

export default function LoansPage() {
  const { data: session } = useSession();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (session) fetchLoans(); }, [session]);

  const fetchLoans = async () => {
    try {
      const res = await fetch("/api/loans");
      const data = await res.json();
      if (res.ok) setLoans(data.loans || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const fmt = (n: number) => `₹${(n || 0).toLocaleString("en-IN")}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Loans</h1>
        <p className="text-gray-500 mt-1">Track your active loans and repayments</p>
      </div>

      {loading ? <div className="text-center py-10 text-gray-400">Loading...</div> :
        loans.length > 0 ? (
          <div className="space-y-4">
            {loans.map(loan => (
              <div key={loan.Id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-gray-900">{loan.Name}</h3>
                      <p className="text-sm text-gray-500">{loan.Type__c} • Started {loan.Start_Date__c ? new Date(loan.Start_Date__c).toLocaleDateString("en-IN") : "—"}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${loan.Status__c === "Active" ? "bg-green-100 text-green-700" : loan.Status__c === "Closed" ? "bg-gray-100 text-gray-600" : "bg-red-100 text-red-700"}`}>
                      {loan.Status__c}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div><p className="text-xs text-gray-500 uppercase">Principal</p><p className="font-semibold text-gray-900">{fmt(loan.Principal__c)}</p></div>
                    <div><p className="text-xs text-gray-500 uppercase">EMI</p><p className="font-semibold text-gray-900">{fmt(loan.EMI__c)}</p></div>
                    <div><p className="text-xs text-gray-500 uppercase">Outstanding</p><p className="font-semibold text-indigo-600">{fmt(loan.Outstanding__c)}</p></div>
                    <div><p className="text-xs text-gray-500 uppercase">Tenure</p><p className="font-semibold text-gray-900">{loan.Tenure_Months__c} months</p></div>
                  </div>
                  {/* Progress bar */}
                  {loan.Principal__c > 0 && (
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Repaid</span>
                        <span>{Math.round(((loan.Principal__c - loan.Outstanding__c) / loan.Principal__c) * 100)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-indigo-600 h-2 rounded-full transition-all"
                          style={{ width: `${Math.min(100, ((loan.Principal__c - loan.Outstanding__c) / loan.Principal__c) * 100)}%` }} />
                      </div>
                    </div>
                  )}
                </div>
                {loan.Repayments__r?.records && loan.Repayments__r.records.length > 0 && (
                  <div className="border-t border-gray-200 px-5 py-3 bg-gray-50">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Recent Repayments</p>
                    <div className="space-y-1">
                      {loan.Repayments__r.records.slice(0, 5).map(r => (
                        <div key={r.Id} className="flex justify-between text-sm">
                          <span className="text-gray-600">{r.Date__c ? new Date(r.Date__c).toLocaleDateString("en-IN") : "—"}</span>
                          <span className="font-medium text-gray-900">{fmt(r.Amount__c)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center text-gray-500">No loans found.</div>
      }
    </div>
  );
}
