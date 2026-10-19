import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/apiHandler";
import prisma from "@/lib/prisma";

const bulkApproveSchema = z.object({
  answerIds: z.array(z.string()).min(1).max(500),
});

export const POST = apiHandler(
  async ({ body, user, organizationId }) => {
    const result = await prisma.answer.updateMany({
      where: {
        id: { in: body.answerIds },
        question: { questionnaire: { organizationId } },
      },
      data: {
        status: "APPROVED",
        reviewedById: user.id,
      },
    });

    return NextResponse.json({ approved: result.count });
  },
  { schema: bulkApproveSchema, roles: ["ADMIN", "REVIEWER"] },
);
