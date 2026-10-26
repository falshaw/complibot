/**
 * CompliBot - dashboard data, read straight from the database.
 * Every number on the dashboard comes from here; nothing is estimated.
 */

import prisma from "@/lib/prisma";
import { COVERAGE_DOMAINS, LEVEL_MIN, coverageScore, domainsWithEntries } from "@/lib/coverage";

/** Below this many KB entries a domain counts as thin (see coverage.ts). */
export const COVERED_MIN_ENTRIES = LEVEL_MIN.adequate;

export interface DashboardData {
  organizationName: string;
  threshold: number;
  questionnaires: {
    id: string;
    name: string;
    fileName: string | null;
    template: string | null;
    status: string;
    totalQuestions: number;
    approvedCount: number;
  }[];
  questionnaireCount: number;
  answers: { total: number; awaiting: number; flagged: number; approved: number };
  awaiting: {
    answerId: string;
    questionnaireId: string;
    questionnaireName: string;
    rowIndex: number;
    /** 1-based position in the questionnaire, the number the review page shows */
    number: number;
    questionText: string;
    domain: string;
    confidence: number;
    status: string;
    sourceCount: number;
    edited: boolean;
  }[];
  kb: {
    total: number;
    verified: number;
    addedThisWeek: number;
    coverageScore: number;
    domainsWithEntries: number;
    thinDomains: number;
    totalDomains: number;
    perDomain: { domain: string; count: number }[];
  };
}

export async function getDashboardData(
  organizationId: string,
): Promise<DashboardData> {
  const inOrg = { question: { questionnaire: { organizationId } } };
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    org,
    questionnaires,
    questionnaireCount,
    answerGroups,
    awaiting,
    kbTotal,
    kbVerified,
    kbWeek,
    domainGroups,
  ] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, confidenceThreshold: true },
    }),
    prisma.questionnaire.findMany({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: {
        id: true,
        name: true,
        fileName: true,
        status: true,
        totalQuestions: true,
        approvedCount: true,
        metadata: true,
      },
    }),
    prisma.questionnaire.count({ where: { organizationId } }),
    prisma.answer.groupBy({
      by: ["status"],
      where: inOrg,
      _count: { _all: true },
    }),
    prisma.answer.findMany({
      where: { ...inOrg, status: { in: ["PENDING", "FLAGGED"] } },
      orderBy: [{ confidence: "asc" }, { updatedAt: "desc" }],
      take: 5,
      select: {
        id: true,
        confidence: true,
        status: true,
        editedContent: true,
        _count: { select: { sources: true } },
        question: {
          select: {
            rowIndex: true,
            questionnaireId: true,
            questionText: true,
            domain: true,
            questionnaire: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.knowledgeEntry.count({ where: { organizationId } }),
    prisma.knowledgeEntry.count({ where: { organizationId, isVerified: true } }),
    prisma.knowledgeEntry.count({
      where: { organizationId, createdAt: { gte: weekAgo } },
    }),
    prisma.knowledgeEntry.groupBy({
      by: ["domain"],
      where: { organizationId },
      _count: { _all: true },
    }),
  ]);

  // The review page numbers questions 1..n in row order; show the same number here
  const numbers = await Promise.all(
    awaiting.map(
      (a) =>
        prisma.question
          .count({
            where: { questionnaireId: a.question.questionnaireId, rowIndex: { lt: a.question.rowIndex } },
          })
          .then((before) => before + 1),
    ),
  );

  const byStatus = Object.fromEntries(
    answerGroups.map((g) => [g.status, g._count._all]),
  ) as Record<string, number>;
  const counts = Object.fromEntries(
    domainGroups.map((g) => [g.domain, g._count._all]),
  ) as Record<string, number>;

  const perDomain = COVERAGE_DOMAINS.map((domain) => ({
    domain,
    count: counts[domain] ?? 0,
  }));

  return {
    organizationName: org?.name ?? "",
    threshold: org?.confidenceThreshold ?? 0.8,
    questionnaires: questionnaires.map((q) => {
      const meta = (q.metadata ?? {}) as { framework?: string; templateName?: string };
      return {
        id: q.id,
        name: q.name,
        fileName: q.fileName,
        template: meta.framework ?? meta.templateName ?? null,
        status: q.status,
        totalQuestions: q.totalQuestions,
        approvedCount: q.approvedCount,
      };
    }),
    questionnaireCount,
    answers: {
      total: Object.values(byStatus).reduce((a, b) => a + b, 0),
      awaiting: (byStatus.PENDING ?? 0) + (byStatus.FLAGGED ?? 0),
      flagged: byStatus.FLAGGED ?? 0,
      approved: byStatus.APPROVED ?? 0,
    },
    awaiting: awaiting.map((a, i) => ({
      answerId: a.id,
      questionnaireId: a.question.questionnaire.id,
      questionnaireName: a.question.questionnaire.name,
      rowIndex: a.question.rowIndex,
      number: numbers[i],
      questionText: a.question.questionText,
      domain: a.question.domain,
      confidence: a.confidence,
      status: a.status,
      sourceCount: a._count.sources,
      edited: !!a.editedContent,
    })),
    kb: {
      total: kbTotal,
      verified: kbVerified,
      addedThisWeek: kbWeek,
      coverageScore: coverageScore(counts),
      domainsWithEntries: domainsWithEntries(counts),
      thinDomains: perDomain.filter((d) => d.count < COVERED_MIN_ENTRIES).length,
      totalDomains: COVERAGE_DOMAINS.length,
      perDomain,
    },
  };
}
