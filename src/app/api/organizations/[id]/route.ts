import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/apiHandler";
import { prisma } from "@/lib/prisma";

const updateOrganizationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  confidenceThreshold: z.number().min(0.1).max(1.0).optional(),
});

// PATCH /api/organizations/:id
export const PATCH = apiHandler(
  async ({ body, params, user }) => {
    if (params.id !== user.organizationId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.confidenceThreshold !== undefined)
      data.confidenceThreshold = body.confidenceThreshold;

    const updated = await prisma.organization.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json(updated);
  },
  { schema: updateOrganizationSchema, roles: ["ADMIN"] },
);
