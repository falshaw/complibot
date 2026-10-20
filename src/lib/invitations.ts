/**
 * CompliBot - team invitations without email
 *
 * An admin creates an invitation; the app shows the join link once and the
 * admin passes it on. Only the SHA-256 of the token is stored, so the link
 * cannot be read back from the database. A link works once and expires
 * after INVITE_TTL_DAYS.
 */

import { createHash, randomBytes } from "crypto";

export const INVITE_TTL_DAYS = 7;

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function newInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

export function inviteExpiry(now = Date.now()): Date {
  return new Date(now + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/** Tokens are 43 base64url characters; anything else is rejected before a lookup. */
export function isWellFormedToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function joinUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/join?token=${encodeURIComponent(token)}`;
}

/** Why an invitation cannot be used, or null when it can. */
export function invitationProblem(
  inv: { acceptedAt: Date | null; expiresAt: Date } | null,
  now = new Date(),
): "invalid" | "used" | "expired" | null {
  if (!inv) return "invalid";
  if (inv.acceptedAt) return "used";
  if (inv.expiresAt <= now) return "expired";
  return null;
}

export const INVITATION_MESSAGES = {
  invalid: "This invitation link is not valid. Ask your administrator for a new one.",
  used: "This invitation link has already been used. Sign in, or ask your administrator for a new link.",
  expired: "This invitation link has expired. Ask your administrator for a new one.",
} as const;
