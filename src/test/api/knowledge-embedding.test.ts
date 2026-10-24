import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Entries written in the UI are embedded at once, so semantic search finds
 * them without re-running complibot-init; a changed entry is re-embedded,
 * a verify click is not.
 */

const { db, refresh } = vi.hoisted(() => ({
  refresh: vi.fn(async () => {}),
  db: {
    knowledgeEntry: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ default: db, prisma: db }));
vi.mock("@/lib/session", () => ({
  getSession: vi.fn(async () => ({
    user: { id: "u-1", role: "ADMIN", organizationId: "org-1", email: "a@x.test" },
  })),
}));
vi.mock("@/lib/rateLimit", () => ({
  applyRateLimit: vi.fn(async () => null),
  RATE_LIMITS: { api: {}, read: {}, ai: {}, upload: {}, expensive: {} },
}));
vi.mock("@/lib/services/EmbeddingService", () => ({ refreshEntryEmbedding: refresh }));

import { POST } from "@/app/api/knowledge/route";
import { PATCH } from "@/app/api/knowledge/[id]/route";

const OLD = { id: "k-1", question: "Encryption at rest?", answer: "AES-256.", organizationId: "org-1" };
const send = (method: string, body: unknown) =>
  new NextRequest("http://localhost/api/knowledge/k-1", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const ctx = { params: Promise.resolve({ id: "k-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  db.knowledgeEntry.findFirst.mockResolvedValue(OLD);
  db.knowledgeEntry.update.mockImplementation(async ({ data }) => ({ ...OLD, ...data }));
});

describe("knowledge embeddings", () => {
  it("embeds a new entry", async () => {
    db.knowledgeEntry.create.mockImplementation(async ({ data }) => ({ id: "k-2", ...data }));

    const res = await POST(
      send("POST", { question: "How long are logs kept?", answer: "Logs are kept for 12 months.", domain: "LOGGING_MONITORING" }),
    );

    expect(res.status).toBe(201);
    expect(refresh).toHaveBeenCalledWith("k-2", "How long are logs kept?", "Logs are kept for 12 months.");
  });

  it("re-embeds an entry whose text changed", async () => {
    await PATCH(send("PATCH", { answer: "AES-256 with keys in a KMS." }), ctx);

    expect(refresh).toHaveBeenCalledWith("k-1", OLD.question, "AES-256 with keys in a KMS.", { changed: true });
  });

  it("leaves the vector alone when only the verified flag changes", async () => {
    await PATCH(send("PATCH", { isVerified: true }), ctx);

    expect(refresh).not.toHaveBeenCalled();
  });
});
