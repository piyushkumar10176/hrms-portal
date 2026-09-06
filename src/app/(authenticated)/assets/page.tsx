"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

interface Asset {
  Id: string; Name: string; Asset_Tag__c: string; Type__c: string;
  Status__c: string; Serial_Number__c?: string; Purchase_Date__c?: string; Purchase_Value__c?: number;
}

export default function AssetsPage() {
  const { data: session } = useSession();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!session) return;
    // `ignore` discards a response that arrives after the effect was cleaned
    // up or superseded, which otherwise sets state on an unmounted component
    // and can apply an older response over a newer one.
    let ignore = false;
    (async () => {
      try {
        const res = await fetch("/api/assets");
        const data = await res.json();
        if (!ignore && res.ok) setAssets(data.assets || []);
      } catch (err) {
        if (!ignore) console.error(err);
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, [session]);

  const typeIcon = (t: string) => {
    if (t === "Laptop") return "💻";
    if (t === "Mobile") return "📱";
    if (t === "Monitor") return "🖥️";
    if (t === "Headset") return "🎧";
    if (t === "Access Card") return "🪪";
    return "📦";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Assets</h1>
        <p className="text-gray-500 mt-1">Company assets assigned to you</p>
      </div>

      {loading ? <div className="text-center py-10 text-gray-400">Loading...</div> :
        assets.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {assets.map(a => (
              <div key={a.Id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-2xl">{typeIcon(a.Type__c)}</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{a.Name}</h3>
                    <p className="text-sm text-gray-500">{a.Type__c} • {a.Asset_Tag__c}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${a.Status__c === "Assigned" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                    {a.Status__c}
                  </span>
                </div>
                <div className="text-sm text-gray-600 space-y-1 border-t border-gray-100 pt-3">
                  {a.Serial_Number__c && <p>Serial: <span className="font-mono text-xs">{a.Serial_Number__c}</span></p>}
                  {a.Purchase_Date__c && <p>Since: {new Date(a.Purchase_Date__c).toLocaleDateString("en-IN")}</p>}
                </div>
              </div>
            ))}
          </div>
        ) : <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center text-gray-500">No assets assigned to you.</div>
      }
    </div>
  );
}
