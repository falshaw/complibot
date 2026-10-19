import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/apiHandler";
import { prisma } from "@/lib/prisma";
import { updateKnowledgeEntrySchema } from "@/lib/validators/knowledge";
import { RATE_LIMITS } from "@/lib/rateLimit";

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
  async ({ body, params, organizationId }) => {
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

    return NextResponse.json(updated);
  },
  { schema: updateKnowledgeEntrySchema },
);

// DELETE /api/knowledge/:id
export const DELETE = apiHandler(async ({ params, organizationId }) => {
  const entry = await prisma.knowledgeEntry.findFirst({
    where: { id: params.id, organizationId },
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.knowledgeEntry.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
});
