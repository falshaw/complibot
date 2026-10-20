import { describe, it, expect, vi } from "vitest";

/**
 * Questionnaire parser helpers (the real exports, not copies).
 * Question type detection is covered in question-type.test.ts.
 */

vi.mock("@/lib/prisma", () => ({ default: {}, getPool: vi.fn() }));
vi.mock("@/lib/ollama", () => ({
  OLLAMA_MODEL: "test-model",
  ollamaChatWithBreaker: vi.fn(),
}));

import { columnToNumber, extractKeywords } from "@/lib/services/QuestionnaireParserService";

describe("columnToNumber", () => {
  it("converts single letters", () => {
    expect(columnToNumber("A")).toBe(1);
    expect(columnToNumber("B")).toBe(2);
    expect(columnToNumber("Z")).toBe(26);
  });

  it("converts double letters and lower case", () => {
    expect(columnToNumber("AA")).toBe(27);
    expect(columnToNumber("AB")).toBe(28);
    expect(columnToNumber("az")).toBe(52);
    expect(columnToNumber("BA")).toBe(53);
  });
});

describe("extractKeywords", () => {
  it("keeps the meaningful words", () => {
    const keywords = extractKeywords("Do you encrypt data at rest using AES-256?");
    expect(keywords).toEqual(expect.arrayContaining(["encrypt", "data", "rest", "aes-256"]));
  });

  it("drops stop words and words of three letters or fewer", () => {
    const keywords = extractKeywords("What is your policy for the management of access controls?");
    expect(keywords).toEqual(["policy", "management", "access", "controls"]);
    expect(extractKeywords("Do we use IT or AI for DR?")).toEqual([]);
  });

  it("returns at most 10 keywords", () => {
    const longText =
      "encryption authentication authorization access control vulnerability management incident response business continuity disaster recovery";
    expect(extractKeywords(longText)).toHaveLength(10);
  });
});
