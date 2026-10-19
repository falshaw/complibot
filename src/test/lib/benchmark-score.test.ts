import { describe, it, expect } from "vitest";
import {
  tokenize,
  tokenF1,
  polarity,
  scoreSet,
  type BenchmarkItem,
} from "@/lib/benchmark/score";

describe("tokenize", () => {
  it("lowercases, strips punctuation, drops stopwords", () => {
    expect(tokenize("The cat, SAT! on a mat")).toEqual(["cat", "sat", "mat"]);
  });
});

describe("tokenF1", () => {
  it("is 1 for identical content and 0 for disjoint", () => {
    expect(tokenF1("we encrypt data at rest", "we encrypt data at rest")).toBe(1);
    expect(tokenF1("encryption enabled", "firewalls deployed")).toBe(0);
  });
  it("is between 0 and 1 for partial overlap", () => {
    const f1 = tokenF1("data encrypted at rest", "we encrypt data at rest with aes");
    expect(f1).toBeGreaterThan(0);
    expect(f1).toBeLessThan(1);
  });
  it("treats two empty answers as a match", () => {
    expect(tokenF1("the a an", "of to and")).toBe(1); // all stopwords -> both empty
  });
});

describe("polarity", () => {
  it("classifies yes / no / partial and returns null otherwise", () => {
    expect(polarity("Yes, we do this")).toBe("yes");
    expect(polarity("No.")).toBe("no");
    expect(polarity("Partially implemented")).toBe("partial");
    expect(polarity("We use AES-256 across all stores")).toBeNull();
  });
});

describe("scoreSet", () => {
  const items: BenchmarkItem[] = [
    {
      id: "1",
      question: "Is data encrypted at rest?",
      domain: "ENCRYPTION",
      reference: "Yes, we encrypt data at rest",
      predicted: "Yes, data is encrypted at rest",
      confidence: 0.9,
    },
    {
      id: "2",
      question: "Do you allow shared accounts?",
      domain: "ACCESS_CONTROL",
      reference: "No, we do not allow shared accounts",
      predicted: "Yes, shared accounts are allowed",
      confidence: 0.4,
    },
  ];

  it("aggregates F1, polarity accuracy, domains and calibration", () => {
    const r = scoreSet(items, 0.5);
    expect(r.count).toBe(2);
    expect(r.meanF1).toBeGreaterThanOrEqual(0);
    expect(r.meanF1).toBeLessThanOrEqual(1);
    // item1 polarity yes==yes (hit), item2 no vs yes (miss) -> 0.5 over 2 polar
    expect(r.polarCount).toBe(2);
    expect(r.polarAccuracy).toBe(0.5);
    expect(r.perDomain.ENCRYPTION.count).toBe(1);
    expect(r.perDomain.ACCESS_CONTROL.count).toBe(1);
    // confidence 0.9 -> 0.8-1.0 bucket, 0.4 -> 0.0-0.5 bucket
    const buckets = r.confidenceCalibration.map((b) => b.bucket).sort();
    expect(buckets).toEqual(["0.0-0.5", "0.8-1.0"]);
  });

  it("reports null polarity accuracy when no reference is polar", () => {
    const r = scoreSet([
      { id: "x", question: "q", reference: "We use AES-256", predicted: "AES-256 is used" },
    ]);
    expect(r.polarAccuracy).toBeNull();
    expect(r.polarCount).toBe(0);
  });
});
