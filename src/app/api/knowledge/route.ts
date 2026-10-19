import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/apiHandler";
import prisma from "@/lib/prisma";
import { createKnowledgeEntrySchema } from "@/lib/validators/knowledge";
import type { SecurityDomain } from "@prisma/client";

// GET /api/knowledge - List knowledge entries with optional domain filter
export const GET = apiHandler(async ({ req, organizationId }) => {
  const { searchParams } = new URL(req.url);
  const domain = searchParams.get("domain") as SecurityDomain | null;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(
    Math.max(1, parseInt(searchParams.get("limit") || "20")),
    100,
  );
  const search = searchParams.get("search");

  const where: Record<string, unknown> = { organizationId };
  if (domain) where.domain = domain;
  if (search) {
    where.OR = [
      { question: { contains: search, mode: "insensitive" } },
      { answer: { contains: search, mode: "insensitive" } },
      { keywords: { has: search.toLowerCase() } },
    ];
  }

  const [entries, total] = await Promise.all([
    prisma.knowledgeEntry.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { source: { select: { name: true, sourceType: true } } },
    }),
    prisma.knowledgeEntry.count({ where }),
  ]);

  return NextResponse.json({
    entries,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
});

// POST /api/knowledge - Create manual knowledge entry
export const POST = apiHandler(
  async ({ body, organizationId }) => {
    const entry = await prisma.knowledgeEntry.create({
      data: {
        ...body,
        organizationId,
      },
    });

    return NextResponse.json(entry, { status: 201 });
  },
  { schema: createKnowledgeEntrySchema },
);
