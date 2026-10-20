import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/apiHandler";
import prisma from "@/lib/prisma";

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
  async ({ body, params, user, organizationId }) => {
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
        editedContent: body.editedContent,
        reviewNote: body.reviewNote,
        reviewedById: user.id,
      },
    });

    return NextResponse.json(answer);
  },
  { schema: updateAnswerSchema },
);
