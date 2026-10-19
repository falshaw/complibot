import { describe, it, expect } from "vitest";

/**
 * Unit tests for confidence scoring algorithm.
 * Tests the core formula without requiring OpenAI API calls.
 */

// Extracted confidence scoring logic for testability
function calculateConfidence(
  similarities: number[],
  domainEntryCount: number,
  questionType: string,
): number {
  // Weighted average of top-K similarities
  const weights = [0.4, 0.25, 0.15, 0.1, 0.1];
  let weightedSum = 0;
  let totalWeight = 0;

  for (let i = 0; i < Math.min(similarities.length, weights.length); i++) {
    weightedSum += similarities[i] * weights[i];
    totalWeight += weights[i];
  }

  let confidence = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Exact match bonus
  if (similarities.length > 0 && similarities[0] > 0.92) {
    confidence = Math.min(1, confidence + 0.15);
  }

  // Domain coverage penalty
  if (domainEntryCount < 3) {
    confidence *= 0.7;
  } else if (domainEntryCount < 5) {
    confidence *= 0.85;
  }

  // Question type adjustments
  if (questionType === "YES_NO") {
    confidence = Math.min(1, confidence + 0.05);
  } else if (questionType === "EVIDENCE") {
    confidence *= 0.8;
  }

  return Math.max(0, Math.min(1, confidence));
}

describe("Confidence Scoring", () => {
  it("returns 0 for no similarities", () => {
    expect(calculateConfidence([], 10, "FREE_TEXT")).toBe(0);
  });

  it("calculates weighted average correctly", () => {
    const score = calculateConfidence(
      [0.9, 0.8, 0.7, 0.6, 0.5],
      10,
      "FREE_TEXT",
    );
    // (0.9*0.4 + 0.8*0.25 + 0.7*0.15 + 0.6*0.1 + 0.5*0.1) / 1.0 = 0.775
    expect(score).toBeCloseTo(0.775, 2);
  });

  it("applies exact match bonus when top similarity > 0.92", () => {
    const withExactMatch = calculateConfidence(
      [0.95, 0.8, 0.7],
      10,
      "FREE_TEXT",
    );
    const withoutExactMatch = calculateConfidence(
      [0.9, 0.8, 0.7],
      10,
      "FREE_TEXT",
    );
    expect(withExactMatch).toBeGreaterThan(withoutExactMatch);
  });

  it("applies domain coverage penalty for < 3 entries", () => {
    const poorCoverage = calculateConfidence([0.8, 0.7], 2, "FREE_TEXT");
    const goodCoverage = calculateConfidence([0.8, 0.7], 10, "FREE_TEXT");
    expect(poorCoverage).toBeLessThan(goodCoverage);
    expect(poorCoverage).toBeCloseTo(goodCoverage * 0.7, 2);
  });

  it("applies domain coverage penalty for < 5 entries", () => {
    const medCoverage = calculateConfidence([0.8, 0.7], 4, "FREE_TEXT");
    const goodCoverage = calculateConfidence([0.8, 0.7], 10, "FREE_TEXT");
    expect(medCoverage).toBeCloseTo(goodCoverage * 0.85, 2);
  });

  it("gives YES_NO questions a bonus", () => {
    const yesNo = calculateConfidence([0.8, 0.7], 10, "YES_NO");
    const freeText = calculateConfidence([0.8, 0.7], 10, "FREE_TEXT");
    expect(yesNo).toBeGreaterThan(freeText);
  });

  it("penalizes EVIDENCE questions", () => {
    const evidence = calculateConfidence([0.8, 0.7], 10, "EVIDENCE");
    const freeText = calculateConfidence([0.8, 0.7], 10, "FREE_TEXT");
    expect(evidence).toBeLessThan(freeText);
  });

  it("clamps confidence between 0 and 1", () => {
    const highScore = calculateConfidence(
      [0.99, 0.98, 0.97, 0.96, 0.95],
      20,
      "YES_NO",
    );
    expect(highScore).toBeLessThanOrEqual(1);
    expect(highScore).toBeGreaterThanOrEqual(0);
  });

  it("handles single similarity value", () => {
    const score = calculateConfidence([0.85], 10, "FREE_TEXT");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
