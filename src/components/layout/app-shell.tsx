"use client";

import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: "📊", roles: ["admin", "employee"] },
  { label: "Clock In/Out", href: "/attendance/clock", icon: "🕐", roles: ["admin", "employee"] },
  { label: "Attendance", href: "/attendance", icon: "📅", roles: ["admin", "employee"] },
  { label: "Leave", href: "/leave", icon: "🏖️", roles: ["admin", "employee"] },
  { label: "Payroll", href: "/payroll", icon: "💰", roles: ["admin", "employee"] },
  { label: "Organisation", href: "/organisation", icon: "🏗️", roles: ["admin", "employee"] },
  { label: "Profile", href: "/profile", icon: "👤", roles: ["admin", "employee"] },
  { label: "Approvals", href: "/approvals", icon: "✅", roles: ["admin"] },
  { label: "Salary", href: "/admin/salary", icon: "💵", roles: ["admin"] },
  { label: "Employees", href: "/admin/employees", icon: "👥", roles: ["admin"] },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotif, setShowNotif] = useState(false);
  const [notifications, setNotifications] = useState<{ id: string; title: string; body: string; read: boolean; createdAt: string; }[]>([]);

  const role = (session?.user?.role || "employee") as string;
  const filteredNav = NAV_ITEMS.filter(n => n.roles.includes(role));

  useEffect(() => {
    fetch("/api/notifications").then(r => r.json()).then(d => {
      setUnreadCount(d.unreadCount || 0);
      setNotifications(d.notifications || []);
    }).catch(() => {});
  }, []);

  const markAllRead = async () => {
    await fetch("/api/notifications", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "markAllRead" }),
    });
    setUnreadCount(0);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile overlay */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="h-16 flex items-center gap-3 px-6 border-b border-gray-200">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">H</div>
            <div>
              <p className="font-bold text-gray-900 text-sm">HRMS Portal</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">
                {role === "admin" ? "Admin Panel" : "Employee Portal"}
              </p>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
            {role === "admin" && (
              <p className="px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Main</p>
            )}
            {filteredNav.filter(n => !n.href.startsWith("/admin")).map(item => (
              <button key={item.href} onClick={() => { router.push(item.href); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  pathname === item.href ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-600 hover:bg-gray-100"
                }`}>
                <span className="text-lg">{item.icon}</span>
                <span>{item.label}</span>
                {item.label === "Approvals" && unreadCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">{unreadCount}</span>
                )}
              </button>
            ))}

            {role === "admin" && (
              <>
                <p className="px-3 pt-4 pb-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Admin</p>
                {filteredNav.filter(n => n.href.startsWith("/admin")).map(item => (
                  <button key={item.href + "-admin"} onClick={() => { router.push(item.href); setSidebarOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      pathname === item.href ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-600 hover:bg-gray-100"
                    }`}>
                    <span className="text-lg">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </>
            )}
          </nav>

          {/* User */}
          <div className="border-t border-gray-200 p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-bold text-indigo-600">
                {session?.user?.name?.[0] || "?"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{session?.user?.name}</p>
                <p className="text-[11px] text-gray-400 truncate">{session?.user?.email}</p>
              </div>
            </div>
            <button onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full text-left text-sm text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors">
              ↩ Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-20">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 hover:bg-gray-100 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>

          <div className="hidden lg:block">
            <h2 className="text-sm font-medium text-gray-900">
              {filteredNav.find(n => n.href === pathname)?.label || "HRMS"}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            {/* Notifications */}
            <div className="relative">
              <button onClick={() => setShowNotif(!showNotif)} className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors">
                🔔
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{unreadCount}</span>
                )}
              </button>

              {showNotif && (
                <div className="absolute right-0 top-12 w-80 bg-white rounded-xl border border-gray-200 shadow-xl z-50">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <span className="font-semibold text-sm">Notifications</span>
                    {unreadCount > 0 && <button onClick={markAllRead} className="text-xs text-indigo-600 hover:underline">Mark all read</button>}
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="text-center py-8 text-gray-400 text-sm">No notifications</p>
                    ) : notifications.slice(0, 8).map(n => (
                      <div key={n.id} className={`px-4 py-3 border-b border-gray-50 hover:bg-gray-50 ${!n.read ? "bg-indigo-50/50" : ""}`}>
                        <p className="text-sm font-medium text-gray-900">{n.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>
                        <p className="text-[10px] text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString("en-IN")}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <span className={`px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${role === "admin" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-500"}`}>
              {role}
            </span>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
