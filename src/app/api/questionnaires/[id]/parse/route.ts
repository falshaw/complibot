import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/apiHandler";
import prisma from "@/lib/prisma";
import {
  parseQuestionnaire,
  QuestionnaireParseError,
} from "@/lib/services/QuestionnaireParserService";
import { RATE_LIMITS } from "@/lib/rateLimit";

// POST /api/questionnaires/[id]/parse - Trigger parsing
export const POST = apiHandler(
  async ({ req, params, organizationId }) => {
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

    // Get column mapping from body or questionnaire
    let mapping = questionnaire.columnMapping as {
      questionCol?: string;
    } | null;
    if (!mapping) {
      const body = await req.json().catch(() => ({}));
      mapping = body.columnMapping || { questionCol: "B" };
    }

    let result: { questionCount: number };
    try {
      result = await parseQuestionnaire(
        questionnaire.id,
        questionnaire.filePath,
        { questionCol: mapping?.questionCol || "B" },
      );
    } catch (error) {
      if (error instanceof QuestionnaireParseError) {
        return NextResponse.json({ error: error.message }, { status: 422 });
      }
      throw error;
    }

    return NextResponse.json({
      message: "Parsing complete",
      questionCount: result.questionCount,
    });
  },
  { rateLimit: RATE_LIMITS.expensive },
);
