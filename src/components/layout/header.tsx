"use client";

import React, { useEffect, useState } from "react";
import { Bell, Search, LogOut, ChevronDown, CheckCircle2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { signOut, useSession } from "next-auth/react";

interface Notification {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export function Header() {
  const { data: session } = useSession();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    if (session) {
      fetch("/api/notifications")
        .then(r => r.json())
        .then(d => {
          setNotifications(d.notifications || []);
          setUnreadCount(d.unreadCount || 0);
        })
        .catch(() => {});
    }
  }, [session]);

  const markAllRead = async () => {
    if (unreadCount === 0) return;
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markAllRead" })
      });
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (e) {}
  };

  const userInitials = session?.user?.name
    ? session.user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  return (
    <header className="sticky top-0 z-40 flex items-center h-16 px-6 bg-[#3b3469] border-b border-[#2c2759]">
      <div className="flex items-center gap-6 mr-6">
        <span className="text-white font-semibold tracking-wide">CLOUDSHEER</span>
      </div>

      {/* Search */}
      <div className="flex items-center flex-1">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search employees or actions (Ex: Apply Leave)"
            className="w-full h-9 pl-10 pr-4 text-sm bg-white border-none rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-4 text-white">
        {/* Notifications */}
        <div className="relative">
          <Button 
            variant="ghost" 
            size="icon" 
            className="relative hover:bg-[#2c2759]"
            onClick={() => {
              setShowDropdown(!showDropdown);
              if (!showDropdown) markAllRead();
            }}
          >
            <Bell className="w-5 h-5 text-white" />
            {unreadCount > 0 && (
              <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px]" variant="destructive">
                {unreadCount}
              </Badge>
            )}
          </Button>

          {showDropdown && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-50 text-left">
              <div className="px-4 py-2 border-b border-gray-100 flex justify-between items-center">
                <h3 className="font-semibold text-gray-900">Notifications</h3>
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-6">No notifications</p>
                ) : (
                  notifications.map(n => (
                    <div key={n.id} className={`px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${!n.read ? 'bg-indigo-50/30' : ''}`}>
                      <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5 text-indigo-600">
                          <Bell className="w-4 h-4" />
                        </div>
                        <div>
                          <p className={`text-sm ${!n.read ? 'font-semibold text-gray-900' : 'text-gray-800'}`}>{n.body}</p>
                          <p className="text-xs text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString("en-IN")}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Menu */}
        <div className="flex items-center gap-3 pl-4">
          <Avatar className="h-8 w-8">
            <AvatarImage src={session?.user?.image || undefined} alt={session?.user?.name || "User"} />
            <AvatarFallback className="text-xs text-indigo-700 font-bold bg-indigo-100">{userInitials}</AvatarFallback>
          </Avatar>
        </div>

        {/* Logout */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => signOut({ callbackUrl: "/login" })}
          title="Sign out"
          className="hover:bg-[#2c2759]"
        >
          <LogOut className="w-4 h-4 text-white" />
        </Button>
      </div>
    </header>
  );
}
