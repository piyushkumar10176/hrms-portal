"use client";

import React from "react";
import { Bell, Search, LogOut, ChevronDown } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { signOut, useSession } from "next-auth/react";

export function Header() {
  const { data: session } = useSession();

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
        <Button variant="ghost" size="icon" className="relative hover:bg-[#2c2759]">
          <Bell className="w-5 h-5 text-white" />
          <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px]" variant="destructive">
            3
          </Badge>
        </Button>

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
