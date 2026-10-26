import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Login lockout an admin can see and lift, and the account page every role
 * uses to change its own name and password.
 */

const { db, redis, session } = vi.hoisted(() => {
  const store = new Map<string, string>();
  const redis = {
    store,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    mget: vi.fn(async (...ks: string[]) => ks.map((k) => store.get(k) ?? null)),
    incr: vi.fn(async (k: string) => {
      const n = Number(store.get(k) ?? 0) + 1;
      store.set(k, String(n));
      return n;
    }),
    expire: vi.fn(async () => 1),
    del: vi.fn(async (k: string) => Number(store.delete(k))),
  };
  const db = {
    user: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    db,
    redis,
    session: { user: { id: "admin-1", role: "ADMIN", organizationId: "org-1", email: "admin@demo.com" } },
  };
});

vi.mock("@/lib/prisma", () => ({ default: db, prisma: db }));
vi.mock("@/lib/cache", () => ({ getRedisClient: () => redis }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn(async () => session) }));
vi.mock("@/lib/rateLimit", () => ({
  applyRateLimit: vi.fn(async () => null),
  RATE_LIMITS: { api: {}, auth: {}, read: {}, ai: {}, upload: {}, expensive: {} },
}));
vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(async (pw: string, hash: string) => hash === `bcrypt(${pw})`),
    hash: vi.fn(async (pw: string) => `bcrypt(${pw})`),
  },
}));

import { isLockedOut, lockedEmails, recordFailedLogin, LOCKOUT_MAX_ATTEMPTS } from "@/lib/lockout";
import { GET as membersGET, PUT as membersPUT } from "@/app/api/team/members/route";
import { PATCH as accountPATCH } from "@/app/api/account/route";

const json = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost:3105${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  redis.store.clear();
  session.user.role = "ADMIN";
});

describe("login lockout", () => {
  it("locks an address after five failures, whatever its case", async () => {
    for (let i = 0; i < LOCKOUT_MAX_ATTEMPTS - 1; i++) await recordFailedLogin("Reviewer@Demo.com");
    expect(await isLockedOut("reviewer@demo.com")).toBe(false);
    await recordFailedLogin("reviewer@demo.com");
    expect(await isLockedOut("REVIEWER@demo.com")).toBe(true);
    expect([...(await lockedEmails(["reviewer@demo.com", "admin@demo.com"]))]).toEqual(["reviewer@demo.com"]);
  });

  it("shows on the team list and an admin can lift it", async () => {
    for (let i = 0; i < LOCKOUT_MAX_ATTEMPTS; i++) await recordFailedLogin("reviewer@demo.com");
    db.user.findMany.mockResolvedValue([
      { id: "u-2", email: "reviewer@demo.com", role: "REVIEWER", isActive: true },
      { id: "admin-1", email: "admin@demo.com", role: "ADMIN", isActive: true },
    ]);
    const list = await (await membersGET(json("/api/team/members", "GET"))).json();
    expect(list.map((m: { locked: boolean }) => m.locked)).toEqual([true, false]);

    db.user.findFirst.mockResolvedValue({ id: "u-2", email: "reviewer@demo.com", isActive: true });
    const res = await membersPUT(json("/api/team/members", "PUT", { userId: "u-2", unlock: true }));
    expect(res.status).toBe(200);
    expect(await isLockedOut("reviewer@demo.com")).toBe(false);
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe("team.member_unlock");
  });

  it("an admin may unlock themselves but still not change their own role", async () => {
    db.user.findFirst.mockResolvedValue({ id: "admin-1", email: "admin@demo.com", isActive: true });
    expect((await membersPUT(json("/api/team/members", "PUT", { userId: "admin-1", unlock: true }))).status).toBe(200);
    expect((await membersPUT(json("/api/team/members", "PUT", { userId: "admin-1", role: "VIEWER" }))).status).toBe(400);
  });
});

describe("your account", () => {
  it("any role can rename itself", async () => {
    session.user.role = "VIEWER";
    const res = await accountPATCH(json("/api/account", "PATCH", { name: "  Vera Viewer " }));
    expect(res.status).toBe(200);
    expect(db.user.update.mock.calls[0][0]).toEqual({ where: { id: "admin-1" }, data: { name: "Vera Viewer" } });
  });

  it("a password change needs the current password and the password rule", async () => {
    db.user.findUnique.mockResolvedValue({ passwordHash: "bcrypt(old-password-123!)" });

    const wrong = await accountPATCH(
      json("/api/account", "PATCH", { currentPassword: "guess", newPassword: "new-password-456!" }),
    );
    expect(wrong.status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();

    const weak = await accountPATCH(
      json("/api/account", "PATCH", { currentPassword: "old-password-123!", newPassword: "short" }),
    );
    expect(weak.status).toBe(400);

    const ok = await accountPATCH(
      json("/api/account", "PATCH", { currentPassword: "old-password-123!", newPassword: "new-password-456!" }),
    );
    expect(ok.status).toBe(200);
    expect(db.user.update.mock.calls[0][0].data).toEqual({ passwordHash: "bcrypt(new-password-456!)" });
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe("account.password_change");
  });
});
