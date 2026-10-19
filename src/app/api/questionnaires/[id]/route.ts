import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/apiHandler";
import prisma from "@/lib/prisma";

// GET /api/questionnaires/[id] - Get with questions and answers
export const GET = apiHandler(async ({ params, organizationId }) => {
  const questionnaire = await prisma.questionnaire.findUnique({
    where: { id: params.id, organizationId },
    include: {
      questions: {
        orderBy: { rowIndex: "asc" },
        include: {
          answers: {
            orderBy: { updatedAt: "desc" },
            take: 1,
            include: {
              sources: {
                include: {
                  knowledgeEntry: {
                    select: {
                      id: true,
                      question: true,
                      answer: true,
                      domain: true,
                    },
                  },
                },
                orderBy: { rank: "asc" },
              },
            },
          },
        },
      },
    },
  });

  if (!questionnaire) {
    return NextResponse.json(
      { error: "Questionnaire not found" },
      { status: 404 },
    );
  }

  return NextResponse.json(questionnaire);
});

// DELETE /api/questionnaires/[id]
export const DELETE = apiHandler(
  async ({ params, organizationId }) => {
    const questionnaire = await prisma.questionnaire.findUnique({
      where: { id: params.id, organizationId },
    });

    if (!questionnaire) {
      return NextResponse.json(
        { error: "Questionnaire not found" },
        { status: 404 },
      );
    }

    await prisma.questionnaire.delete({ where: { id: params.id } });
    return NextResponse.json({ message: "Deleted" });
  },
  { roles: ["ADMIN", "RESPONDER"] },
);
