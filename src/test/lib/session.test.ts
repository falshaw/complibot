import { describe, it, expect, vi, beforeEach } from "vitest";

/** getSession re-checks the signed-in user in the database on every call. */

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { user: { findUnique } } }));
// @/lib/auth is mocked in src/test/setup.ts: a signed-in ADMIN, test-user-id.

import { getSession } from "@/lib/session";

beforeEach(() => findUnique.mockReset());

describe("getSession", () => {
  it("returns no session for a member who was removed after signing in", async () => {
    findUnique.mockResolvedValue({ isActive: false, role: "ADMIN", organizationId: "test-org-id" });
    expect(await getSession()).toBeNull();
  });

  it("returns no session when the user no longer exists", async () => {
    findUnique.mockResolvedValue(null);
    expect(await getSession()).toBeNull();
  });

  it("uses the role from the database, not the one in the sign-in token", async () => {
    findUnique.mockResolvedValue({ isActive: true, role: "VIEWER", organizationId: "test-org-id" });
    const session = await getSession();
    expect(session?.user).toMatchObject({ id: "test-user-id", role: "VIEWER", organizationId: "test-org-id" });
  });
});
