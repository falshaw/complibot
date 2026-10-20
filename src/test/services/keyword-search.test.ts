import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEMO_KNOWLEDGE } from "@/lib/demo-knowledge";
import {
  extractSearchTerms,
  rankEntries,
  stem,
} from "@/lib/services/keywordScoring";

/**
 * Retrieval tests against the real demo knowledge base that `npm run db:seed`
 * loads. Regression: "Do you encrypt customer data at rest?" used to get
 * "N/A, no information in the knowledge base" although two encryption
 * entries exist.
 */

const ENTRIES = DEMO_KNOWLEDGE.map((e, i) => ({ id: `kb-${i}`, ...e }));
const AT_REST = ENTRIES.find((e) => e.question === "Do you encrypt data at rest?")!;
const IN_TRANSIT = ENTRIES.find(
  (e) => e.question === "Do you encrypt data in transit?",
)!;
const QUESTION = "Do you encrypt customer data at rest?";

// --- mocks for the DB-backed services ------------------------------------

const findMany = vi.fn();
const chat = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    knowledgeEntry: {
      findMany: (...args: unknown[]) => findMany(...args),
      count: vi.fn(async () => 2),
    },
  },
  getPool: vi.fn(),
}));

vi.mock("@/lib/services/EmbeddingService", () => ({
  embeddingsEnabled: () => false,
  generateEmbedding: vi.fn(),
  semanticSearch: vi.fn(),
  markEmbeddingsUnavailable: vi.fn(),
}));

vi.mock("@/lib/ollama", () => ({
  OLLAMA_MODEL: "test-model",
  ollamaChatWithBreaker: (...args: unknown[]) => chat(...args),
}));

import { hybridSearch, keywordSearch } from "@/lib/services/SearchService";
import { generateAnswer } from "@/lib/services/AnswerGenerationService";

beforeEach(() => {
  findMany.mockReset();
  chat.mockReset();
  // Postgres pre-filter is a broad "contains any term"; hand back every row
  // (worst case for ranking) in an order that puts the encryption entries last.
  findMany.mockImplementation(async () => [...ENTRIES].reverse());
});

describe("extractSearchTerms", () => {
  it("drops stopwords and stems the remaining words", () => {
    expect(extractSearchTerms(QUESTION)).toEqual([
      "encrypt",
      "customer",
      "data",
      "rest",
    ]);
  });

  it("returns nothing for a query made only of stopwords", () => {
    expect(extractSearchTerms("Do you have it?")).toEqual([]);
  });

  it("stems common word forms to the same root", () => {
    expect(stem("encryption")).toBe("encrypt");
    expect(stem("encrypted")).toBe("encrypt");
    expect(stem("encrypts")).toBe("encrypt");
    expect(stem("policies")).toBe(stem("policy"));
    expect(stem("logging")).toBe("log");
    expect(stem("access")).toBe("access");
  });
});

describe("rankEntries", () => {
  it("ranks the two encryption entries first for the encryption question", () => {
    const ranked = rankEntries(QUESTION, ENTRIES, { limit: 5 });
    expect(ranked[0].entry.id).toBe(AT_REST.id);
    expect(ranked[1].entry.id).toBe(IN_TRANSIT.id);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it("sorts by score, highest first", () => {
    const ranked = rankEntries(QUESTION, ENTRIES, { limit: 10 });
    const scores = ranked.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("prefers question (title) hits over answer-only hits", () => {
    const titleHit = {
      id: "t",
      question: "Is customer data encrypted?",
      answer: "Yes.",
      domain: "ENCRYPTION",
      keywords: [],
    };
    const answerHit = {
      id: "a",
      question: "Describe your storage platform",
      answer: "Customer data is encrypted.",
      domain: "GENERAL",
      keywords: [],
    };
    const ranked = rankEntries(QUESTION, [answerHit, titleHit]);
    expect(ranked.map((r) => r.entry.id)).toEqual(["t", "a"]);
  });

  it("uses the classified domain as a boost, never as a filter", () => {
    const ranked = rankEntries(QUESTION, ENTRIES, {
      limit: 2,
      domain: "DATA_PROTECTION",
    });
    expect(ranked.map((r) => r.entry.domain)).toEqual([
      "ENCRYPTION",
      "ENCRYPTION",
    ]);
  });

  it("drops entries that only share a weak, incidental term", () => {
    const ranked = rankEntries(QUESTION, ENTRIES, { limit: 10 });
    expect(ranked.every((r) => r.score >= 0.05)).toBe(true);
    expect(ranked.length).toBeLessThan(ENTRIES.length);
  });
});

describe("keywordSearch / hybridSearch (embeddings off)", () => {
  it("keywordSearch returns the encryption entries top-ranked", async () => {
    const results = await keywordSearch("org-1", QUESTION, 5);
    expect(results.slice(0, 2).map((r) => r.id)).toEqual([
      AT_REST.id,
      IN_TRANSIT.id,
    ]);
    expect(results[0].similarity).toBeGreaterThan(0.5);
  });

  it("does not filter the database query by domain", async () => {
    await keywordSearch("org-1", QUESTION, 5, "DATA_PROTECTION" as never);
    const where = findMany.mock.calls[0][0].where;
    expect(where.domain).toBeUndefined();
    expect(where.organizationId).toBe("org-1");
  });

  it("hybridSearch falls back to keyword results when embeddings are off", async () => {
    const results = await hybridSearch("org-1", QUESTION, 5);
    expect(results[0].id).toBe(AT_REST.id);
    expect(results[0].source).toBe("keyword");
  });
});

describe("generateAnswer", () => {
  it("puts the top-scored encryption entries into the LLM context", async () => {
    chat.mockResolvedValue({
      choices: [{ message: { content: "Yes. Data at rest is encrypted with AES-256." } }],
    });

    const result = await generateAnswer("q-1", "org-1", {
      question: {
        id: "q-1",
        questionText: QUESTION,
        questionType: "YES_NO",
        domain: "DATA_PROTECTION",
      },
      domainEntryCount: 0,
    });

    const userMessage = chat.mock.calls[0][0].messages[1].content as string;
    expect(userMessage).not.toContain("No relevant context found");
    const source1 = userMessage.indexOf("[Source 1]");
    const source2 = userMessage.indexOf("[Source 2]");
    expect(userMessage.slice(source1, source2)).toContain(AT_REST.answer);
    expect(userMessage).toContain(IN_TRANSIT.answer);

    expect(result.sourceIds[0].id).toBe(AT_REST.id);
    expect(result.confidence).toBeGreaterThan(0.1);
  });
});
