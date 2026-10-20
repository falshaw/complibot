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
  answerCreate.mockImplementation(async ({ data }) => ({ id: `a-${data.questionId}` }));
});

describe("generateQuestionnaireAnswers status", () => {
  it("returns to PARSED (retryable) when no answer could be generated", async () => {
    chat.mockRejectedValue(new Error("model 'qwen2.5:7b' not found"));
    const { generateQuestionnaireAnswers } = await import(
      "@/lib/services/AnswerGenerationService"
    );

    const result = await generateQuestionnaireAnswers("qn-1", "org-1");

    expect(result.generated).toBe(0);
    expect(result.errors).toBe(2);
    expect(result.lastError).toContain("not found");
    expect(lastStatusUpdate()).toEqual({ status: "PARSED" });
  });

  it("moves to IN_REVIEW when at least one answer was generated", async () => {
    chat
      .mockResolvedValueOnce({ choices: [{ message: { content: "Yes." } }] })
      .mockRejectedValueOnce(new Error("timeout"));
    const { generateQuestionnaireAnswers } = await import(
      "@/lib/services/AnswerGenerationService"
    );

    const result = await generateQuestionnaireAnswers("qn-1", "org-1");

    expect(result.generated).toBe(1);
    expect(lastStatusUpdate()).toEqual({ status: "IN_REVIEW", answeredCount: 1 });
  });
});

describe("parseQuestionnaire", () => {
  it("fails with a clear error and stays re-parseable when no questions are found", async () => {
    const file = path.join(tmpDir, "empty.csv");
    fs.writeFileSync(file, "Question,Answer\n");
    const { parseQuestionnaire, QuestionnaireParseError } = await import(
      "@/lib/services/QuestionnaireParserService"
    );

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
    const { parseQuestionnaire } = await import(
      "@/lib/services/QuestionnaireParserService"
    );

    const result = await parseQuestionnaire("qn-1", file, { questionCol: "A" });

    expect(result.questionCount).toBe(1);
    expect(questionCreateMany.mock.calls[0][0].data[0].domain).toBe("GENERAL");
    expect(lastStatusUpdate()).toEqual({ status: "PARSED", totalQuestions: 1 });
  });
});
