/**
 * CompliBot - Knowledge Gap Analysis API (CB-07)
 * Where the knowledge base is thin, and where that hurts: domains the
 * questionnaires ask about but the knowledge base barely covers.
 */

import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/apiHandler";
import prisma from "@/lib/prisma";
import { COVERAGE_DOMAINS, LEVEL_MIN, coverageLevel, coverageScore } from "@/lib/coverage";
import { domainLabel } from "@/lib/ui/labels";

const list = (labels: string[], max = 3) =>
  labels.slice(0, max).join(", ") + (labels.length > max ? ` (+${labels.length - max} more)` : "");

// GET /api/knowledge/gap-analysis
export const GET = apiHandler(async ({ organizationId }) => {
  const [domainCounts, verifiedCounts, asked, answers] = await Promise.all([
    prisma.knowledgeEntry.groupBy({
      by: ["domain"],
      where: { organizationId },
      _count: { id: true },
    }),
    prisma.knowledgeEntry.groupBy({
      by: ["domain"],
      where: { organizationId, isVerified: true },
      _count: { id: true },
    }),
    prisma.question.groupBy({
      by: ["domain"],
      where: { questionnaire: { organizationId } },
      _count: { id: true },
    }),
    // Confidence of the drafts the knowledge base actually produced
    prisma.answer.findMany({
      where: { question: { questionnaire: { organizationId } } },
      select: { confidence: true, question: { select: { domain: true } } },
    }),
  ]);

  const counts = Object.fromEntries(domainCounts.map((d) => [d.domain, d._count.id])) as Record<string, number>;
  const verifiedMap = new Map(verifiedCounts.map((d) => [d.domain, d._count.id]));
  const askedMap = new Map(asked.map((d) => [d.domain, d._count.id]));
  const draftConf = new Map<string, number[]>();
  for (const a of answers) {
    const list = draftConf.get(a.question.domain) ?? [];
    list.push(a.confidence);
    draftConf.set(a.question.domain, list);
  }

  const domains = COVERAGE_DOMAINS.map((domain) => {
    const entries = counts[domain] ?? 0;
    const verified = verifiedMap.get(domain) ?? 0;
    const questionsAsked = askedMap.get(domain) ?? 0;
    const confs = draftConf.get(domain) ?? [];
    // null = no drafts yet in this domain, nothing measured
    const confidence = confs.length
      ? Math.round((confs.reduce((s, c) => s + c, 0) / confs.length) * 100)
      : null;

    // Gap score 0-100: few entries weigh most, then weak drafts and missing
    // verification; domains the questionnaires ask about count double.
    const entryGap = Math.max(0, 1 - entries / LEVEL_MIN.strong);
    const verifyGap = entries > 0 ? 1 - verified / entries : 1;
    const draftGap = confidence === null ? entryGap : 1 - confidence / 100;
    const demand = questionsAsked > 0 ? 1 : 0.5;
    const gapScore = Math.round((entryGap * 0.6 + draftGap * 0.25 + verifyGap * 0.15) * demand * 100);

    return {
      domain,
      label: domainLabel(domain),
      entries,
      verified,
      confidence,
      questionsAsked,
      coverage: coverageLevel(entries),
      gapScore,
    };
  });

  const gaps = domains.filter((d) => d.gapScore > 30).sort((a, b) => b.gapScore - a.gapScore);
  const by = (level: string) => domains.filter((d) => d.coverage === level);

  const recommendations: string[] = [];
  const askedButThin = domains
    .filter((d) => d.questionsAsked > 0 && d.entries < LEVEL_MIN.adequate)
    .sort((a, b) => b.questionsAsked - a.questionsAsked);
  if (askedButThin.length > 0) {
    recommendations.push(
      `Asked in your questionnaires but with fewer than ${LEVEL_MIN.adequate} entries: ${list(askedButThin.map((d) => d.label))}. Fill these first.`,
    );
  }
  const empty = by("none").filter((d) => d.questionsAsked === 0);
  if (empty.length > 0) {
    recommendations.push(
      `No entries yet for ${empty.length} ${empty.length === 1 ? "domain" : "domains"}: ${list(empty.map((d) => d.label))}. The AI interview walks through them.`,
    );
  }
  const unverified = domains.filter((d) => d.entries > 0 && d.verified === 0);
  if (unverified.length > 0) {
    recommendations.push(`Entries nobody has verified yet: ${list(unverified.map((d) => d.label))}.`);
  }

  return NextResponse.json({
    overallScore: coverageScore(counts),
    totalEntries: Object.values(counts).reduce((s, v) => s + v, 0),
    summary: {
      strong: by("strong").length,
      adequate: by("adequate").length,
      weak: by("weak").length,
      none: by("none").length,
    },
    domains,
    gaps,
    recommendations,
  });
});
