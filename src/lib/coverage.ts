/**
 * CompliBot - knowledge-base coverage, one definition for every page
 *
 * A domain's level follows its entry count: 5+ strong, 3-4 adequate,
 * 1-2 weak, 0 none. The coverage score weights the levels 100 / 70 / 30 / 0
 * and averages them over the security domains (General is not one).
 * The dashboard and gap analysis both show this score.
 */

import { SECURITY_DOMAINS } from "@/lib/ui/labels";

export const COVERAGE_DOMAINS = SECURITY_DOMAINS.filter((d) => d !== "GENERAL");

export const LEVEL_MIN = { strong: 5, adequate: 3, weak: 1 } as const;
const LEVEL_WEIGHT = { strong: 100, adequate: 70, weak: 30, none: 0 } as const;

export type CoverageLevel = keyof typeof LEVEL_WEIGHT;

export function coverageLevel(entries: number): CoverageLevel {
  if (entries >= LEVEL_MIN.strong) return "strong";
  if (entries >= LEVEL_MIN.adequate) return "adequate";
  if (entries >= LEVEL_MIN.weak) return "weak";
  return "none";
}

/** 0..100 over COVERAGE_DOMAINS; `counts` maps domain -> entry count. */
export function coverageScore(counts: Record<string, number>): number {
  const sum = COVERAGE_DOMAINS.reduce((s, d) => s + LEVEL_WEIGHT[coverageLevel(counts[d] ?? 0)], 0);
  return Math.round(sum / COVERAGE_DOMAINS.length);
}

export function domainsWithEntries(counts: Record<string, number>): number {
  return COVERAGE_DOMAINS.filter((d) => (counts[d] ?? 0) > 0).length;
}
