/**
 * CompliBot - Knowledge Gap Analysis API (CB-07)
 * Analyze domain coverage in the KB and identify gaps.
 */

import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/apiHandler";
import prisma from "@/lib/prisma";

const ALL_DOMAINS = [
  "ACCESS_CONTROL",
  "AUTHENTICATION",
  "ENCRYPTION",
  "DATA_PROTECTION",
  "INCIDENT_RESPONSE",
  "NETWORK_SECURITY",
  "CLOUD_SECURITY",
  "PHYSICAL_SECURITY",
  "BUSINESS_CONTINUITY",
  "CHANGE_MANAGEMENT",
  "VULNERABILITY_MANAGEMENT",
  "LOGGING_MONITORING",
  "THIRD_PARTY_RISK",
  "COMPLIANCE",
  "PRIVACY",
  "ENDPOINT_SECURITY",
  "APPLICATION_SECURITY",
  "IDENTITY_MANAGEMENT",
  "GOVERNANCE",
] as const;

// Minimum entries per domain for adequate coverage
const COVERAGE_THRESHOLDS = {
  STRONG: 5,
  ADEQUATE: 3,
  WEAK: 1,
} as const;

// GET /api/knowledge/gap-analysis
export const GET = apiHandler(async ({ organizationId }) => {
  const [domainCounts, verifiedCounts, avgConfidence, recentQuestions] =
    await Promise.all([
      // Count entries per domain
      prisma.knowledgeEntry.groupBy({
        by: ["domain"],
        where: { organizationId },
        _count: { id: true },
      }),
      // Count verified entries per domain
      prisma.knowledgeEntry.groupBy({
        by: ["domain"],
        where: { organizationId, isVerified: true },
        _count: { id: true },
      }),
      // Average confidence per domain
      prisma.knowledgeEntry.groupBy({
        by: ["domain"],
        where: { organizationId },
        _avg: { confidence: true },
      }),
      // Questions asked per domain (from questionnaires) to show demand
      prisma.question.groupBy({
        by: ["domain"],
        where: {
          questionnaire: { organizationId },
        },
        _count: { id: true },
      }),
    ]);

  // Build count maps
  const countMap = new Map(domainCounts.map((d) => [d.domain, d._count.id]));
  const verifiedMap = new Map(
    verifiedCounts.map((d) => [d.domain, d._count.id]),
  );
  const confidenceMap = new Map(
    avgConfidence.map((d) => [d.domain, d._avg.confidence || 0]),
  );
  const demandMap = new Map(
    recentQuestions.map((d) => [d.domain, d._count.id]),
  );

  // Analyze each domain
  const domains = ALL_DOMAINS.map((domain) => {
    const entries = countMap.get(domain) || 0;
    const verified = verifiedMap.get(domain) || 0;
    const confidence = confidenceMap.get(domain) || 0;
    const questionsAsked = demandMap.get(domain) || 0;

    let coverage: "strong" | "adequate" | "weak" | "none";
    if (entries >= COVERAGE_THRESHOLDS.STRONG) coverage = "strong";
    else if (entries >= COVERAGE_THRESHOLDS.ADEQUATE) coverage = "adequate";
    else if (entries >= COVERAGE_THRESHOLDS.WEAK) coverage = "weak";
    else coverage = "none";

    // Gap score: higher = bigger gap (0-100)
    // Factors: low entries, low verification, low confidence, high demand
    const entryScore = Math.max(0, 1 - entries / COVERAGE_THRESHOLDS.STRONG);
    const verifiedScore = entries > 0 ? 1 - verified / entries : 1;
    const confidenceScore = 1 - confidence;
    const demandFactor = questionsAsked > 0 ? 1 + questionsAsked / 10 : 0.5;

    const gapScore = Math.round(
      ((entryScore * 0.4 + verifiedScore * 0.2 + confidenceScore * 0.4) *
        demandFactor *
        100) /
        1.5,
    );

    return {
      domain,
      label: domain.replace(/_/g, " "),
      entries,
      verified,
      confidence: Math.round(confidence * 100),
      questionsAsked,
      coverage,
      gapScore: Math.min(100, Math.max(0, gapScore)),
    };
  });

  // Sort by gap score descending (biggest gaps first)
  const gaps = domains
    .filter((d) => d.gapScore > 30)
    .sort((a, b) => b.gapScore - a.gapScore);

  // Overall stats
  const totalEntries = Array.from(countMap.values()).reduce((s, v) => s + v, 0);
  const strongDomains = domains.filter((d) => d.coverage === "strong").length;
  const adequateDomains = domains.filter(
    (d) => d.coverage === "adequate",
  ).length;
  const weakDomains = domains.filter((d) => d.coverage === "weak").length;
  const noDomains = domains.filter((d) => d.coverage === "none").length;

  const overallScore = Math.round(
    ((strongDomains * 100 +
      adequateDomains * 70 +
      weakDomains * 30 +
      noDomains * 0) /
      ALL_DOMAINS.length /
      100) *
      100,
  );

  // Recommendations
  const recommendations: string[] = [];
  if (noDomains > 0) {
    const empty = domains
      .filter((d) => d.coverage === "none")
      .map((d) => d.label);
    recommendations.push(
      `No entries for ${empty.length} domain(s): ${empty.slice(0, 3).join(", ")}${empty.length > 3 ? ` (+${empty.length - 3} more)` : ""}. Start an AI interview to fill these gaps.`,
    );
  }
  if (gaps.length > 0) {
    const top = gaps.slice(0, 3).map((g) => g.label);
    recommendations.push(
      `Highest gap domains: ${top.join(", ")}. Upload relevant policies or complete AI interviews for these areas.`,
    );
  }
  const highDemandGaps = domains.filter(
    (d) => d.questionsAsked > 3 && d.entries < 3,
  );
  if (highDemandGaps.length > 0) {
    recommendations.push(
      `${highDemandGaps.length} domain(s) have high question demand but weak KB coverage. Prioritize: ${highDemandGaps.map((d) => d.label).join(", ")}.`,
    );
  }

  return NextResponse.json({
    overallScore,
    totalEntries,
    summary: {
      strong: strongDomains,
      adequate: adequateDomains,
      weak: weakDomains,
      none: noDomains,
    },
    domains,
    gaps,
    recommendations,
  });
});
