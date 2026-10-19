#!/usr/bin/env tsx
/**
 * CompliBot answer-accuracy benchmark runner.
 *
 *   npx tsx scripts/benchmark.ts <predictions.json> [threshold]
 *
 * <predictions.json> is an array of BenchmarkItem:
 *   { id, question, domain?, reference, predicted, confidence? }
 *
 * Produce it by running real questionnaires through the app, then pairing each
 * AI answer (`predicted`, plus its `confidence`) with the trusted answer
 * (`reference`). See scripts/benchmark-sample.json for the shape.
 *
 * Scoring is lexical (token-F1) — a proxy, not ground truth. Use it to track
 * improvement and find weak domains; confirm any published number with review.
 */
import { readFileSync } from "node:fs";
import { scoreSet, type BenchmarkItem } from "../src/lib/benchmark/score";

const path = process.argv[2];
if (!path) {
  console.error("usage: npx tsx scripts/benchmark.ts <predictions.json> [threshold]");
  process.exit(1);
}
const threshold = process.argv[3] ? Number(process.argv[3]) : 0.5;

let raw: unknown;
try {
  raw = JSON.parse(readFileSync(path, "utf8"));
} catch (e) {
  console.error(`Could not read/parse ${path}: ${(e as Error).message}`);
  process.exit(1);
}
if (!Array.isArray(raw)) {
  console.error("Expected a JSON array of prediction items.");
  process.exit(1);
}

const items = (raw as BenchmarkItem[]).filter(
  (x) =>
    x &&
    typeof x.reference === "string" &&
    typeof x.predicted === "string" &&
    typeof x.id === "string",
);
const skipped = raw.length - items.length;

const r = scoreSet(items, threshold);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

console.log(`\nCompliBot answer benchmark — ${r.count} item(s)${skipped ? ` (${skipped} skipped: missing fields)` : ""}`);
console.log(`  mean token-F1:     ${r.meanF1}`);
console.log(`  F1 >= ${r.threshold}:        ${pct(r.aboveThresholdRate)}`);
if (r.polarAccuracy !== null) {
  console.log(`  yes/no accuracy:   ${pct(r.polarAccuracy)}  (${r.polarCount} polar questions)`);
}
console.log(`  per domain:`);
for (const [d, v] of Object.entries(r.perDomain)) {
  console.log(`    ${d.padEnd(24)} n=${String(v.count).padStart(3)}  F1=${v.meanF1}`);
}
if (r.confidenceCalibration.length) {
  console.log(`  confidence calibration (higher conf should mean higher F1):`);
  for (const b of r.confidenceCalibration) {
    console.log(`    conf ${b.bucket}    n=${String(b.count).padStart(3)}  F1=${b.meanF1}`);
  }
}
console.log(
  `\n  NOTE: token-F1 is a lexical proxy. Before publishing an accuracy number,\n  spot-check a sample by human or LLM-judge review.\n`,
);
