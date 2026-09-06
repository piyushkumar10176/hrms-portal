"use client";

import { useSession, signOut } from "next-auth/react";
import {usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Search, Bell } from "lucide-react";
import Link from "next/link";

const NAV_ITEMS = [
  { label: "Home", href: "/dashboard", icon: "🏠", roles: ["admin", "employee"] },
  { label: "Me", href: "/profile", icon: "👤", roles: ["admin", "employee"],
    subMenu: [
      { label: "Attendance", href: "/attendance" },
      { label: "Leave", href: "/leave" },
      { label: "Clock In/Out", href: "/attendance/clock" },
      { label: "Holidays", href: "/holidays" },
      { label: "Profile", href: "/profile" },
    ]
  },
  { label: "Inbox", href: "/approvals", icon: "📥", roles: ["admin", "employee"] },
  { label: "My Team", href: "/admin/employees", icon: "👥", roles: ["admin", "employee"] },
  { label: "My Finances", href: "/payroll", icon: "💰", roles: ["admin", "employee"] },
  { label: "Org", href: "/organisation", icon: "🏢", roles: ["admin", "employee"] },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hoveredMenu, setHoveredMenu] = useState<string | null>(null);
  
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

  const userInitials = session?.user?.name
    ? session.user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile overlay */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-50 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar - Keka Style */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-[90px] flex flex-col items-center bg-[#2c2759] text-gray-300 transform transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="flex flex-col items-center py-4 border-b border-[#3b3469] w-full">
          <div className="text-2xl font-bold text-white tracking-tight">HRMS</div>
        </div>

        <nav className="flex-1 py-4 flex flex-col gap-2 items-center w-full overflow-visible">
          {filteredNav.map(item => {
            const isActive = pathname === item.href || (item.subMenu && item.subMenu.some(sub => pathname.startsWith(sub.href)));
            return (
              <div 
                key={item.label} 
                className="relative group w-full flex justify-center"
                onMouseEnter={() => setHoveredMenu(item.label)}
                onMouseLeave={() => setHoveredMenu(null)}
              >
                <Link
                  href={item.subMenu ? item.subMenu[0].href : item.href}
                  className={`flex flex-col items-center justify-center p-2 rounded-lg text-[11px] font-medium transition-all duration-200 w-[84px] h-[72px] text-center ${
                    isActive ? "text-white bg-[#1e1a42]" : "text-gray-400 hover:text-white hover:bg-[#3b3469]"
                  }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <span className="text-xl mb-1">{item.icon}</span>
                  <span className="leading-tight">{item.label}</span>
                </Link>
                
                {/* Flyout Menu for "Me" */}
                {item.subMenu && hoveredMenu === item.label && (
                  <div className="absolute left-full top-0 ml-1 w-48 bg-[#1e1a42] text-white rounded-md shadow-xl py-2 z-50 hidden lg:block">
                    {item.subMenu.map(sub => (
                      <Link
                        key={sub.label}
                        href={sub.href}
                        className={`block px-4 py-2 text-sm hover:bg-[#3b3469] hover:text-white ${pathname === sub.href ? "bg-[#3b3469] text-white" : "text-gray-300"}`}
                      >
                        {sub.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar - Keka Style */}
        <header className="h-16 bg-[#3b3469] border-b border-[#2c2759] flex items-center justify-between px-4 lg:px-6 sticky top-0 z-40">
          <div className="flex items-center gap-6">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 text-white hover:bg-[#2c2759] rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <span className="text-white font-semibold tracking-wide hidden sm:block">HRMS Portal</span>
          </div>

          <div className="flex-1 max-w-md mx-6 hidden md:block">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search employees or actions (Ex: Apply Leave)"
                className="w-full h-9 pl-10 pr-4 text-sm bg-white border-none rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all placeholder:text-gray-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 text-white">
            {/* Notifications */}
            <div className="relative">
              <button onClick={() => setShowNotif(!showNotif)} className="relative p-2 hover:bg-[#2c2759] rounded-full transition-colors">
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{unreadCount}</span>
                )}
              </button>

              {showNotif && (
                <div className="absolute right-0 top-12 w-80 bg-white rounded-xl border border-gray-200 shadow-xl z-50 text-gray-900">
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

            <div className="flex items-center gap-2 border-l border-[#52498e] pl-4 relative group cursor-pointer">
              <div className="hidden md:block text-right mr-2">
                <p className="text-xs font-semibold">{session?.user?.name}</p>
                <div className="flex gap-2 justify-end mt-0.5">
                  <Link href="/profile" className="text-[10px] text-gray-300 hover:text-white hover:underline">Profile</Link>
                  <button onClick={() => signOut({ callbackUrl: "/login" })} className="text-[10px] text-gray-300 hover:text-white hover:underline">Sign Out</button>
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-bold text-indigo-700">
                {userInitials}
              </div>
            </div>
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
