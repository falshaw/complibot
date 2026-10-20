/**
 * CompliBot - Questionnaire Templates API
 * CB-03: List and create questionnaire templates.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/apiHandler";
import prisma from "@/lib/prisma";

/**
 * GET /api/templates
 * List all templates (built-in + org-specific).
 */
export const GET = apiHandler(async ({ organizationId }) => {
  const templates = await prisma.questionnaireTemplate.findMany({
    where: {
      OR: [{ isBuiltIn: true }, { organizationId }],
      isActive: true,
    },
    orderBy: [{ isBuiltIn: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      framework: true,
      version: true,
      isBuiltIn: true,
      questionCount: true,
      domains: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ success: true, templates });
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  framework: z.string().max(100).optional(),
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
    .min(1),
});

/**
 * POST /api/templates
 * Create a custom template for the organization.
 */
export const POST = apiHandler(
  async ({ body, organizationId }) => {
    const domains = [
      ...new Set(body.questions.map((q) => q.domain)),
    ] as string[];

    const template = await prisma.questionnaireTemplate.create({
      data: {
        organizationId,
        name: body.name,
        description: body.description,
        framework: body.framework,
        questionCount: body.questions.length,
        domains: domains as never[],
        questions: body.questions as object[],
      },
    });

    return NextResponse.json({ success: true, template }, { status: 201 });
  },
  { schema: createSchema },
);
