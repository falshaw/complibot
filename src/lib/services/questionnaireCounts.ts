/**
 * CompliBot - keep a questionnaire's denormalised counters in step with its
 * answers after any review action (approve, reject, bulk approve, regenerate).
 */

import prisma from "@/lib/prisma";

export async function refreshQuestionnaireCounts(
  questionnaireId: string,
): Promise<{ answeredCount: number; approvedCount: number; rejectedCount: number }> {
  const inQ = { question: { questionnaireId } };
  const [answeredCount, approvedCount, rejectedCount] = await Promise.all([
    prisma.question.count({ where: { questionnaireId, answers: { some: {} } } }),
    prisma.answer.count({ where: { ...inQ, status: "APPROVED" } }),
    prisma.answer.count({ where: { ...inQ, status: "REJECTED" } }),
  ]);
  const counts = { answeredCount, approvedCount, rejectedCount };
  await prisma.questionnaire.update({
    where: { id: questionnaireId },
    data: counts,
  });
  return counts;
}
