import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import path from "path";

/**
 * Importing the same knowledge file twice must not double the knowledge base,
 * an imported file can be deleted with its entries, and changing a verified
 * entry's text takes its verification away.
 */

const { db } = vi.hoisted(() => {
  const db = {
    knowledgeEntry: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    knowledgeSource: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    answerSource: { deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  };
  return { db };
});

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
vi.mock("@/lib/services/EmbeddingService", () => ({ refreshEntryEmbedding: vi.fn(async () => {}) }));
vi.mock("@/lib/services/AnswerGenerationService", () => ({ classifyDomain: vi.fn(async () => "GENERAL") }));

import { entryKey, ingestQuestionnaireAsKB } from "@/lib/services/QuestionnaireParserService";
import { DELETE as sourceDELETE } from "@/app/api/sources/[id]/route";
import { PATCH as entryPATCH } from "@/app/api/knowledge/[id]/route";

const SAMPLE = path.resolve(__dirname, "../../../samples/knowledge-base-import.csv");
const MAPPING = { questionCol: "A", answerCol: "B" };
const send = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  db.knowledgeEntry.create.mockImplementation(async ({ data }) => ({ id: `k-${data.question.length}`, ...data }));
});

describe("knowledge import", () => {
  it("treats case, spacing and end punctuation as the same entry", () => {
    expect(entryKey("Do you use MFA?", "Yes.")).toBe(entryKey("  do you use   mfa ", "yes"));
    expect(entryKey("Do you use MFA?", "Yes.")).not.toBe(entryKey("Do you use MFA?", "No."));
  });

  it("imports the sample once and skips every row on the second import", async () => {
    db.knowledgeEntry.findMany.mockResolvedValue([]);
    const first = await ingestQuestionnaireAsKB("src-1", SAMPLE, MAPPING, "org-1");
    expect(first).toEqual({ entriesCreated: 4, entriesSkipped: 0 });

    const stored = db.knowledgeEntry.create.mock.calls.map((c) => c[0].data);
    db.knowledgeEntry.findMany.mockResolvedValue(stored.map((d) => ({ question: d.question, answer: d.answer })));
    db.knowledgeEntry.create.mockClear();

    const second = await ingestQuestionnaireAsKB("src-2", SAMPLE, MAPPING, "org-1");
    expect(second).toEqual({ entriesCreated: 0, entriesSkipped: 4 });
    expect(db.knowledgeEntry.create).not.toHaveBeenCalled();
    expect(db.knowledgeSource.update).toHaveBeenLastCalledWith({
      where: { id: "src-2" },
      data: { status: "completed", entriesCreated: 0, entriesSkipped: 4 },
    });
  });
});

describe("deleting an imported source", () => {
  it("removes its entries, their citations and the source, and audits it", async () => {
    db.knowledgeSource.findFirst.mockResolvedValue({
      id: "src-1",
      fileName: "kb.csv",
      _count: { knowledgeEntries: 4 },
    });

    const res = await sourceDELETE(send("/api/sources/src-1", "DELETE"), {
      params: Promise.resolve({ id: "src-1" }),
    });

    expect(res.status).toBe(200);
    expect(db.answerSource.deleteMany).toHaveBeenCalledWith({ where: { knowledgeEntry: { sourceId: "src-1" } } });
    expect(db.knowledgeEntry.deleteMany).toHaveBeenCalledWith({ where: { sourceId: "src-1" } });
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: "knowledge.source_delete",
      details: { fileName: "kb.csv", entriesDeleted: 4 },
    });
  });
});

describe("verified entries", () => {
  const OLD = { id: "k-1", question: "Encryption at rest?", answer: "AES-256.", isVerified: true, organizationId: "org-1" };
  const ctx = { params: Promise.resolve({ id: "k-1" }) };

  beforeEach(() => {
    db.knowledgeEntry.findFirst.mockResolvedValue(OLD);
    db.knowledgeEntry.update.mockImplementation(async ({ data }) => ({ ...OLD, ...data }));
  });

  it("lose the verification when the answer changes", async () => {
    await entryPATCH(send("/api/knowledge/k-1", "PATCH", { question: OLD.question, answer: "AES-256 with a KMS." }), ctx);
    expect(db.knowledgeEntry.update.mock.calls[0][0].data.isVerified).toBe(false);
    expect(db.auditLog.create.mock.calls[0][0].data.details).toEqual({
      fields: ["answer"],
      verification: "reset, text changed",
    });
  });

  it("keep it when only the domain or keywords change", async () => {
    await entryPATCH(send("/api/knowledge/k-1", "PATCH", { question: OLD.question, answer: OLD.answer, domain: "ENCRYPTION" }), ctx);
    expect(db.knowledgeEntry.update.mock.calls[0][0].data.isVerified).toBeUndefined();
  });
});
