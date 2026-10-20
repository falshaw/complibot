import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { apiHandler } from "@/lib/apiHandler";
import prisma from "@/lib/prisma";
import { generateQuestionnaireAnswers } from "@/lib/services/AnswerGenerationService";
import { canStartGeneration } from "@/lib/services/generationGate";
import { RATE_LIMITS } from "@/lib/rateLimit";

// POST /api/questionnaires/[id]/generate - Trigger AI answer generation
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

    if (questionnaire.totalQuestions === 0) {
      return NextResponse.json(
        { error: "Questionnaire has no questions. Parse it first." },
        { status: 400 },
      );
    }

    if (!canStartGeneration(questionnaire)) {
      return NextResponse.json(
        {
          error:
            questionnaire.status === "GENERATING"
              ? "Answers are already being generated for this questionnaire."
              : `Nothing to generate (status: ${questionnaire.status}, ${questionnaire.answeredCount}/${questionnaire.totalQuestions} answered).`,
        },
        { status: 409 },
      );
    }

    const result = await generateQuestionnaireAnswers(
      questionnaire.id,
      organizationId,
    );

    await audit({
      organizationId,
      userId: user.id,
      action: "questionnaire.generate",
      entityType: "Questionnaire",
      entityId: questionnaire.id,
      details: { generated: result.generated, errors: result.errors },
      req,
    });

    if (result.generated === 0) {
      return NextResponse.json(
        {
          error:
            `No answers could be generated (${result.errors} failed${result.lastError ? `: ${result.lastError}` : ""}). ` +
            "Check that the LLM provider is reachable and the model in OLLAMA_MODEL is pulled. " +
            "Nothing was saved for these questions, so you can retry.",
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
