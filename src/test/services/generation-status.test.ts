import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * Status transitions: a generation run with zero answers must not move the
 * questionnaire to IN_REVIEW (it could never be re-run), and a parse that
 * finds no questions must fail clearly instead of advancing.
 */

const questionnaireUpdate = vi.fn();
const questionFindMany = vi.fn();
const questionCount = vi.fn();
const questionCreateMany = vi.fn();
const answerCreate = vi.fn();
const chat = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    organization: {
      findUnique: vi.fn(async () => ({ confidenceThreshold: 0.8 })),
    },
    questionnaire: { update: (...a: unknown[]) => questionnaireUpdate(...a) },
    question: {
      findMany: (...a: unknown[]) => questionFindMany(...a),
      count: (...a: unknown[]) => questionCount(...a),
      createMany: (...a: unknown[]) => questionCreateMany(...a),
    },
    knowledgeEntry: {
      groupBy: vi.fn(async () => []),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
    answer: { create: (...a: unknown[]) => answerCreate(...a) },
    answerSource: { createMany: vi.fn() },
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
  ollamaChatWithBreaker: (...a: unknown[]) => chat(...a),
}));

import {
  generateQuestionnaireAnswers,
  generationConcurrency,
} from "@/lib/services/AnswerGenerationService";
import { canStartGeneration, STALE_GENERATION_MS } from "@/lib/services/generationGate";
import {
  parseQuestionnaire,
  QuestionnaireParseError,
} from "@/lib/services/QuestionnaireParserService";

const QUESTIONS = [
  { id: "q1", questionText: "Do you encrypt data at rest?", questionType: "YES_NO", domain: "ENCRYPTION", rowIndex: 2 },
  { id: "q2", questionText: "Do you run vulnerability scans?", questionType: "YES_NO", domain: "GENERAL", rowIndex: 3 },
];

function lastStatusUpdate() {
  const calls = questionnaireUpdate.mock.calls;
  return calls[calls.length - 1][0].data;
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "complibot-test-"));
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

beforeEach(() => {
  vi.clearAllMocks();
  questionFindMany.mockResolvedValue(QUESTIONS);
  questionCount.mockResolvedValue(0);
  answerCreate.mockImplementation(async ({ data }) => ({ id: `a-${data.questionId}` }));
});

describe("generateQuestionnaireAnswers status", () => {
  it("returns to PARSED (retryable) when no answer could be generated", async () => {
    chat.mockRejectedValue(new Error("model 'qwen2.5:7b' not found"));

    const result = await generateQuestionnaireAnswers("qn-1", "org-1");

    expect(result.generated).toBe(0);
    expect(result.errors).toBe(2);
    expect(result.lastError).toContain("not found");
    expect(lastStatusUpdate()).toEqual({ status: "PARSED", answeredCount: 0 });
  });

  it("moves to IN_REVIEW when at least one answer was generated", async () => {
    chat
      .mockResolvedValueOnce({ choices: [{ message: { content: "Yes." } }] })
      .mockRejectedValueOnce(new Error("timeout"));
    questionCount.mockResolvedValue(1);

    const result = await generateQuestionnaireAnswers("qn-1", "org-1");

    expect(result.generated).toBe(1);
    expect(lastStatusUpdate()).toEqual({ status: "IN_REVIEW", answeredCount: 1 });
  });

  it("only drafts questions that have no answer yet (retry fills gaps)", async () => {
    chat.mockResolvedValue({ choices: [{ message: { content: "Yes." } }] });

    await generateQuestionnaireAnswers("qn-1", "org-1");

    expect(questionFindMany.mock.calls[0][0].where).toEqual({
      questionnaireId: "qn-1",
      answers: { none: {} },
    });
  });

  it("reports progress after every drafted answer", async () => {
    chat.mockResolvedValue({ choices: [{ message: { content: "Yes." } }] });

    await generateQuestionnaireAnswers("qn-1", "org-1");

    const increments = questionnaireUpdate.mock.calls.filter(
      (c) => c[0].data.answeredCount?.increment === 1,
    );
    expect(increments).toHaveLength(2);
  });
});

describe("generationConcurrency", () => {
  it("drafts one answer at a time on a local Ollama model", async () => {
    expect(generationConcurrency({})).toBe(1);
    expect(generationConcurrency({ LLM_PROVIDER: "ollama" })).toBe(1);
    expect(generationConcurrency({ LLM_PROVIDER: "claude" })).toBe(5);
    expect(generationConcurrency({ LLM_CONCURRENCY: "3" })).toBe(3);
    expect(generationConcurrency({ LLM_CONCURRENCY: "x" })).toBe(1);
  });
});

describe("canStartGeneration", () => {
  const base = { totalQuestions: 4, answeredCount: 0, updatedAt: new Date(0) };
  it("starts a parsed questionnaire and fills gaps of a partial run", async () => {
    expect(canStartGeneration({ ...base, status: "PARSED" })).toBe(true);
    expect(canStartGeneration({ ...base, status: "IN_REVIEW", answeredCount: 3 })).toBe(true);
    expect(canStartGeneration({ ...base, status: "IN_REVIEW", answeredCount: 4 })).toBe(false);
    expect(canStartGeneration({ ...base, status: "UPLOADED" })).toBe(false);
    expect(canStartGeneration({ ...base, status: "PARSED", totalQuestions: 0 })).toBe(false);
  });

  it("recovers a run that stopped making progress, not a live one", async () => {
    const now = 10 * STALE_GENERATION_MS;
    const live = { ...base, status: "GENERATING", updatedAt: new Date(now - 60_000) };
    const stale = { ...base, status: "GENERATING", updatedAt: new Date(now - STALE_GENERATION_MS - 1) };
    expect(canStartGeneration(live, now)).toBe(false);
    expect(canStartGeneration(stale, now)).toBe(true);
  });
});

describe("parseQuestionnaire", () => {
  it("fails with a clear error and stays re-parseable when no questions are found", async () => {
    const file = path.join(tmpDir, "empty.csv");
    fs.writeFileSync(file, "Question,Answer\n");

    await expect(
      parseQuestionnaire("qn-1", file, { questionCol: "A" }),
    ).rejects.toBeInstanceOf(QuestionnaireParseError);
    await expect(
      parseQuestionnaire("qn-1", file, { questionCol: "A" }),
    ).rejects.toThrow(/No questions found/);

    expect(questionCreateMany).not.toHaveBeenCalled();
    expect(lastStatusUpdate()).toEqual({ status: "UPLOADED" });
  });

  it("still parses when domain classification fails (falls back to GENERAL)", async () => {
    const file = path.join(tmpDir, "one.csv");
    fs.writeFileSync(file, "Question\nDo you encrypt customer data at rest?\n");
    chat.mockRejectedValue(new Error("LLM down"));

    const result = await parseQuestionnaire("qn-1", file, { questionCol: "A" });

    expect(result.questionCount).toBe(1);
    expect(questionCreateMany.mock.calls[0][0].data[0].domain).toBe("GENERAL");
    expect(lastStatusUpdate()).toEqual({ status: "PARSED", totalQuestions: 1 });
  });
});
