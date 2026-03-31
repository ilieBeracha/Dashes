"use client";

import { useState } from "react";
import { LogOut, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface TopBarProps {
  user: {
    name?: string | null;
    image?: string | null;
  };
  onSearch?: (query: string) => void;
  onSignOut: () => void;
}

export function TopBar({ user, onSearch, onSignOut }: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-bg-secondary px-6">
      <div className="flex items-center gap-6">
        <h1 className="text-lg font-bold">Dashes</h1>
        {onSearch && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
            <Input
              placeholder="Search projects..."
              className="w-64 pl-9"
              onChange={(e) => onSearch(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="relative">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-bg-tertiary"
        >
          {user.image ? (
            <img
              src={user.image}
              alt={user.name ?? "User"}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-sm font-medium">
              {user.name?.[0]?.toUpperCase() ?? "U"}
            </span>
          )}
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-10 z-50 w-48 rounded-lg border border-border bg-bg-secondary py-1 shadow-lg">
            <div className="border-b border-border px-3 py-2 text-sm text-text-secondary">
              {user.name ?? "User"}
            </div>
            <button
              onClick={onSignOut}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
