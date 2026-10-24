import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { apiHandler } from "@/lib/apiHandler";
import { rolesFor } from "@/lib/permissions";
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
                      isVerified: true,
                      source: { select: { name: true, sourceType: true } },
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
// Removes the questionnaire with its questions, answers and citations (by
// cascade) and its export records, in one transaction, then the stored files.
export const DELETE = apiHandler(
  async ({ req, params, user, organizationId }) => {
    const questionnaire = await prisma.questionnaire.findUnique({
      where: { id: params.id, organizationId },
      include: {
        exports: { select: { filePath: true } },
        _count: { select: { questions: true } },
      },
    });

    if (!questionnaire) {
      return NextResponse.json(
        { error: "Questionnaire not found" },
        { status: 404 },
      );
    }

    const answers = await prisma.answer.count({
      where: { question: { questionnaireId: params.id } },
    });

    await prisma.$transaction([
      prisma.questionnaireExport.deleteMany({
        where: { questionnaireId: params.id },
      }),
      prisma.questionnaire.delete({ where: { id: params.id } }),
    ]);

    await removeStoredFiles([
      questionnaire.filePath,
      ...questionnaire.exports.map((e) => e.filePath),
    ]);

    await audit({
      organizationId,
      userId: user.id,
      action: "questionnaire.delete",
      entityType: "Questionnaire",
      entityId: params.id,
      details: {
        name: questionnaire.name,
        questions: questionnaire._count.questions,
        answers,
        exports: questionnaire.exports.length,
      },
      req,
    });

    return NextResponse.json({ message: "Deleted" });
  },
  { roles: rolesFor("admin") },
);

/** Best effort: only files inside the uploads directory are removed. */
async function removeStoredFiles(paths: Array<string | null>) {
  const root = path.resolve(process.cwd(), "uploads") + path.sep;
  for (const p of paths) {
    if (!p) continue;
    const resolved = path.resolve(p);
    if (!resolved.startsWith(root)) continue;
    await fs.unlink(resolved).catch(() => undefined);
  }
}
