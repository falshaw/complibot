import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/apiHandler";
import prisma from "@/lib/prisma";
import { parseQuestionnaire } from "@/lib/services/QuestionnaireParserService";
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

    // Get column mapping from body or questionnaire
    let mapping = questionnaire.columnMapping as {
      questionCol?: string;
    } | null;
    if (!mapping) {
      const body = await req.json().catch(() => ({}));
      mapping = body.columnMapping || { questionCol: "B" };
    }

    const result = await parseQuestionnaire(
      questionnaire.id,
      questionnaire.filePath,
      { questionCol: mapping?.questionCol || "B" },
    );

    return NextResponse.json({
      message: "Parsing complete",
      questionCount: result.questionCount,
    });
  },
  { rateLimit: RATE_LIMITS.expensive },
);
