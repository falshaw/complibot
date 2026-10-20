import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/apiHandler";
import prisma from "@/lib/prisma";

const rejectSchema = z.object({
  reviewNote: z.string().max(1000).optional(),
});

export const POST = apiHandler(
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
        status: "REJECTED",
        reviewNote: body.reviewNote,
        reviewedById: user.id,
      },
    });

    return NextResponse.json(answer);
  },
  { schema: rejectSchema },
);
