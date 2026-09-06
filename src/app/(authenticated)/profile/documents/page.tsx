"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

interface EmpDoc {
  Id: string;
  Document_Name__c: string;
  Document_Type__c: string;
  Verified__c: boolean;
  Expiry_Date__c?: string;
  Content_Document_Id__c?: string;
}

export default function ProfileDocuments() {
  const { data: session } = useSession();
  const [documents, setDocuments] = useState<EmpDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const employeeId = session?.user?.id;

  useEffect(() => {
    if (!employeeId) return;
    // `ignore` discards a response that arrives after the effect was cleaned
    // up or superseded, which otherwise sets state on an unmounted component
    // and can apply an older response over a newer one.
    let ignore = false;
    (async () => {
      try {
        const res = await fetch(`/api/employees/${employeeId}/documents`);
        const data = await res.json();
        if (!ignore && res.ok) setDocuments(data.documents || []);
      } catch (err) {
        if (!ignore) console.error(err);
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, [employeeId]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Documents</h1>
          <p className="text-gray-500 mt-1">Manage your employment and identity documents</p>
        </div>
        <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors">
          + Upload Document
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h3 className="font-semibold text-gray-900">Uploaded Documents</h3>
        </div>
        
        {loading ? (
          <div className="p-6 text-center text-gray-400">Loading...</div>
        ) : documents.length > 0 ? (
          <ul className="divide-y divide-gray-200">
            {documents.map(doc => (
              <li key={doc.Id} className="p-6 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{doc.Document_Name__c}</p>
                  <p className="text-sm text-gray-500">{doc.Document_Type__c}</p>
                </div>
                <div className="flex items-center gap-4">
                  {doc.Verified__c ? (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium flex items-center gap-1">
                      ✅ Verified
                    </span>
                  ) : (
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full font-medium">
                      Pending Verification
                    </span>
                  )}
                  {doc.Content_Document_Id__c && (
                    <button className="text-indigo-600 hover:text-indigo-800 text-sm font-medium">View</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-10 text-center">
            <p className="text-gray-500">No documents found. Please upload required files.</p>
          </div>
        )}
      </div>
    </div>
  );
}
