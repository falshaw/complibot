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

    if (questionnaire.totalQuestions === 0) {
      return NextResponse.json(
        { error: "Questionnaire has no questions. Parse it first." },
        { status: 400 },
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

    if (result.generated === 0) {
      return NextResponse.json(
        {
          error:
            `No answers could be generated (${result.errors} failed${result.lastError ? `: ${result.lastError}` : ""}). ` +
            "Check that the LLM provider is reachable and the model in OLLAMA_MODEL is pulled. " +
            "The questionnaire is still in PARSED status, so you can retry.",
          generated: 0,
          errors: result.errors,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      message: "Answer generation complete",
      generated: result.generated,
      errors: result.errors,
    });
  },
  { rateLimit: RATE_LIMITS.ai },
);
