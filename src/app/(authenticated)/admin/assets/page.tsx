"use client";
import { useState, useEffect } from "react";

interface Asset {
  Id: string; Name: string; Asset_Tag__c: string; Type__c: string;
  Status__c: string; Serial_Number__c?: string; Assigned_To__r?: { Name: string };
  Purchase_Date__c?: string; Purchase_Value__c?: number;
}

export default function AdminAssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  useEffect(() => {
    // `ignore` discards a response that arrives after the effect was cleaned
    // up or superseded, which otherwise sets state on an unmounted component
    // and can apply an older response over a newer one.
    let ignore = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/assets");
        const data = await res.json();
        if (!ignore && res.ok) setAssets(data.assets || []);
      } catch (err) {
        if (!ignore) console.error(err);
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, []);

  const filtered = filter === "All" ? assets : assets.filter(a => a.Status__c === filter);

  const statusColor = (s: string) => {
    if (s === "Assigned") return "bg-green-100 text-green-700";
    if (s === "Available") return "bg-blue-100 text-blue-700";
    if (s === "Under Repair") return "bg-yellow-100 text-yellow-700";
    return "bg-gray-100 text-gray-600";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Asset Management</h1>
          <p className="text-gray-500 mt-1">Track all company assets and assignments</p>
        </div>
        <div className="flex gap-2">
          {["All", "Available", "Assigned", "Under Repair", "Retired"].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === s ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? <div className="text-center py-10 text-gray-400">Loading...</div> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Asset</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Tag</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Type</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Serial</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Assigned To</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filtered.map(a => (
                  <tr key={a.Id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{a.Name}</td>
                    <td className="px-4 py-3 font-mono text-xs">{a.Asset_Tag__c}</td>
                    <td className="px-4 py-3">{a.Type__c}</td>
                    <td className="px-4 py-3 font-mono text-xs">{a.Serial_Number__c || "—"}</td>
                    <td className="px-4 py-3">{a.Assigned_To__r?.Name || "—"}</td>
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor(a.Status__c)}`}>{a.Status__c}</span></td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">No assets found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
