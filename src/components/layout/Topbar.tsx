"use client";

import { useSession, signOut } from "next-auth/react";
import { LogOut, User } from "lucide-react";

export function Topbar() {
  const { data: session } = useSession();

  return (
    <header className="h-14 bg-[#0f172a] border-b border-slate-800 flex items-center justify-between px-6">
      <div />
      <div className="flex items-center gap-4">
        {session?.user && (
          <>
            <div className="flex items-center gap-2 text-sm">
              <User className="w-4 h-4 text-slate-500" />
              <span className="text-slate-300">
                {session.user.name || session.user.email}
              </span>
              <span className="text-xs text-slate-600 bg-slate-800 px-2 py-0.5 rounded">
                {session.user.organizationName}
              </span>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-slate-500 hover:text-slate-300 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
