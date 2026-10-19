/**
 * CompliBot - Single Template API
 * CB-03: Get, update, delete, and clone templates.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/apiHandler";
import prisma from "@/lib/prisma";

/**
 * GET /api/templates/[id]
 * Get full template with questions.
 */
export const GET = apiHandler(async ({ params, organizationId }) => {
  const template = await prisma.questionnaireTemplate.findFirst({
    where: {
      id: params.id,
      OR: [{ isBuiltIn: true }, { organizationId }],
    },
  });

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, template });
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  framework: z.string().max(100).optional(),
  isActive: z.boolean().optional(),
  questions: z
    .array(
      z.object({
        text: z.string().min(1),
        type: z
          .enum(["YES_NO", "FREE_TEXT", "MULTIPLE_CHOICE", "EVIDENCE"])
          .default("FREE_TEXT"),
        domain: z.string().default("GENERAL"),
        required: z.boolean().default(true),
      }),
    )
    .optional(),
});

/**
 * PATCH /api/templates/[id]
 * Update org-owned template (cannot edit built-in).
 */
export const PATCH = apiHandler(
  async ({ params, body, organizationId }) => {
    const existing = await prisma.questionnaireTemplate.findFirst({
      where: { id: params.id, organizationId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Template not found or is built-in" },
        { status: 404 },
      );
    }

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;
    if (body.framework !== undefined) data.framework = body.framework;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.questions !== undefined) {
      data.questions = body.questions as object[];
      data.questionCount = body.questions.length;
      data.domains = [...new Set(body.questions.map((q) => q.domain))];
    }

    const template = await prisma.questionnaireTemplate.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json({ success: true, template });
  },
  { schema: updateSchema },
);

/**
 * DELETE /api/templates/[id]
 * Soft-delete org template.
 */
export const DELETE = apiHandler(async ({ params, organizationId }) => {
  const existing = await prisma.questionnaireTemplate.findFirst({
    where: { id: params.id, organizationId },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Template not found or is built-in" },
      { status: 404 },
    );
  }

  await prisma.questionnaireTemplate.update({
    where: { id: params.id },
    data: { isActive: false },
  });

  return NextResponse.json({ success: true });
});

/**
 * POST /api/templates/[id]
 * Clone a template (built-in or own) into org.
 */
export const POST = apiHandler(async ({ params, organizationId }) => {
  const source = await prisma.questionnaireTemplate.findFirst({
    where: {
      id: params.id,
      OR: [{ isBuiltIn: true }, { organizationId }],
    },
  });

  if (!source) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const clone = await prisma.questionnaireTemplate.create({
    data: {
      organizationId,
      name: `${source.name} (Copy)`,
      description: source.description,
      framework: source.framework,
      questionCount: source.questionCount,
      domains: source.domains,
      questions: source.questions as object[],
    },
  });

  return NextResponse.json({ success: true, template: clone }, { status: 201 });
});
