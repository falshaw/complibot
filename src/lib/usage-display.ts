/**
 * CompliBot - Usage display helpers
 *
 * Pure presentation logic for the billing usage dashboard. The billing API
 * returns per-metric { current, limit } where a negative limit means
 * unlimited. These helpers turn that into bar widths, states, and labels.
 * No I/O — unit-tested in src/test/lib/usage-display.test.ts.
 */

export type UsageState = "unlimited" | "ok" | "warn" | "limit";

/** A negative limit (-1) signals an unlimited plan allowance. */
export function isUnlimited(limit: number): boolean {
  return limit < 0;
}

/** Bar fill percentage 0–100. Unlimited → 0 (the UI shows a pill, not a bar). */
export function usagePercent(current: number, limit: number): number {
  if (isUnlimited(limit)) return 0;
  if (limit === 0) return 100;
  return Math.min(100, Math.max(0, Math.round((current / limit) * 100)));
}

/** Drives bar colour and the upgrade prompt. Warn at >=80% of the limit. */
export function usageState(current: number, limit: number): UsageState {
  if (isUnlimited(limit)) return "unlimited";
  if (limit === 0) return "limit";
  if (current >= limit) return "limit";
  if (current / limit >= 0.8) return "warn";
  return "ok";
}

export function formatLimit(limit: number): string {
  return isUnlimited(limit) ? "Unlimited" : String(limit);
}
