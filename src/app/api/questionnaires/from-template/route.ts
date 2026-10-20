/**
 * CompliBot - Create Questionnaire from Template
 * CB-03: Creates a questionnaire + questions from a template's question set.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { assessmentName } from "@/lib/services/assessmentName";
import { apiHandler } from "@/lib/apiHandler";
import prisma from "@/lib/prisma";

const fromTemplateSchema = z.object({
  templateId: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
});

/**
 * POST /api/questionnaires/from-template
 * Create a questionnaire from a template's questions.
 * Skips the file upload + parse step entirely.
 */
export const POST = apiHandler(
  async ({ req, body, user, organizationId }) => {
    const template = await prisma.questionnaireTemplate.findFirst({
      where: {
        id: body.templateId,
        OR: [{ isBuiltIn: true }, { organizationId }],
        isActive: true,
      },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 },
      );
    }

    const questions = template.questions as Array<{
      text: string;
      type: string;
      domain: string;
      required: boolean;
    }>;

    if (!questions.length) {
      return NextResponse.json(
        { error: "Template has no questions" },
        { status: 400 },
      );
    }

    // Create questionnaire in PARSED state (skip upload/parse)
    const questionnaire = await prisma.questionnaire.create({
      data: {
        organizationId,
        name: body.name || assessmentName(template.name),
        status: "PARSED",
        totalQuestions: questions.length,
        metadata: {
          source: "template",
          templateId: template.id,
          templateName: template.name,
          framework: template.framework,
        },
      },
    });

    // Create Question records from template
    await prisma.question.createMany({
      data: questions.map((q, idx) => ({
        questionnaireId: questionnaire.id,
        rowIndex: idx + 1,
        questionText: q.text,
        questionType: (q.type || "FREE_TEXT") as never,
        domain: (q.domain || "GENERAL") as never,
      })),
    });

    await audit({
      organizationId,
      userId: user.id,
      action: "questionnaire.from_template",
      entityType: "Questionnaire",
      entityId: questionnaire.id,
      details: { template: template.name, questions: questions.length },
      req,
    });

    return NextResponse.json(
      {
        success: true,
        questionnaire: {
          ...questionnaire,
          totalQuestions: questions.length,
        },
      },
      { status: 201 },
    );
  },
  { schema: fromTemplateSchema },
);
