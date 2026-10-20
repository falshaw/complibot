import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route-level regressions fixed during the restyle:
 *  - interview sessions are scoped to the caller's organization
 *  - deleting a cited knowledge entry removes its citations first
 *  - review actions keep the questionnaire counters current and are audited
 *  - the audit writer never breaks the action it records
 *  - the interview "skip" reply never becomes a knowledge-base entry
 */

const { db, generateAnswer } = vi.hoisted(() => ({
  generateAnswer: vi.fn(),
  db: {
    interviewSession: { findFirst: vi.fn(), update: vi.fn() },
    knowledgeEntry: { findFirst: vi.fn(), delete: vi.fn(() => "kb-delete") },
    answer: { findFirst: vi.fn(), update: vi.fn(), count: vi.fn() },
    answerSource: { deleteMany: vi.fn(() => "sources-delete"), createMany: vi.fn() },
    organization: { findUnique: vi.fn(async () => ({ confidenceThreshold: 0.8 })) },
    question: { count: vi.fn() },
    questionnaire: { update: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}));

vi.mock("@/lib/prisma", () => ({ default: db, prisma: db }));
vi.mock("@/lib/session", () => ({
  getSession: vi.fn(async () => ({
    user: { id: "u-1", role: "ADMIN", organizationId: "org-1", email: "a@x.test" },
  })),
}));
vi.mock("@/lib/services/AnswerGenerationService", () => ({
  generateAnswer: (...a: unknown[]) => generateAnswer(...a),
}));
vi.mock("@/lib/rateLimit", () => ({
  applyRateLimit: vi.fn(async () => null),
  RATE_LIMITS: { api: {}, read: {}, ai: {}, upload: {}, expensive: {} },
}));

import { GET as interviewGET } from "@/app/api/interview/[id]/route";
import { POST as interviewComplete } from "@/app/api/interview/[id]/complete/route";
import { POST as interviewRespond } from "@/app/api/interview/[id]/respond/route";
import { DELETE as knowledgeDELETE } from "@/app/api/knowledge/[id]/route";
import { POST as rejectPOST } from "@/app/api/answers/[id]/reject/route";
import { POST as approvePOST } from "@/app/api/answers/[id]/approve/route";
import { POST as regeneratePOST } from "@/app/api/answers/[id]/regenerate/route";
import { audit } from "@/lib/audit";
import { isSkipResponse, SKIP_RESPONSE } from "@/lib/services/InterviewService";

const req = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  new NextRequest(`http://localhost${url}`, init);
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => vi.clearAllMocks());

describe("interview sessions are organization-scoped", () => {
  it("GET returns 404 for a session of another organization", async () => {
    db.interviewSession.findFirst.mockResolvedValue(null);
    const GET = interviewGET;

    const res = await GET(req("/api/interview/s-9"), ctx("s-9"));

    expect(res.status).toBe(404);
    expect(db.interviewSession.findFirst.mock.calls[0][0].where).toEqual({
      id: "s-9",
      organizationId: "org-1",
    });
  });

  it("complete refuses a foreign session and changes nothing", async () => {
    db.interviewSession.findFirst.mockResolvedValue(null);
    const POST = interviewComplete;

    const res = await POST(req("/api/interview/s-9/complete", { method: "POST" }), ctx("s-9"));

    expect(res.status).toBe(404);
    expect(db.interviewSession.update).not.toHaveBeenCalled();
  });

  it("respond refuses a foreign session", async () => {
    db.interviewSession.findFirst.mockResolvedValue(null);
    const POST = interviewRespond;

    const res = await POST(
      req("/api/interview/s-9/respond", {
        method: "POST",
        body: JSON.stringify({ response: "We use Okta with MFA" }),
      }),
      ctx("s-9"),
    );

    expect(res.status).toBe(404);
  });
});

describe("knowledge entry delete", () => {
  it("removes the entry's citations and the entry in one transaction", async () => {
    db.knowledgeEntry.findFirst.mockResolvedValue({ id: "kb-1", question: "Do you encrypt data at rest?" });
    const DELETE = knowledgeDELETE;

    const res = await DELETE(req("/api/knowledge/kb-1", { method: "DELETE" }), ctx("kb-1"));

    expect(res.status).toBe(200);
    expect(db.answerSource.deleteMany).toHaveBeenCalledWith({ where: { knowledgeEntryId: "kb-1" } });
    expect(db.$transaction).toHaveBeenCalledWith(["sources-delete", "kb-delete"]);
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe("knowledge.delete");
  });
});

describe("review actions", () => {
  beforeEach(() => {
    db.answer.findFirst.mockResolvedValue({ id: "a-1", question: { questionnaireId: "qn-1" } });
    db.answer.update.mockImplementation(async ({ data }) => ({ id: "a-1", ...data }));
    db.question.count.mockResolvedValue(4);
    db.answer.count.mockImplementation(async ({ where }) => (where.status === "APPROVED" ? 2 : 1));
  });

  it("reject refreshes approved/rejected counts and is audited", async () => {
    const POST = rejectPOST;

    const res = await POST(req("/api/answers/a-1/reject", { method: "POST", body: "{}" }), ctx("a-1"));

    expect(res.status).toBe(200);
    expect(db.questionnaire.update).toHaveBeenCalledWith({
      where: { id: "qn-1" },
      data: { answeredCount: 4, approvedCount: 2, rejectedCount: 1 },
    });
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({
      organizationId: "org-1",
      userId: "u-1",
      action: "answer.reject",
      entityType: "Answer",
      entityId: "a-1",
    });
  });

  it("approve refreshes the counts and is audited", async () => {
    const POST = approvePOST;

    await POST(req("/api/answers/a-1/approve", { method: "POST" }), ctx("a-1"));

    expect(db.questionnaire.update).toHaveBeenCalled();
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe("answer.approve");
  });
});

describe("regenerate", () => {
  it("flags a new draft below the confidence threshold, like the first draft", async () => {
    db.answer.findFirst.mockResolvedValue({ id: "a-1", questionId: "q-1", question: { questionnaireId: "qn-1" } });
    db.answer.update.mockImplementation(async ({ data }) => ({ id: "a-1", ...data }));
    db.question.count.mockResolvedValue(1);
    db.answer.count.mockResolvedValue(0);
    const POST = regeneratePOST;

    generateAnswer.mockResolvedValueOnce({ content: "Yes.", confidence: 0.39, sourceIds: [] });
    await POST(req("/api/answers/a-1/regenerate", { method: "POST" }), ctx("a-1"));
    expect(db.answer.update.mock.calls[0][0].data.status).toBe("FLAGGED");

    generateAnswer.mockResolvedValueOnce({ content: "Yes.", confidence: 0.91, sourceIds: [] });
    await POST(req("/api/answers/a-1/regenerate", { method: "POST" }), ctx("a-1"));
    expect(db.answer.update.mock.calls[1][0].data.status).toBe("PENDING");
  });
});

describe("audit()", () => {
  it("swallows a failed write instead of failing the action", async () => {
    db.auditLog.create.mockRejectedValueOnce(new Error("db down"));

    await expect(audit({ organizationId: "org-1", action: "x.y" })).resolves.toBeUndefined();
  });
});

describe("interview skip", () => {
  it("recognises the skip reply the UI sends", async () => {
    expect(isSkipResponse(SKIP_RESPONSE)).toBe(true);
    expect(isSkipResponse("  skip. ")).toBe(true);
    expect(isSkipResponse("We skip nothing: all laptops use BitLocker")).toBe(false);
  });
});
