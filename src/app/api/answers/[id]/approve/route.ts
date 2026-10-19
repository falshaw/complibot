import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/apiHandler";
import prisma from "@/lib/prisma";

export const POST = apiHandler(async ({ params, user, organizationId }) => {
  const existing = await prisma.answer.findFirst({
    where: {
      id: params.id,
      question: { questionnaire: { organizationId } },
    },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Answer not found" }, { status: 404 });
  }

  const answer = await prisma.answer.update({
    where: { id: params.id },
    data: {
      status: "APPROVED",
      reviewedById: user.id,
    },
  });

  // Update questionnaire counts
  const question = await prisma.question.findUnique({
    where: { id: answer.questionId },
  });
  if (question) {
    const approvedCount = await prisma.answer.count({
      where: {
        question: { questionnaireId: question.questionnaireId },
        status: "APPROVED",
      },
    });
    await prisma.questionnaire.update({
      where: { id: question.questionnaireId },
      data: { approvedCount },
    });
  }

  return NextResponse.json(answer);
});
