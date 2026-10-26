"use client";

/**
 * The signed-in member's role as the database has it now (the dashboard layout
 * reads it through getSession), so a role change shows in the pages at once
 * instead of at the next sign-in. The sign-in token's role can be stale.
 */

import { createContext, useContext } from "react";
import { can, type Permission } from "@/lib/permissions";

const RoleContext = createContext<string | null>(null);

export function RoleProvider({ role, children }: { role: string; children: React.ReactNode }) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

export function useRole(): string | null {
  return useContext(RoleContext);
}

export function useCan(permission: Permission): boolean {
  return can(useRole(), permission);
}

const WHO: Record<Permission, string> = {
  draft: "admins, reviewers and responders",
  review: "admins and reviewers",
  knowledge: "admins and reviewers",
  admin: "admins",
};

/** Shown instead of a form the signed-in role cannot submit. */
export function ReadOnlyNote({ permission, what }: { permission: Permission; what: string }) {
  const role = useRole();
  return (
    <div className="card p-5 text-[13.5px] text-ink-65" role="note">
      Only {WHO[permission]} can {what}. You are signed in as{" "}
      <b className="text-ink">{role ? role.charAt(0) + role.slice(1).toLowerCase() : "a member"}</b>.
    </div>
  );
}
