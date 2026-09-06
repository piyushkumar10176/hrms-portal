"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Home, User, Inbox, DollarSign, Building2, ChevronRight, ChevronLeft, Settings, Package } from "lucide-react";
import { useSession } from "next-auth/react";

const baseNavigation = [
  { name: "Home", href: "/dashboard", icon: Home },
  { 
    name: "Me", 
    href: "#", 
    icon: User,
    subMenu: [
      { name: "Attendance", href: "/attendance" },
      { name: "Leave", href: "/leave" },
      { name: "Regularization", href: "/regularization" },
      { name: "Expenses", href: "/expenses" },
      { name: "Profile", href: "/profile" },
      { name: "Documents", href: "/profile/documents" },
    ]
  },
  { name: "Inbox", href: "/approvals", icon: Inbox },
  { 
    name: "My Finances", 
    href: "#", 
    icon: DollarSign,
    subMenu: [
      { name: "Payslips", href: "/payroll" },
      { name: "Salary Structure", href: "/payroll?tab=structure" },
      { name: "Tax Declarations", href: "/payroll?tab=tax" },
      { name: "Loans", href: "/loans" },
    ]
  },
  { name: "Org", href: "/organisation", icon: Building2 },
  { name: "Assets", href: "/assets", icon: Package },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const [hoveredMenu, setHoveredMenu] = useState<string | null>(null);

  const isAdmin = session?.user?.role === "admin";

  const navigation = [
    ...baseNavigation,
    ...(isAdmin ? [{
      name: "Admin",
      href: "#",
      icon: Settings,
      subMenu: [
        { name: "Employees", href: "/admin/employees" },
        { name: "Departments", href: "/admin/departments" },
        { name: "Designations", href: "/admin/designations" },
        { name: "Onboarding", href: "/admin/onboarding" },
        { name: "Assets", href: "/admin/assets" },
      ]
    }] : [])
  ];

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex flex-col bg-[#2c2759] text-gray-300 transition-all duration-300 ease-in-out",
        collapsed ? "w-[68px]" : "w-[90px]"
      )}
    >
      {/* Logo */}
      <div className="flex flex-col items-center py-4 border-b border-[#3b3469]">
        <div className="text-xl font-bold text-white tracking-tight">HRMS</div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 py-4 flex flex-col gap-2 items-center overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href || 
            (item.subMenu && item.subMenu.some(sub => 
              sub.href.includes('?') ? pathname === sub.href.split('?')[0] : pathname === sub.href
            ));
          
          return (
            <div 
              key={item.name} 
              className="relative group w-full flex justify-center"
              onMouseEnter={() => setHoveredMenu(item.name)}
              onMouseLeave={() => setHoveredMenu(null)}
            >
              <Link
                href={item.subMenu ? item.subMenu[0].href : item.href}
                className={cn(
                  "flex flex-col items-center justify-center p-2 rounded-lg text-[11px] font-medium transition-all duration-200 w-16 h-16",
                  isActive
                    ? "text-white bg-[#1e1a42]"
                    : "text-gray-400 hover:text-white hover:bg-[#3b3469]"
                )}
              >
                <item.icon
                  className={cn(
                    "w-6 h-6 mb-1 transition-colors",
                    isActive ? "text-white" : "text-gray-400 group-hover:text-white"
                  )}
                />
                {!collapsed && <span>{item.name}</span>}
              </Link>
              
              {/* Flyout Menu */}
              {item.subMenu && hoveredMenu === item.name && (
                <div className="absolute left-full top-0 ml-1 w-48 bg-[#1e1a42] text-white rounded-md shadow-xl py-2 z-50">
                  {item.subMenu.map(sub => (
                    <Link
                      key={sub.name}
                      href={sub.href}
                      className={cn(
                        "block px-4 py-2 text-sm hover:bg-[#3b3469] hover:text-white",
                        pathname === sub.href ? "bg-[#3b3469] text-white" : "text-gray-300"
                      )}
                    >
                      {sub.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      
      {/* Collapse Toggle */}
      <div className="p-3 border-t border-[#3b3469] flex justify-center">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-2 rounded-lg text-gray-400 hover:bg-[#3b3469] hover:text-white transition-colors"
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>
    </aside>
  );
}
