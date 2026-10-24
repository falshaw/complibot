import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { PERMISSIONS, type Permission } from "@/lib/permissions";

/**
 * Every write route against every role. A role outside the route's permission
 * gets 403 before anything is read or written; a role inside it gets past the
 * check (whatever the mocked database then makes of the request).
 */

const { session, db } = vi.hoisted(() => {
  const model = () =>
    new Proxy({}, { get: () => vi.fn(async () => null) }) as Record<string, unknown>;
  const models: Record<string, unknown> = {};
  return {
    session: { role: "ADMIN" as string },
    db: new Proxy(models, {
      get: (t, k: string) =>
        k === "$transaction" ? vi.fn(async () => []) : (t[k] ??= model()),
    }),
  };
});

vi.mock("@/lib/prisma", () => ({ default: db, prisma: db }));
vi.mock("@/lib/session", () => ({
  getSession: vi.fn(async () => ({
    user: { id: "u-1", role: session.role, organizationId: "org-1", email: "a@x.test" },
  })),
}));
vi.mock("@/lib/rateLimit", () => ({
  applyRateLimit: vi.fn(async () => null),
  RATE_LIMITS: { api: {}, read: {}, ai: {}, upload: {}, expensive: {} },
}));

import { POST as approve } from "@/app/api/answers/[id]/approve/route";
import { POST as reject } from "@/app/api/answers/[id]/reject/route";
import { POST as regenerate } from "@/app/api/answers/[id]/regenerate/route";
import { PATCH as answerPatch } from "@/app/api/answers/[id]/route";
import { POST as bulkApprove } from "@/app/api/answers/bulk-approve/route";
import { POST as interviewStart } from "@/app/api/interview/route";
import { POST as interviewRespond } from "@/app/api/interview/[id]/respond/route";
import { POST as interviewComplete } from "@/app/api/interview/[id]/complete/route";
import { POST as knowledgePost } from "@/app/api/knowledge/route";
import { PATCH as knowledgePatch, DELETE as knowledgeDelete } from "@/app/api/knowledge/[id]/route";
import { POST as sourcesPost } from "@/app/api/sources/route";
import { DELETE as sourcesDelete } from "@/app/api/sources/[id]/route";
import { POST as questionnairePost } from "@/app/api/questionnaires/route";
import { POST as bulkUpload } from "@/app/api/questionnaires/bulk-upload/route";
import { POST as fromTemplate } from "@/app/api/questionnaires/from-template/route";
import { DELETE as questionnaireDelete } from "@/app/api/questionnaires/[id]/route";
import { POST as parse } from "@/app/api/questionnaires/[id]/parse/route";
import { POST as generate } from "@/app/api/questionnaires/[id]/generate/route";
import { POST as exportPost } from "@/app/api/questionnaires/[id]/export/route";
import { POST as templatePost } from "@/app/api/templates/route";
import {
  PATCH as templatePatch,
  DELETE as templateDelete,
  POST as templateCopy,
} from "@/app/api/templates/[id]/route";

type Handler = (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>> },
) => Promise<Response>;

const ROUTES: Array<[string, Handler, Permission]> = [
  ["POST /api/answers/:id/approve", approve, "review"],
  ["POST /api/answers/:id/reject", reject, "review"],
  ["POST /api/answers/bulk-approve", bulkApprove, "review"],
  ["POST /api/answers/:id/regenerate", regenerate, "draft"],
  ["PATCH /api/answers/:id", answerPatch, "draft"],
  ["POST /api/interview", interviewStart, "knowledge"],
  ["POST /api/interview/:id/respond", interviewRespond, "knowledge"],
  ["POST /api/interview/:id/complete", interviewComplete, "knowledge"],
  ["POST /api/knowledge", knowledgePost, "knowledge"],
  ["PATCH /api/knowledge/:id", knowledgePatch, "knowledge"],
  ["DELETE /api/knowledge/:id", knowledgeDelete, "knowledge"],
  ["POST /api/sources", sourcesPost, "knowledge"],
  ["DELETE /api/sources/:id", sourcesDelete, "knowledge"],
  ["POST /api/questionnaires", questionnairePost, "draft"],
  ["POST /api/questionnaires/bulk-upload", bulkUpload as unknown as Handler, "draft"],
  ["POST /api/questionnaires/from-template", fromTemplate, "draft"],
  ["POST /api/questionnaires/:id/parse", parse, "draft"],
  ["POST /api/questionnaires/:id/generate", generate, "draft"],
  ["POST /api/questionnaires/:id/export", exportPost, "draft"],
  ["DELETE /api/questionnaires/:id", questionnaireDelete, "admin"],
  ["POST /api/templates", templatePost, "draft"],
  ["PATCH /api/templates/:id", templatePatch, "draft"],
  ["DELETE /api/templates/:id", templateDelete, "draft"],
  ["POST /api/templates/:id (copy)", templateCopy, "draft"],
];

const ROLES: Role[] = ["ADMIN", "REVIEWER", "RESPONDER", "VIEWER"];

const call = (label: string, handler: Handler) => {
  const [method, path] = label.split(" ");
  const req = new NextRequest(`http://localhost${path.replace(":id", "x-1")}`, {
    method,
    body: method === "DELETE" ? undefined : "{}",
    headers: { "content-type": "application/json" },
  });
  return handler(req, { params: Promise.resolve({ id: "x-1" }) });
};

beforeEach(() => vi.clearAllMocks());

describe("permission matrix", () => {
  it("viewers can write nothing; admins can do everything", () => {
    for (const roles of Object.values(PERMISSIONS)) {
      expect(roles as readonly Role[]).not.toContain("VIEWER");
      expect(roles as readonly Role[]).toContain("ADMIN");
    }
    expect(PERMISSIONS.admin).toEqual(["ADMIN"]);
  });

  for (const [label, handler, permission] of ROUTES) {
    for (const role of ROLES) {
      const allowed = (PERMISSIONS[permission] as readonly Role[]).includes(role);
      it(`${label} as ${role} -> ${allowed ? "allowed" : "403"}`, async () => {
        session.role = role;
        const res = await call(label, handler);
        if (allowed) expect(res.status).not.toBe(403);
        else expect(res.status).toBe(403);
      });
    }
  }
});
