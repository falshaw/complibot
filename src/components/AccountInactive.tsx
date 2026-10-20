"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { LogoMark, WordMark } from "@/components/AppBackground";

/** Shown instead of the app when a still-valid sign-in belongs to a removed member. */
export function AccountInactive() {
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <section className="glass w-full max-w-[380px] !rounded-3xl px-7 py-[30px]" aria-labelledby="inactive-title">
        <div className="mb-6 flex items-center gap-2.5 text-base font-bold">
          <LogoMark size={34} />
          <WordMark />
        </div>
        <h1 id="inactive-title" className="!text-[22px]">
          Account removed
        </h1>
        <p className="mt-2 text-[13.5px] text-ink-65">
          An administrator removed this account from the team, so it can no longer use CompliBot. Ask them to
          reactivate it if this is a mistake.
        </p>
        <button
          type="button"
          className="btn btn-primary mt-6 w-full"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="h-4 w-4" aria-hidden /> Sign out
        </button>
      </section>
    </main>
  );
}
