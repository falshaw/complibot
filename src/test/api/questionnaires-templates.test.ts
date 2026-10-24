import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Deleting a questionnaire (with its export records, which have no cascade)
 * and editing / deleting custom templates (built-ins are read-only).
 */

const { db, session } = vi.hoisted(() => ({
  db: {
    questionnaire: { findUnique: vi.fn(), delete: vi.fn(() => "q-delete") },
    questionnaireExport: { deleteMany: vi.fn(() => "exports-delete") },
    answer: { count: vi.fn() },
    questionnaireTemplate: {
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
  session: {
    user: { id: "u-1", role: "RESPONDER", organizationId: "org-1", email: "r@demo.com" } as Record<string, string>,
  },
}));

vi.mock("@/lib/prisma", () => ({ default: db, prisma: db }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn(async () => session) }));
vi.mock("@/lib/rateLimit", () => ({
  applyRateLimit: vi.fn(async () => null),
  RATE_LIMITS: { api: {}, auth: {}, read: {}, ai: {}, upload: {}, expensive: {} },
}));

import { DELETE as questionnaireDELETE } from "@/app/api/questionnaires/[id]/route";
import { DELETE as templateDELETE, PATCH as templatePATCH } from "@/app/api/templates/[id]/route";

const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  session.user.role = "RESPONDER";
});

describe("delete questionnaire", () => {
  // Deleting a questionnaire removes approved answers too: admin only.
  beforeEach(() => {
    session.user.role = "ADMIN";
  });

  it("removes export records and the questionnaire in one transaction and audits the counts", async () => {
    db.questionnaire.findUnique.mockResolvedValue({
      id: "qn-1",
      name: "Vendor A",
      filePath: null,
      exports: [{ filePath: "/elsewhere/not-in-uploads.xlsx" }],
      _count: { questions: 5 },
    });
    db.answer.count.mockResolvedValue(5);

    const res = await questionnaireDELETE(req("/api/questionnaires/qn-1", "DELETE"), ctx("qn-1"));

    expect(res.status).toBe(200);
    expect(db.questionnaire.findUnique.mock.calls[0][0].where).toEqual({ id: "qn-1", organizationId: "org-1" });
    expect(db.questionnaireExport.deleteMany).toHaveBeenCalledWith({ where: { questionnaireId: "qn-1" } });
    expect(db.$transaction).toHaveBeenCalledWith(["exports-delete", "q-delete"]);
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: "questionnaire.delete",
      entityId: "qn-1",
      details: { name: "Vendor A", questions: 5, answers: 5, exports: 1 },
    });
  });

  it("returns 404 for another organization's questionnaire and deletes nothing", async () => {
    db.questionnaire.findUnique.mockResolvedValue(null);
    const res = await questionnaireDELETE(req("/api/questionnaires/qn-x", "DELETE"), ctx("qn-x"));
    expect(res.status).toBe(404);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("is not allowed for reviewers and viewers", async () => {
    session.user.role = "VIEWER";
    const res = await questionnaireDELETE(req("/api/questionnaires/qn-1", "DELETE"), ctx("qn-1"));
    expect(res.status).toBe(403);
  });
});

describe("custom templates", () => {
  const own = { id: "t-1", name: "CIS Controls v8 (copy)", questionCount: 18, isBuiltIn: false };
  const questions = [
    { text: "Do you keep an inventory of enterprise assets?", type: "YES_NO", domain: "GOVERNANCE", required: true },
    { text: "How often are access rights reviewed?", type: "FREE_TEXT", domain: "ACCESS_CONTROL", required: false },
  ];

  it("edits the organization's own template and derives count and domains", async () => {
    db.questionnaireTemplate.findFirst.mockResolvedValue(own);
    db.questionnaireTemplate.update.mockImplementation(async ({ data }) => ({ ...own, ...data }));

    const res = await templatePATCH(req("/api/templates/t-1", "PATCH", { name: "Asset controls", questions }), ctx("t-1"));

    expect(res.status).toBe(200);
    expect(db.questionnaireTemplate.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "t-1",
      organizationId: "org-1",
      isBuiltIn: false,
    });
    expect(db.questionnaireTemplate.update.mock.calls[0][0].data).toMatchObject({
      name: "Asset controls",
      questionCount: 2,
      domains: ["GOVERNANCE", "ACCESS_CONTROL"],
    });
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: "template.update",
      details: { name: "Asset controls", renamedFrom: own.name },
    });
  });

  it("rejects unknown domains and question types", async () => {
    db.questionnaireTemplate.findFirst.mockResolvedValue(own);
    const res = await templatePATCH(
      req("/api/templates/t-1", "PATCH", { questions: [{ text: "Is MFA enforced?", type: "ESSAY", domain: "SPACE" }] }),
      ctx("t-1"),
    );
    expect(res.status).toBe(400);
    expect(db.questionnaireTemplate.update).not.toHaveBeenCalled();
  });

  it("deletes the organization's own template", async () => {
    db.questionnaireTemplate.findFirst.mockResolvedValue(own);
    const res = await templateDELETE(req("/api/templates/t-1", "DELETE"), ctx("t-1"));
    expect(res.status).toBe(200);
    expect(db.questionnaireTemplate.delete).toHaveBeenCalledWith({ where: { id: "t-1" } });
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe("template.delete");
  });

  it("leaves built-in templates read-only", async () => {
    // A built-in has no organizationId and isBuiltIn=true, so the owner query finds nothing.
    db.questionnaireTemplate.findFirst.mockResolvedValue(null);
    expect((await templatePATCH(req("/api/templates/b-1", "PATCH", { name: "Mine now" }), ctx("b-1"))).status).toBe(404);
    expect((await templateDELETE(req("/api/templates/b-1", "DELETE"), ctx("b-1"))).status).toBe(404);
    expect(db.questionnaireTemplate.update).not.toHaveBeenCalled();
    expect(db.questionnaireTemplate.delete).not.toHaveBeenCalled();
  });

  it("is not allowed for viewers", async () => {
    session.user.role = "VIEWER";
    expect((await templateDELETE(req("/api/templates/t-1", "DELETE"), ctx("t-1"))).status).toBe(403);
  });
});
