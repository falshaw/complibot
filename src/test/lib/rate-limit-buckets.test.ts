import { describe, it, expect, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

/**
 * Each rate limit counts in its own bucket. With one shared counter, five
 * ordinary API calls in a minute used up the upload limit (5/min) and the
 * knowledge-base import answered 429.
 */

const { applyRateLimit, LIMITS } = vi.hoisted(() => ({
  applyRateLimit: vi.fn(async () => null),
  LIMITS: {
    api: { interval: 60000, limit: 100 },
    upload: { interval: 60000, limit: 5 },
    ai: { interval: 60000, limit: 20 },
  },
}));
vi.mock("@/lib/rateLimit", () => ({ applyRateLimit, RATE_LIMITS: LIMITS }));
vi.mock("@/lib/session", () => ({
  getSession: vi.fn(async () => ({ user: { id: "u-1", role: "ADMIN", organizationId: "org-1" } })),
}));

import { apiHandler } from "@/lib/apiHandler";

const ok = async () => NextResponse.json({});
const req = () => new NextRequest("http://localhost/api/x", { method: "POST" });

describe("rate-limit buckets", () => {
  it("names the bucket after the limit unless a prefix is given", async () => {
    await apiHandler(ok)(req());
    await apiHandler(ok, { rateLimit: LIMITS.upload })(req());
    await apiHandler(ok, { rateLimit: LIMITS.ai })(req());
    await apiHandler(ok, { rateLimit: LIMITS.upload, rateLimitPrefix: "invite" })(req());

    expect(applyRateLimit.mock.calls.map((c) => (c as unknown[])[2])).toEqual(["api", "upload", "ai", "invite"]);
  });
});
