/**
 * CompliBot - who may do what
 *
 * Every role can read. Writes are grouped by job:
 *  - DRAFT:  work on questionnaires and their drafts (upload, parse, generate,
 *            edit, regenerate, export, templates)
 *  - REVIEW: decide on drafts (approve, reject, bulk approve)
 *  - KNOWLEDGE: change what answers are drawn from (entries, sources, interview)
 *  - ADMIN:  delete questionnaires, team and organization settings
 *
 * API routes enforce these through apiHandler's `roles`; pages use `can()` to
 * hide what the signed-in role cannot do.
 */

import type { Role } from "@prisma/client";

export const PERMISSIONS = {
  draft: ["ADMIN", "REVIEWER", "RESPONDER"],
  review: ["ADMIN", "REVIEWER"],
  knowledge: ["ADMIN", "REVIEWER"],
  admin: ["ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

/** Roles for apiHandler's `roles` option. */
export function rolesFor(permission: Permission): Role[] {
  return [...PERMISSIONS[permission]];
}

export function can(role: string | undefined | null, permission: Permission): boolean {
  return !!role && (PERMISSIONS[permission] as readonly string[]).includes(role);
}
