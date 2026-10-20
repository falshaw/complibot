import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/apiHandler";
import prisma from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { refreshQuestionnaireCounts } from "@/lib/services/questionnaireCounts";

const bulkApproveSchema = z.object({
  answerIds: z.array(z.string()).min(1).max(500),
});

export const POST = apiHandler(
  async ({ req, body, user, organizationId }) => {
    const where = {
      id: { in: body.answerIds },
      question: { questionnaire: { organizationId } },
    };
    const affected = await prisma.answer.findMany({
      where,
      select: { question: { select: { questionnaireId: true } } },
    });

    const result = await prisma.answer.updateMany({
      where,
      data: {
        status: "APPROVED",
        reviewedById: user.id,
      },
    });

    const questionnaireIds = [
      ...new Set(affected.map((a) => a.question.questionnaireId)),
    ];
    for (const qid of questionnaireIds) await refreshQuestionnaireCounts(qid);
    await audit({
      organizationId,
      userId: user.id,
      action: "answer.bulk_approve",
      entityType: "Answer",
      details: { count: result.count, questionnaireIds },
      req,
    });

    return NextResponse.json({ approved: result.count });
  },
  { schema: bulkApproveSchema, roles: ["ADMIN", "REVIEWER"] },
);
