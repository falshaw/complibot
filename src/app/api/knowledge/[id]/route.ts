import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/apiHandler";
import { prisma } from "@/lib/prisma";
import { updateKnowledgeEntrySchema } from "@/lib/validators/knowledge";
import { RATE_LIMITS } from "@/lib/rateLimit";
import { audit } from "@/lib/audit";

// GET /api/knowledge/:id
export const GET = apiHandler(
  async ({ params, organizationId }) => {
    const entry = await prisma.knowledgeEntry.findFirst({
      where: { id: params.id, organizationId },
      include: { source: { select: { name: true, sourceType: true } } },
    });

    if (!entry)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(entry);
  },
  { rateLimit: RATE_LIMITS.read },
);

// PATCH /api/knowledge/:id
export const PATCH = apiHandler(
  async ({ req, body, params, user, organizationId }) => {
    const entry = await prisma.knowledgeEntry.findFirst({
      where: { id: params.id, organizationId },
    });
    if (!entry)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await prisma.knowledgeEntry.update({
      where: { id: params.id },
      data: {
        ...(body.question && { question: body.question }),
        ...(body.answer && { answer: body.answer }),
        ...(body.domain && { domain: body.domain }),
        ...(body.isVerified !== undefined && { isVerified: body.isVerified }),
        ...(body.keywords && { keywords: body.keywords }),
      },
      include: { source: { select: { name: true, sourceType: true } } },
    });

    await audit({
      organizationId,
      userId: user.id,
      action:
        body.isVerified === true
          ? "knowledge.verify"
          : body.isVerified === false
            ? "knowledge.unverify"
            : "knowledge.update",
      entityType: "KnowledgeEntry",
      entityId: updated.id,
      details: { fields: Object.keys(body ?? {}) },
      req,
    });

    return NextResponse.json(updated);
  },
  { schema: updateKnowledgeEntrySchema },
);

// DELETE /api/knowledge/:id
export const DELETE = apiHandler(async ({ req, params, user, organizationId }) => {
  const entry = await prisma.knowledgeEntry.findFirst({
    where: { id: params.id, organizationId },
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Answers that cited this entry keep their text; only the citation goes.
  // (AnswerSource -> KnowledgeEntry has no cascade, so a plain delete of a
  // cited entry fails with a foreign-key error.)
  await prisma.$transaction([
    prisma.answerSource.deleteMany({ where: { knowledgeEntryId: params.id } }),
    prisma.knowledgeEntry.delete({ where: { id: params.id } }),
  ]);
  await audit({
    organizationId,
    userId: user.id,
    action: "knowledge.delete",
    entityType: "KnowledgeEntry",
    entityId: params.id,
    details: { question: entry.question.slice(0, 120) },
    req,
  });
  return NextResponse.json({ success: true });
});
