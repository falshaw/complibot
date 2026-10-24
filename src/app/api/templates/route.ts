/**
 * CompliBot - Questionnaire Templates API
 * GET: built-in templates plus the organization's own
 * POST: create a custom template (admins and responders)
 */

import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/apiHandler";
import { rolesFor } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import prisma from "@/lib/prisma";
import { createTemplateSchema, templateStats } from "@/lib/validators/template";

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
      updatedAt: true,
    },
  });

  return NextResponse.json({ success: true, templates });
});

export const POST = apiHandler(
  async ({ req, body, user, organizationId }) => {
    const template = await prisma.questionnaireTemplate.create({
      data: {
        organizationId,
        name: body.name,
        description: body.description || null,
        framework: body.framework || null,
        questions: body.questions,
        ...templateStats(body.questions),
      },
    });

    await audit({
      organizationId,
      userId: user.id,
      action: "template.create",
      entityType: "QuestionnaireTemplate",
      entityId: template.id,
      details: { name: template.name, questions: template.questionCount },
      req,
    });

    return NextResponse.json({ success: true, template }, { status: 201 });
  },
  { roles: rolesFor("draft"), schema: createTemplateSchema },
);
