import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { apiHandler } from "@/lib/apiHandler";
import { rolesFor } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import {
  parseQuestionnaire,
  QuestionnaireParseError,
  type ColumnMapping,
} from "@/lib/services/QuestionnaireParserService";
import { RATE_LIMITS } from "@/lib/rateLimit";

// POST /api/questionnaires/[id]/parse - Trigger parsing
export const POST = apiHandler(
  async ({ req, params, user, organizationId }) => {
    const questionnaire = await prisma.questionnaire.findUnique({
      where: { id: params.id, organizationId },
    });

    if (!questionnaire) {
      return NextResponse.json(
        { error: "Questionnaire not found" },
        { status: 404 },
      );
    }

    if (!questionnaire.filePath) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (questionnaire.status !== "UPLOADED") {
      return NextResponse.json(
        {
          error: `Questionnaire must be in UPLOADED status to parse (current: ${questionnaire.status})`,
        },
        { status: 400 },
      );
    }

    // Column mapping: saved at upload, else from the request body, else the
    // question column is detected from the header names / content.
    let mapping = questionnaire.columnMapping as Partial<ColumnMapping> | null;
    if (!mapping) {
      const body = await req.json().catch(() => ({}));
      mapping =
        body && typeof body.columnMapping === "object" && body.columnMapping
          ? (body.columnMapping as Partial<ColumnMapping>)
          : {};
    }

    let result: { questionCount: number };
    try {
      result = await parseQuestionnaire(
        questionnaire.id,
        questionnaire.filePath,
        {
          questionCol:
            typeof mapping.questionCol === "string" ? mapping.questionCol : undefined,
          headerRow:
            typeof mapping.headerRow === "number" ? mapping.headerRow : undefined,
          sheetName:
            typeof mapping.sheetName === "string" ? mapping.sheetName : undefined,
        },
      );
    } catch (error) {
      if (error instanceof QuestionnaireParseError) {
        return NextResponse.json({ error: error.message }, { status: 422 });
      }
      throw error;
    }

    await audit({
      organizationId,
      userId: user.id,
      action: "questionnaire.parse",
      entityType: "Questionnaire",
      entityId: questionnaire.id,
      details: { questionCount: result.questionCount },
      req,
    });

    return NextResponse.json({
      message: "Parsing complete",
      questionCount: result.questionCount,
    });
  },
  { roles: rolesFor("draft"), rateLimit: RATE_LIMITS.expensive },
);
