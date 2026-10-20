import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Team invitations without email: admin creates an invitation and gets a
 * one-time join link; the invitee opens /join, sets a password and the
 * account exists. Tokens are stored hashed, expire and work once.
 */

const { db, session } = vi.hoisted(() => {
  const db = {
    user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    organizationInvitation: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  return {
    db,
    session: { user: { id: "admin-1", role: "ADMIN", organizationId: "org-1", email: "admin@demo.com" } },
  };
});

vi.mock("@/lib/prisma", () => ({ default: db, prisma: db }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn(async () => session) }));
vi.mock("@/lib/rateLimit", () => ({
  applyRateLimit: vi.fn(async () => null),
  RATE_LIMITS: { api: {}, auth: {}, read: {}, ai: {}, upload: {}, expensive: {} },
}));
// bcrypt with 12 rounds is slow by design; the route only has to store its output.
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async (pw: string) => `bcrypt(${pw})`) } }));

import { POST as invitePOST } from "@/app/api/team/invite/route";
import { GET as joinGET, POST as joinPOST } from "@/app/api/invite/route";
import { PUT as membersPUT } from "@/app/api/team/members/route";
import { hashInviteToken, newInviteToken } from "@/lib/invitations";

const json = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost:3105${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const DAY = 24 * 60 * 60 * 1000;
const { token: TOKEN, tokenHash: TOKEN_HASH } = newInviteToken();
const openInvite = (over: Record<string, unknown> = {}) => ({
  id: "inv-1",
  organizationId: "org-1",
  email: "new.person@demo.com",
  role: "REVIEWER",
  token: TOKEN_HASH,
  acceptedAt: null,
  expiresAt: new Date(Date.now() + 6 * DAY),
  organization: { name: "Demo Company" },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_URL = "http://localhost:3105";
});

describe("admin creates an invitation", () => {
  it("returns a one-time join link and stores only the token's hash", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.organizationInvitation.findUnique.mockResolvedValue(null);
    db.organizationInvitation.create.mockImplementation(async ({ data }) => ({
      id: "inv-1",
      email: data.email,
      role: data.role,
      expiresAt: data.expiresAt,
    }));

    const res = await invitePOST(json("/api/team/invite", "POST", { email: " New.Person@Demo.com ", role: "REVIEWER" }));

    expect(res.status).toBe(201);
    const body = await res.json();
    const url = new URL(body.inviteUrl);
    expect(url.origin + url.pathname).toBe("http://localhost:3105/join");
    const token = url.searchParams.get("token")!;
    const stored = db.organizationInvitation.create.mock.calls[0][0].data;
    expect(stored.email).toBe("new.person@demo.com");
    expect(stored.token).toBe(hashInviteToken(token));
    expect(stored.token).not.toBe(token);
    const days = (new Date(stored.expiresAt).getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe("team.invite");
  });

  it("refuses an email that already has an account, and points to Reactivate for removed members", async () => {
    db.user.findUnique.mockResolvedValueOnce({ organizationId: "org-1", isActive: true });
    const active = await invitePOST(json("/api/team/invite", "POST", { email: "admin@demo.com" }));
    expect(active.status).toBe(409);

    db.user.findUnique.mockResolvedValueOnce({ organizationId: "org-1", isActive: false });
    const removed = await invitePOST(json("/api/team/invite", "POST", { email: "reviewer@demo.com" }));
    expect(removed.status).toBe(409);
    expect((await removed.json()).error).toMatch(/Reactivate/);
    expect(db.organizationInvitation.create).not.toHaveBeenCalled();
  });

  it("refuses a second open invitation but replaces an expired one", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.organizationInvitation.findUnique.mockResolvedValueOnce(openInvite());
    const open = await invitePOST(json("/api/team/invite", "POST", { email: "new.person@demo.com" }));
    expect(open.status).toBe(409);

    db.organizationInvitation.findUnique.mockResolvedValueOnce(openInvite({ expiresAt: new Date(Date.now() - DAY) }));
    db.organizationInvitation.create.mockResolvedValue({ id: "inv-2", email: "new.person@demo.com", role: "RESPONDER", expiresAt: new Date() });
    const replaced = await invitePOST(json("/api/team/invite", "POST", { email: "new.person@demo.com" }));
    expect(replaced.status).toBe(201);
    expect(db.organizationInvitation.delete).toHaveBeenCalledWith({ where: { id: "inv-1" } });
  });
});

describe("invitee opens the join link", () => {
  it("shows who the invitation is for", async () => {
    db.organizationInvitation.findUnique.mockResolvedValue(openInvite());

    const res = await joinGET(json(`/api/invite?token=${TOKEN}`, "GET"));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ valid: true, email: "new.person@demo.com", role: "REVIEWER", organizationName: "Demo Company" });
    expect(db.organizationInvitation.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { token: TOKEN_HASH } }),
    );
  });

  it("reports malformed, unknown, expired and used links as not valid, with the reason", async () => {
    const reason = async (url: string) => {
      const res = await joinGET(json(url, "GET"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.valid).toBe(false);
      expect(body).not.toHaveProperty("email");
      return body.reason;
    };

    expect(await reason("/api/invite?token=abc")).toBe("invalid");
    expect(db.organizationInvitation.findUnique).not.toHaveBeenCalled();

    db.organizationInvitation.findUnique.mockResolvedValueOnce(null);
    expect(await reason(`/api/invite?token=${TOKEN}`)).toBe("invalid");

    db.organizationInvitation.findUnique.mockResolvedValueOnce(openInvite({ expiresAt: new Date(Date.now() - 1000) }));
    expect(await reason(`/api/invite?token=${TOKEN}`)).toBe("expired");

    db.organizationInvitation.findUnique.mockResolvedValueOnce(openInvite({ acceptedAt: new Date() }));
    expect(await reason(`/api/invite?token=${TOKEN}`)).toBe("used");
  });
});

describe("invitee sets a password", () => {
  const accept = (password = "Join-Passw0rd!2026") =>
    joinPOST(json("/api/invite", "POST", { token: TOKEN, name: "New Person", password }));

  it("creates an active account with the hashed password and the invited role", async () => {
    db.organizationInvitation.findUnique.mockResolvedValue(openInvite());
    db.user.findUnique.mockResolvedValue(null);
    db.organizationInvitation.updateMany.mockResolvedValue({ count: 1 });
    db.user.create.mockImplementation(async ({ data }) => ({ id: "user-9", email: data.email }));

    const res = await accept();

    expect(res.status).toBe(201);
    const claim = db.organizationInvitation.updateMany.mock.calls[0][0];
    expect(claim.where).toMatchObject({ id: "inv-1", acceptedAt: null });
    expect(claim.where.expiresAt.gt).toBeInstanceOf(Date);
    expect(db.user.create.mock.calls[0][0].data).toMatchObject({
      email: "new.person@demo.com",
      name: "New Person",
      passwordHash: "bcrypt(Join-Passw0rd!2026)",
      role: "REVIEWER",
      organizationId: "org-1",
      isActive: true,
    });
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: "team.join", userId: "user-9" });
  });

  it("works once: a link claimed in the meantime creates nothing", async () => {
    db.organizationInvitation.findUnique.mockResolvedValue(openInvite());
    db.user.findUnique.mockResolvedValue(null);
    db.organizationInvitation.updateMany.mockResolvedValue({ count: 0 });

    const res = await accept();

    expect(res.status).toBe(410);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("refuses an expired or used link before touching the account table", async () => {
    db.organizationInvitation.findUnique.mockResolvedValue(openInvite({ acceptedAt: new Date() }));
    expect((await accept()).status).toBe(410);
    db.organizationInvitation.findUnique.mockResolvedValue(openInvite({ expiresAt: new Date(Date.now() - 1) }));
    expect((await accept()).status).toBe(410);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("applies the sign-in password rules", async () => {
    db.organizationInvitation.findUnique.mockResolvedValue(openInvite());
    const short = await accept("Short!1");
    expect(short.status).toBe(400);
    const noSpecial = await accept("LongEnoughButPlain1");
    expect(noSpecial.status).toBe(400);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("does not take over an existing account with the invited email", async () => {
    db.organizationInvitation.findUnique.mockResolvedValue(openInvite());
    db.user.findUnique.mockResolvedValue({ id: "someone" });

    expect((await accept()).status).toBe(409);
    expect(db.organizationInvitation.updateMany).not.toHaveBeenCalled();
  });
});

describe("removed members", () => {
  it("can be reactivated by an admin, with its own audit entry", async () => {
    db.user.findFirst.mockResolvedValue({ id: "user-2", email: "reviewer@demo.com", isActive: false });
    db.user.update.mockResolvedValue({ id: "user-2", email: "reviewer@demo.com", isActive: true });

    const res = await membersPUT(json("/api/team/members", "PUT", { userId: "user-2", isActive: true }));

    expect(res.status).toBe(200);
    expect(db.user.update.mock.calls[0][0]).toMatchObject({ where: { id: "user-2" }, data: { isActive: true } });
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe("team.member_reactivate");
  });
});
