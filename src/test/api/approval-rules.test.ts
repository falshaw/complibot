import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * What may be approved, and what an edit does to a decision:
 *  - an unedited "not covered" draft that cites nothing cannot be approved,
 *    alone or in bulk
 *  - saving an edit sends the answer back to review
 */

const { db } = vi.hoisted(() => ({
  db: {
    answer: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    question: { count: vi.fn() },
    questionnaire: { update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ default: db, prisma: db }));
vi.mock("@/lib/session", () => ({
  getSession: vi.fn(async () => ({
    user: { id: "u-1", role: "REVIEWER", organizationId: "org-1", email: "r@x.test" },
  })),
}));
vi.mock("@/lib/rateLimit", () => ({
  applyRateLimit: vi.fn(async () => null),
  RATE_LIMITS: { api: {}, read: {}, ai: {}, upload: {}, expensive: {} },
}));

import { POST as approvePOST } from "@/app/api/answers/[id]/approve/route";
import { POST as bulkPOST } from "@/app/api/answers/bulk-approve/route";
import { PATCH as answerPATCH } from "@/app/api/answers/[id]/route";
import { needsEditBeforeApproval } from "@/lib/services/answerQuality";

const NOT_COVERED = "The knowledge base does not cover it.";
const draft = (over: Record<string, unknown> = {}) => ({
  id: "a-1",
  content: NOT_COVERED,
  editedContent: null,
  _count: { sources: 0 },
  question: { questionnaireId: "qn-1" },
  ...over,
});
const req = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  new NextRequest(`http://localhost${url}`, init);
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

beforeEach(() => {
  vi.clearAllMocks();
  db.answer.update.mockImplementation(async ({ data }) => ({ id: "a-1", ...data }));
  db.answer.count.mockResolvedValue(0);
  db.question.count.mockResolvedValue(0);
});

describe("needsEditBeforeApproval", () => {
  it("is true only for an unedited, uncited not-covered draft", () => {
    expect(needsEditBeforeApproval({ content: NOT_COVERED, editedContent: null, sourceCount: 0 })).toBe(true);
    expect(needsEditBeforeApproval({ content: NOT_COVERED, editedContent: "We use TLS 1.3.", sourceCount: 0 })).toBe(false);
    // a partial answer cites the entry it used
    expect(needsEditBeforeApproval({ content: `TLS 1.3. ${NOT_COVERED}`, editedContent: null, sourceCount: 1 })).toBe(false);
    expect(needsEditBeforeApproval({ content: "All traffic uses TLS 1.3.", editedContent: null, sourceCount: 0 })).toBe(false);
  });
});

describe("approve", () => {
  it("refuses a not-covered draft and changes nothing", async () => {
    db.answer.findFirst.mockResolvedValue(draft());

    const res = await approvePOST(req("/api/answers/a-1/approve", { method: "POST" }), ctx("a-1"));

    expect(res.status).toBe(409);
    expect(db.answer.update).not.toHaveBeenCalled();
  });

  it("approves the same question once someone has written the answer", async () => {
    db.answer.findFirst.mockResolvedValue(draft({ editedContent: "We use TLS 1.3 everywhere." }));

    const res = await approvePOST(req("/api/answers/a-1/approve", { method: "POST" }), ctx("a-1"));

    expect(res.status).toBe(200);
    expect(db.answer.update.mock.calls[0][0].data.status).toBe("APPROVED");
  });
});

describe("bulk approve", () => {
  it("leaves not-covered drafts open and reports them", async () => {
    db.answer.findMany.mockResolvedValue([
      draft({ id: "a-1" }),
      draft({ id: "a-2", content: "AES-256 at rest.", _count: { sources: 1 } }),
    ]);
    db.answer.updateMany.mockResolvedValue({ count: 1 });

    const res = await bulkPOST(req("/api/answers/bulk-approve", json({ answerIds: ["a-1", "a-2"] })));

    expect(await res.json()).toEqual({ approved: 1, skipped: 1 });
    expect(db.answer.updateMany.mock.calls[0][0].where).toEqual({ id: { in: ["a-2"] } });
  });

  it("only touches pending drafts, whatever ids it is sent", async () => {
    db.answer.findMany.mockResolvedValue([]);
    db.answer.updateMany.mockResolvedValue({ count: 0 });

    await bulkPOST(req("/api/answers/bulk-approve", json({ answerIds: ["rejected-1"] })));

    expect(db.answer.findMany.mock.calls[0][0].where.status).toBe("PENDING");
  });
});

describe("edit", () => {
  it("sends an approved answer back to review and refreshes the counts", async () => {
    db.answer.findFirst.mockResolvedValue({
      id: "a-1",
      status: "APPROVED",
      content: "Old draft.",
      editedContent: null,
      question: { questionnaireId: "qn-1" },
    });
    db.answer.update.mockResolvedValue({ id: "a-1", status: "PENDING" });

    const res = await answerPATCH(
      req("/api/answers/a-1", { ...json({ editedContent: "New text." }), method: "PATCH" }),
      ctx("a-1"),
    );

    expect(res.status).toBe(200);
    expect(db.answer.update.mock.calls[0][0].data).toMatchObject({
      editedContent: "New text.",
      status: "PENDING",
    });
    expect(db.questionnaire.update).toHaveBeenCalled();
    // the audit entry keeps the old text and shows the approval was undone
    expect(db.auditLog.create.mock.calls[0][0].data.details).toMatchObject({
      statusBefore: "APPROVED",
      statusAfter: "PENDING",
      previousText: "Old draft.",
    });
  });

  it("keeps the decision when only the review note changes", async () => {
    db.answer.findFirst.mockResolvedValue({ id: "a-1", question: { questionnaireId: "qn-1" } });

    await answerPATCH(
      req("/api/answers/a-1", { ...json({ reviewNote: "checked with IT" }), method: "PATCH" }),
      ctx("a-1"),
    );

    expect(db.answer.update.mock.calls[0][0].data.status).toBeUndefined();
  });
});
