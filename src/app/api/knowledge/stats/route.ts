import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/apiHandler";
import prisma from "@/lib/prisma";
import { COVERAGE_DOMAINS, LEVEL_MIN, coverageScore } from "@/lib/coverage";

// GET /api/knowledge/stats - KB coverage metrics
export const GET = apiHandler(async ({ organizationId }) => {
  const [totalEntries, verifiedEntries, domainCounts] = await Promise.all([
    prisma.knowledgeEntry.count({ where: { organizationId } }),
    prisma.knowledgeEntry.count({
      where: { organizationId, isVerified: true },
    }),
    prisma.knowledgeEntry.groupBy({
      by: ["domain"],
      where: { organizationId },
      _count: { id: true },
    }),
  ]);

  const domainCoverage = domainCounts.reduce(
    (acc, d) => {
      acc[d.domain] = d._count.id;
      return acc;
    },
    {} as Record<string, number>,
  );

  return NextResponse.json({
    totalEntries,
    verifiedEntries,
    domainCoverage,
    // domains with at least LEVEL_MIN.adequate entries; percent = coverage.ts score
    coveredDomains: COVERAGE_DOMAINS.filter((d) => (domainCoverage[d] ?? 0) >= LEVEL_MIN.adequate).length,
    totalDomains: COVERAGE_DOMAINS.length,
    coveragePercent: coverageScore(domainCoverage),
  });
});
