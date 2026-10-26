import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/apiHandler";
import { rolesFor } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS } from "@/lib/rateLimit";
import { audit } from "@/lib/audit";

// GET /api/sources/:id
export const GET = apiHandler(
  async ({ params, organizationId }) => {
    const source = await prisma.knowledgeSource.findFirst({
      where: { id: params.id, organizationId },
      include: {
        _count: { select: { knowledgeEntries: true } },
      },
    });

    if (!source)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(source);
  },
  { rateLimit: RATE_LIMITS.read },
);

// DELETE /api/sources/:id - remove an imported file and the entries it created
export const DELETE = apiHandler(
  async ({ req, params, user, organizationId }) => {
    const source = await prisma.knowledgeSource.findFirst({
      where: { id: params.id, organizationId },
      include: { _count: { select: { knowledgeEntries: true } } },
    });
    if (!source)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Answers that cited these entries keep their text and lose the citation,
    // as when one entry is deleted (AnswerSource -> KnowledgeEntry has no cascade).
    await prisma.$transaction([
      prisma.answerSource.deleteMany({
        where: { knowledgeEntry: { sourceId: params.id } },
      }),
      prisma.knowledgeEntry.deleteMany({ where: { sourceId: params.id } }),
      prisma.knowledgeSource.delete({ where: { id: params.id } }),
    ]);
    await audit({
      organizationId,
      userId: user.id,
      action: "knowledge.source_delete",
      entityType: "KnowledgeSource",
      entityId: params.id,
      details: { fileName: source.fileName, entriesDeleted: source._count.knowledgeEntries },
      req,
    });

    return NextResponse.json({ success: true, entriesDeleted: source._count.knowledgeEntries });
  },
  { roles: rolesFor("knowledge") },
);
