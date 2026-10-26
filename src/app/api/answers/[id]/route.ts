import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/apiHandler";
import { rolesFor } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { refreshQuestionnaireCounts } from "@/lib/services/questionnaireCounts";

const updateAnswerSchema = z.object({
  editedContent: z.string().min(1).max(10000).optional(),
  reviewNote: z.string().max(1000).optional(),
});

// GET /api/answers/[id]
export const GET = apiHandler(async ({ params, organizationId }) => {
  const answer = await prisma.answer.findFirst({
    where: {
      id: params.id,
      question: { questionnaire: { organizationId } },
    },
    include: {
      question: true,
      sources: {
        include: { knowledgeEntry: true },
        orderBy: { rank: "asc" },
      },
    },
  });

  if (!answer) {
    return NextResponse.json({ error: "Answer not found" }, { status: 404 });
  }

  return NextResponse.json(answer);
});

// PATCH /api/answers/[id] - Edit answer
export const PATCH = apiHandler(
  async ({ req, body, params, user, organizationId }) => {
    const existing = await prisma.answer.findFirst({
      where: {
        id: params.id,
        question: { questionnaire: { organizationId } },
      },
      select: {
        id: true,
        status: true,
        content: true,
        editedContent: true,
        question: { select: { questionnaireId: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Answer not found" }, { status: 404 });
    }

    // Changed text is a new answer: it goes back to review, whatever the
    // old text's decision was.
    const answer = await prisma.answer.update({
      where: { id: params.id },
      data: {
        editedContent: body.editedContent,
        reviewNote: body.reviewNote,
        reviewedById: user.id,
        ...(body.editedContent !== undefined && { status: "PENDING" }),
      },
    });
    if (body.editedContent !== undefined) {
      await refreshQuestionnaireCounts(existing.question.questionnaireId);
    }

    await audit({
      organizationId,
      userId: user.id,
      action: "answer.edit",
      entityType: "Answer",
      entityId: answer.id,
      // What the text was before, and whether an approval was undone
      details: {
        statusBefore: existing.status,
        statusAfter: answer.status,
        ...(body.editedContent !== undefined && {
          previousText: (existing.editedContent ?? existing.content).slice(0, 1000),
        }),
        ...(body.reviewNote !== undefined && { reviewNote: body.reviewNote.slice(0, 200) }),
      },
      req,
    });

    return NextResponse.json(answer);
  },
  { roles: rolesFor("draft"), schema: updateAnswerSchema },
);
