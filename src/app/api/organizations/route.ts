import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/apiHandler";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS } from "@/lib/rateLimit";

// GET /api/organizations
export const GET = apiHandler(
  async ({ organizationId }) => {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        _count: {
          select: {
            knowledgeEntries: true,
            questionnaires: true,
            users: true,
          },
        },
      },
    });

    if (!organization)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      organization: {
        id: organization.id,
        name: organization.name,
        plan: organization.planTier,
        confidenceThreshold: organization.confidenceThreshold,
        knowledgeEntryCount: organization._count.knowledgeEntries,
        questionnaireCount: organization._count.questionnaires,
        userCount: organization._count.users,
      },
    });
  },
  { rateLimit: RATE_LIMITS.read },
);
