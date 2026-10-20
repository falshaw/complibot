import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/apiHandler";
import prisma from "@/lib/prisma";
import { generateQuestionnaireAnswers } from "@/lib/services/AnswerGenerationService";
import { RATE_LIMITS } from "@/lib/rateLimit";

// POST /api/questionnaires/[id]/generate - Trigger AI answer generation
export const POST = apiHandler(
  async ({ params, organizationId }) => {
    const questionnaire = await prisma.questionnaire.findUnique({
      where: { id: params.id, organizationId },
    });

    if (!questionnaire) {
      return NextResponse.json(
        { error: "Questionnaire not found" },
        { status: 404 },
      );
    }

    if (questionnaire.status !== "PARSED") {
      return NextResponse.json(
        {
          error: `Questionnaire must be in PARSED status (current: ${questionnaire.status})`,
        },
        { status: 400 },
      );
    }

    const result = await generateQuestionnaireAnswers(
      questionnaire.id,
      organizationId,
    );

    return NextResponse.json({
      message: "Answer generation complete",
      generated: result.generated,
      errors: result.errors,
    });
  },
  { rateLimit: RATE_LIMITS.ai },
);
