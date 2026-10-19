/**
 * Answer-quality metrics for the accuracy benchmark — pure, no I/O.
 *
 * Computes lexical token-F1, yes/no polarity accuracy, per-domain breakdown,
 * and confidence calibration (does the model's confidence track answer quality?).
 *
 * IMPORTANT: token-F1 is a LEXICAL PROXY, not semantic ground truth. Use it to
 * track relative improvement and spot weak domains. For a number you publish
 * ("X% accurate"), confirm a sample with human or LLM-judge review — do not ship
 * a marketing claim on lexical overlap alone.
 *
 * Tested in src/test/lib/benchmark-score.test.ts.
 */

export interface BenchmarkItem {
  id: string;
  question: string;
  domain?: string;
  /** The trusted / gold answer. */
  reference: string;
  /** The AI-generated answer. */
  predicted: string;
  /** 0..1 confidence from the model, if available. */
  confidence?: number;
}

const STOP = new Set([
  "the", "a", "an", "is", "are", "of", "to", "and", "or", "in", "on", "for",
  "with", "we", "our", "that", "this", "it", "as", "by", "be", "do", "does",
]);

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOP.has(w));
}

/** Token-overlap F1 between predicted and reference (0..1). */
export function tokenF1(predicted: string, reference: string): number {
  const p = tokenize(predicted);
  const r = tokenize(reference);
  if (p.length === 0 && r.length === 0) return 1;
  if (p.length === 0 || r.length === 0) return 0;

  const rCounts = new Map<string, number>();
  for (const t of r) rCounts.set(t, (rCounts.get(t) ?? 0) + 1);

  const pCounts = new Map<string, number>();
  for (const t of p) pCounts.set(t, (pCounts.get(t) ?? 0) + 1);

  let overlap = 0;
  for (const [t, c] of pCounts) overlap += Math.min(c, rCounts.get(t) ?? 0);

  const precision = overlap / p.length;
  const recall = overlap / r.length;
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

/** Canonical polarity of a yes/no/partial answer, or null if not polar. */
export function polarity(s: string): "yes" | "no" | "partial" | null {
  const t = s.trim().toLowerCase();
  if (/^(partial|partially|in progress|planned)\b/.test(t)) return "partial";
  if (/^(yes|y|true|compliant|implemented|in place)\b/.test(t)) return "yes";
  if (/^(no|n|false|not|none|n\/a)\b/.test(t)) return "no";
  return null;
}

export interface BenchmarkReport {
  count: number;
  meanF1: number;
  threshold: number;
  aboveThresholdRate: number;
  polarAccuracy: number | null;
  polarCount: number;
  perDomain: Record<string, { count: number; meanF1: number }>;
  confidenceCalibration: { bucket: string; count: number; meanF1: number }[];
}

const round = (x: number, dp = 3) => Math.round(x * 10 ** dp) / 10 ** dp;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function scoreSet(items: BenchmarkItem[], threshold = 0.5): BenchmarkReport {
  const f1s = items.map((it) => tokenF1(it.predicted, it.reference));

  let polarCount = 0;
  let polarHit = 0;
  for (const it of items) {
    const ref = polarity(it.reference);
    if (ref) {
      polarCount++;
      if (polarity(it.predicted) === ref) polarHit++;
    }
  }

  const byDomain = new Map<string, number[]>();
  items.forEach((it, i) => {
    const d = it.domain ?? "UNSPECIFIED";
    if (!byDomain.has(d)) byDomain.set(d, []);
    byDomain.get(d)!.push(f1s[i]);
  });
  const perDomain: Record<string, { count: number; meanF1: number }> = {};
  for (const [d, arr] of byDomain) {
    perDomain[d] = { count: arr.length, meanF1: round(mean(arr)) };
  }

  const buckets = [
    { bucket: "0.0-0.5", lo: 0, hi: 0.5, f: [] as number[] },
    { bucket: "0.5-0.8", lo: 0.5, hi: 0.8, f: [] as number[] },
    { bucket: "0.8-1.0", lo: 0.8, hi: 1.01, f: [] as number[] },
  ];
  items.forEach((it, i) => {
    if (typeof it.confidence === "number") {
      const b = buckets.find((bk) => it.confidence! >= bk.lo && it.confidence! < bk.hi);
      if (b) b.f.push(f1s[i]);
    }
  });

  return {
    count: items.length,
    meanF1: round(mean(f1s)),
    threshold,
    aboveThresholdRate: round(
      items.length ? f1s.filter((x) => x >= threshold).length / items.length : 0,
    ),
    polarAccuracy: polarCount ? round(polarHit / polarCount) : null,
    polarCount,
    perDomain,
    confidenceCalibration: buckets
      .filter((b) => b.f.length > 0)
      .map((b) => ({ bucket: b.bucket, count: b.f.length, meanF1: round(mean(b.f)) })),
  };
}
