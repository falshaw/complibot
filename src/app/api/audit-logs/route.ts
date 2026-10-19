import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/apiHandler";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS } from "@/lib/rateLimit";

// GET /api/audit-logs?action=&entityType=&page=1&limit=50
export const GET = apiHandler(
  async ({ organizationId, req }) => {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || undefined;
    const entityType = url.searchParams.get("entityType") || undefined;
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(url.searchParams.get("limit") || "50")),
    );
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId };
    if (action) where.action = { contains: action };
    if (entityType) where.entityType = entityType;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json({
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  },
  { rateLimit: RATE_LIMITS.read },
);
