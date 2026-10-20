import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/apiHandler";
import prisma from "@/lib/prisma";
import { generateAnswer } from "@/lib/services/AnswerGenerationService";
import { checkPlanLimit, incrementUsage } from "@/lib/billing";
import { RATE_LIMITS } from "@/lib/rateLimit";

export const POST = apiHandler(
  async ({ params, organizationId }) => {
    const existingAnswer = await prisma.answer.findFirst({
      where: {
        id: params.id,
        question: { questionnaire: { organizationId } },
      },
      include: { question: true },
    });

    if (!existingAnswer) {
      return NextResponse.json({ error: "Answer not found" }, { status: 404 });
    }

    // Enforce the plan's monthly AI-generation quota.
    const limit = await checkPlanLimit(organizationId, "aiGenerationsPerMonth");
    if (!limit.allowed) {
      return NextResponse.json({ error: limit.reason }, { status: 403 });
    }

    const { content, confidence, sourceIds } = await generateAnswer(
      existingAnswer.questionId,
      organizationId,
    );

    // Update existing answer
    const answer = await prisma.answer.update({
      where: { id: params.id },
      data: {
        content,
        confidence,
        status: "PENDING",
        editedContent: null,
        reviewNote: null,
      },
    });

    // Replace source attributions
    await prisma.answerSource.deleteMany({ where: { answerId: params.id } });
    if (sourceIds.length > 0) {
      await prisma.answerSource.createMany({
        data: sourceIds.map((s, i) => ({
          answerId: params.id,
          knowledgeEntryId: s.id,
          similarity: s.similarity,
          rank: i,
        })),
      });
    }

    // Count the successful generation against the monthly quota.
    await incrementUsage(organizationId, "ai_generations", 1);

    return NextResponse.json(answer);
  },
  { rateLimit: RATE_LIMITS.ai },
);
