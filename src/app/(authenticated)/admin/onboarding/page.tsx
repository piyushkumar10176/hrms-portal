"use client";
import { useState, useEffect } from "react";

interface Template {
  Id: string;
  Name: string;
  Active__c: boolean;
  Department__r?: { Name: string };
  Designation__r?: { Name: string };
  Template_Tasks__r?: {
    records: TemplateTask[];
  };
}

interface TemplateTask {
  Id: string;
  Task_Name__c: string;
  Assignee_Role__c: string;
  Due_Days_After_Joining__c: number;
}

export default function OnboardingAdmin() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await fetch("/api/onboarding/templates");
      const data = await res.json();
      if (res.ok) setTemplates(data.templates || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Onboarding Templates</h1>
          <p className="text-gray-500 mt-1">Manage onboarding workflows for new hires</p>
        </div>
        <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors">
          + New Template
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400">Loading templates...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map(tpl => (
            <div key={tpl.Id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="p-5">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-gray-900 truncate pr-4">{tpl.Name}</h3>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${tpl.Active__c ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                    {tpl.Active__c ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="text-sm text-gray-500 space-y-1 mb-4">
                  <p>Department: {tpl.Department__r?.Name || "All"}</p>
                  <p>Designation: {tpl.Designation__r?.Name || "All"}</p>
                </div>
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Tasks ({tpl.Template_Tasks__r?.records?.length || 0})</p>
                  <ul className="space-y-2">
                    {tpl.Template_Tasks__r?.records?.slice(0, 3).map(task => (
                      <li key={task.Id} className="text-sm text-gray-700 flex justify-between items-center">
                        <span className="truncate">{task.Task_Name__c}</span>
                        <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-500 shrink-0">{task.Assignee_Role__c}</span>
                      </li>
                    ))}
                    {(tpl.Template_Tasks__r?.records?.length || 0) > 3 && (
                      <li className="text-xs text-indigo-600 font-medium">+ {(tpl.Template_Tasks__r?.records?.length || 0) - 3} more tasks</li>
                    )}
                  </ul>
                </div>
              </div>
              <div className="bg-gray-50 px-5 py-3 border-t border-gray-200">
                <button className="text-sm text-indigo-600 font-medium hover:text-indigo-800">Edit Template</button>
              </div>
            </div>
          ))}
          {templates.length === 0 && (
            <div className="col-span-full bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center">
              <p className="text-gray-500">No onboarding templates found. Create one to get started.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
