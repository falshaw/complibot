import { describe, it, expect } from "vitest";
import { COVERAGE_DOMAINS, coverageLevel, coverageScore, domainsWithEntries } from "@/lib/coverage";

describe("coverage", () => {
  it("covers the 19 security domains, not General", () => {
    expect(COVERAGE_DOMAINS).toHaveLength(19);
    expect(COVERAGE_DOMAINS).not.toContain("GENERAL");
  });

  it("levels follow the entry count", () => {
    expect([0, 1, 2, 3, 4, 5].map(coverageLevel)).toEqual(["none", "weak", "weak", "adequate", "adequate", "strong"]);
  });

  it("is not 0% for a small knowledge base spread over many domains", () => {
    // the demo: 10 entries, one or two per domain
    const demo = { ENCRYPTION: 2, ACCESS_CONTROL: 2, AUTHENTICATION: 1, INCIDENT_RESPONSE: 1, BUSINESS_CONTINUITY: 1, VULNERABILITY_MANAGEMENT: 1, LOGGING_MONITORING: 1, COMPLIANCE: 1 };
    expect(domainsWithEntries(demo)).toBe(8);
    expect(coverageScore(demo)).toBe(Math.round((8 * 30) / 19));
  });

  it("ignores General entries and reaches 100 only when every domain is strong", () => {
    expect(coverageScore({ GENERAL: 50 })).toBe(0);
    expect(coverageScore(Object.fromEntries(COVERAGE_DOMAINS.map((d) => [d, 5])))).toBe(100);
  });
});
