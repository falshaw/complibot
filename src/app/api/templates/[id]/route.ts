/**
 * CompliBot - Single Template API
 * GET: one template with its questions (built-in or the organization's own)
 * PATCH: edit a custom template
 * DELETE: delete a custom template
 * POST: copy a template into the organization's own templates
 *
 * Built-in templates are read-only: PATCH and DELETE only find templates the
 * organization owns. Assessments started from a template keep their own copy
 * of the questions, so editing or deleting a template never changes them.
 */

import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/apiHandler";
import { rolesFor } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import prisma from "@/lib/prisma";
import { templateStats, updateTemplateSchema } from "@/lib/validators/template";


const builtInOrMissing = () =>
  NextResponse.json(
    { error: "Template not found, or it is a built-in template (built-ins are read-only)" },
    { status: 404 },
  );

function ownTemplate(id: string, organizationId: string) {
  return prisma.questionnaireTemplate.findFirst({
    where: { id, organizationId, isBuiltIn: false, isActive: true },
  });
}

export const GET = apiHandler(async ({ params, organizationId }) => {
  const template = await prisma.questionnaireTemplate.findFirst({
    where: {
      id: params.id,
      isActive: true,
      OR: [{ isBuiltIn: true }, { organizationId }],
    },
  });

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, template });
});

export const PATCH = apiHandler(
  async ({ req, params, body, user, organizationId }) => {
    const existing = await ownTemplate(params.id, organizationId);
    if (!existing) return builtInOrMissing();

    const template = await prisma.questionnaireTemplate.update({
      where: { id: params.id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description || null }),
        ...(body.framework !== undefined && { framework: body.framework || null }),
        ...(body.questions !== undefined && {
          questions: body.questions,
          ...templateStats(body.questions),
        }),
      },
    });

    await audit({
      organizationId,
      userId: user.id,
      action: "template.update",
      entityType: "QuestionnaireTemplate",
      entityId: template.id,
      details: {
        name: template.name,
        questions: template.questionCount,
        ...(existing.name !== template.name && { renamedFrom: existing.name }),
      },
      req,
    });

    return NextResponse.json({ success: true, template });
  },
  { schema: updateTemplateSchema, roles: rolesFor("draft") },
);

export const DELETE = apiHandler(
  async ({ req, params, user, organizationId }) => {
    const existing = await ownTemplate(params.id, organizationId);
    if (!existing) return builtInOrMissing();

    await prisma.questionnaireTemplate.delete({ where: { id: params.id } });

    await audit({
      organizationId,
      userId: user.id,
      action: "template.delete",
      entityType: "QuestionnaireTemplate",
      entityId: params.id,
      details: { name: existing.name, questions: existing.questionCount },
      req,
    });

    return NextResponse.json({ success: true });
  },
  { roles: rolesFor("draft") },
);

export const POST = apiHandler(
  async ({ req, params, user, organizationId }) => {
    const source = await prisma.questionnaireTemplate.findFirst({
      where: {
        id: params.id,
        isActive: true,
        OR: [{ isBuiltIn: true }, { organizationId }],
      },
    });

    if (!source) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const clone = await prisma.questionnaireTemplate.create({
      data: {
        organizationId,
        name: `${source.name} (copy)`,
        description: source.description,
        framework: source.framework,
        version: source.version,
        questionCount: source.questionCount,
        domains: source.domains,
        questions: source.questions ?? [],
      },
    });

    await audit({
      organizationId,
      userId: user.id,
      action: "template.copy",
      entityType: "QuestionnaireTemplate",
      entityId: clone.id,
      details: { name: clone.name, from: source.name },
      req,
    });

    return NextResponse.json({ success: true, template: clone }, { status: 201 });
  },
  { roles: rolesFor("draft") },
);
