import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/apiHandler";
import { rolesFor } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { refreshQuestionnaireCounts } from "@/lib/services/questionnaireCounts";
import { needsEditBeforeApproval } from "@/lib/services/answerQuality";

const bulkApproveSchema = z.object({
  answerIds: z.array(z.string()).min(1).max(500),
});

export const POST = apiHandler(
  async ({ req, body, user, organizationId }) => {
    const found = await prisma.answer.findMany({
      where: {
        id: { in: body.answerIds },
        // Bulk approve is for drafts waiting for a first decision: a rejected
        // or flagged answer needs someone to open it
        status: "PENDING",
        question: { questionnaire: { organizationId } },
      },
      select: {
        id: true,
        content: true,
        editedContent: true,
        _count: { select: { sources: true } },
        question: { select: { questionnaireId: true } },
      },
    });
    // "Not covered" drafts stay open: someone has to write those answers.
    const affected = found.filter(
      (a) => !needsEditBeforeApproval({ ...a, sourceCount: a._count.sources }),
    );
    const skipped = found.length - affected.length;

    const result = await prisma.answer.updateMany({
      where: { id: { in: affected.map((a) => a.id) } },
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
      details: { count: result.count, skipped, questionnaireIds },
      req,
    });

    return NextResponse.json({ approved: result.count, skipped });
  },
  { roles: rolesFor("review"), schema: bulkApproveSchema },
);
