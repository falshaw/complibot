import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/apiHandler";
import { rolesFor } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS } from "@/lib/rateLimit";

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

// DELETE /api/sources/:id
export const DELETE = apiHandler(async ({ params, organizationId }) => {
  const source = await prisma.knowledgeSource.findFirst({
    where: { id: params.id, organizationId },
  });
  if (!source)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete associated knowledge entries and the source
  await prisma.$transaction([
    prisma.knowledgeEntry.deleteMany({ where: { sourceId: params.id } }),
    prisma.knowledgeSource.delete({ where: { id: params.id } }),
  ]);

  return NextResponse.json({ success: true });
}, { roles: rolesFor("knowledge") });
