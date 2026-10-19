import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/apiHandler";
import prisma from "@/lib/prisma";

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

  const allDomains = [
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
    "GENERAL",
  ];

  const coveredDomains = allDomains.filter(
    (d) => (domainCoverage[d] || 0) >= 3,
  );

  return NextResponse.json({
    totalEntries,
    verifiedEntries,
    domainCoverage,
    coveredDomains: coveredDomains.length,
    totalDomains: allDomains.length,
    coveragePercent: Math.round(
      (coveredDomains.length / allDomains.length) * 100,
    ),
  });
});
