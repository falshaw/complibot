import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/apiHandler";
import prisma from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { refreshQuestionnaireCounts } from "@/lib/services/questionnaireCounts";

const rejectSchema = z.object({
  reviewNote: z.string().max(1000).optional(),
});

export const POST = apiHandler(
  async ({ req, body, params, user, organizationId }) => {
    const existing = await prisma.answer.findFirst({
      where: {
        id: params.id,
        question: { questionnaire: { organizationId } },
      },
      select: { id: true, question: { select: { questionnaireId: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: "Answer not found" }, { status: 404 });
    }

    const answer = await prisma.answer.update({
      where: { id: params.id },
      data: {
        status: "REJECTED",
        reviewNote: body.reviewNote,
        reviewedById: user.id,
      },
    });

    await refreshQuestionnaireCounts(existing.question.questionnaireId);
    await audit({
      organizationId,
      userId: user.id,
      action: "answer.reject",
      entityType: "Answer",
      entityId: answer.id,
      details: { questionnaireId: existing.question.questionnaireId },
      req,
    });

    return NextResponse.json(answer);
  },
  { schema: rejectSchema },
);
