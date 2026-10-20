import { describe, it, expect } from "vitest";

/**
 * Unit tests for questionnaire parser utilities.
 * Tests column mapping, keyword extraction, and question type detection.
 */

// Extracted utility functions for testability
function columnLetterToNumber(letter: string): number {
  let num = 0;
  for (let i = 0; i < letter.length; i++) {
    num = num * 26 + (letter.charCodeAt(i) - 64);
  }
  return num;
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "can",
    "shall",
    "to",
    "of",
    "in",
    "for",
    "on",
    "with",
    "at",
    "by",
    "from",
    "as",
    "into",
    "through",
    "during",
    "before",
    "after",
    "above",
    "below",
    "between",
    "under",
    "again",
    "further",
    "then",
    "once",
    "here",
    "there",
    "when",
    "where",
    "why",
    "how",
    "all",
    "each",
    "every",
    "both",
    "few",
    "more",
    "most",
    "other",
    "some",
    "such",
    "no",
    "nor",
    "not",
    "only",
    "own",
    "same",
    "so",
    "than",
    "too",
    "very",
    "just",
    "because",
    "but",
    "and",
    "or",
    "if",
    "while",
    "that",
    "this",
    "these",
    "those",
    "what",
    "which",
    "who",
    "your",
    "you",
    "we",
    "our",
    "their",
    "its",
    "it",
    "my",
    "me",
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w))
    .slice(0, 10);
}

function detectQuestionType(text: string): string {
  const lower = text.toLowerCase();
  if (
    /^(do you|does your|is there|are there|have you|has your|can you|will you)/i.test(
      lower,
    )
  )
    return "YES_NO";
  if (/please (provide|attach|upload|share|include)/i.test(lower))
    return "EVIDENCE";
  if (/\b(date|when|how long|timeline)\b/i.test(lower)) return "DATE";
  if (/\b(how many|number of|count|percentage|frequency)\b/i.test(lower))
    return "NUMERIC";
  if (/\b(select|choose|which of the following)\b/i.test(lower))
    return "MULTIPLE_CHOICE";
  return "FREE_TEXT";
}

describe("Column Letter to Number", () => {
  it("converts single letters correctly", () => {
    expect(columnLetterToNumber("A")).toBe(1);
    expect(columnLetterToNumber("B")).toBe(2);
    expect(columnLetterToNumber("Z")).toBe(26);
  });

  it("converts double letters correctly", () => {
    expect(columnLetterToNumber("AA")).toBe(27);
    expect(columnLetterToNumber("AB")).toBe(28);
    expect(columnLetterToNumber("AZ")).toBe(52);
    expect(columnLetterToNumber("BA")).toBe(53);
  });
});

describe("Keyword Extraction", () => {
  it("extracts meaningful words", () => {
    const keywords = extractKeywords(
      "Do you encrypt data at rest using AES-256?",
    );
    expect(keywords).toContain("encrypt");
    expect(keywords).toContain("data");
    expect(keywords).toContain("rest");
    expect(keywords).toContain("aes-256");
  });

  it("filters stop words", () => {
    const keywords = extractKeywords(
      "What is your policy for the management of access controls?",
    );
    expect(keywords).not.toContain("is");
    expect(keywords).not.toContain("your");
    expect(keywords).not.toContain("for");
    expect(keywords).not.toContain("the");
    expect(keywords).toContain("policy");
    expect(keywords).toContain("management");
    expect(keywords).toContain("access");
    expect(keywords).toContain("controls");
  });

  it("limits to 10 keywords", () => {
    const longText =
      "encryption authentication authorization access control vulnerability management incident response business continuity disaster recovery change management logging monitoring compliance privacy governance";
    const keywords = extractKeywords(longText);
    expect(keywords.length).toBeLessThanOrEqual(10);
  });

  it("filters short words", () => {
    const keywords = extractKeywords("Do we use IT or AI for DR?");
    expect(keywords).not.toContain("we");
    expect(keywords).not.toContain("it");
    expect(keywords).not.toContain("or");
  });
});

describe("Question Type Detection", () => {
  it("detects YES_NO questions", () => {
    expect(detectQuestionType("Do you encrypt data at rest?")).toBe("YES_NO");
    expect(detectQuestionType("Does your organization have an IR plan?")).toBe(
      "YES_NO",
    );
    expect(detectQuestionType("Is there a formal security policy?")).toBe(
      "YES_NO",
    );
    expect(detectQuestionType("Have you implemented MFA?")).toBe("YES_NO");
  });

  it("detects EVIDENCE questions", () => {
    expect(detectQuestionType("Please provide your SOC 2 report")).toBe(
      "EVIDENCE",
    );
    expect(
      detectQuestionType("Please attach the latest penetration test results"),
    ).toBe("EVIDENCE");
  });

  it("detects DATE questions", () => {
    expect(detectQuestionType("When was your last security audit?")).toBe(
      "DATE",
    );
    expect(
      detectQuestionType("What is the date of your most recent pen test?"),
    ).toBe("DATE");
  });

  it("detects NUMERIC questions", () => {
    expect(
      detectQuestionType("How many employees have access to production?"),
    ).toBe("NUMERIC");
    expect(detectQuestionType("What is the number of data centers?")).toBe(
      "NUMERIC",
    );
  });

  it("detects MULTIPLE_CHOICE questions", () => {
    expect(
      detectQuestionType("Which of the following certifications do you hold?"),
    ).toBe("MULTIPLE_CHOICE");
    expect(detectQuestionType("Select all applicable controls")).toBe(
      "MULTIPLE_CHOICE",
    );
  });

  it("defaults to FREE_TEXT", () => {
    expect(detectQuestionType("Describe your security architecture")).toBe(
      "FREE_TEXT",
    );
    expect(
      detectQuestionType("Explain how you handle data classification"),
    ).toBe("FREE_TEXT");
  });
});
