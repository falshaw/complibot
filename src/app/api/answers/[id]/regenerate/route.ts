import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/apiHandler";
import prisma from "@/lib/prisma";
import { generateAnswer } from "@/lib/services/AnswerGenerationService";
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

    return NextResponse.json(answer);
  },
  { rateLimit: RATE_LIMITS.ai },
);
