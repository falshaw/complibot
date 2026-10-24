import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The interview does not ask what an earlier reply already answered: the
 * extraction call names the upcoming questions the reply covers, those are
 * logged as skipped, never shown, and the next real question follows.
 */

const { db, chat } = vi.hoisted(() => ({
  chat: vi.fn(),
  db: {
    interviewSession: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    knowledgeEntry: { create: vi.fn(async ({ data }) => ({ id: "k-1", ...data })) },
  },
}));

vi.mock("@/lib/prisma", () => ({ default: db, prisma: db }));
vi.mock("@/lib/ollama", () => ({ ollamaChatWithBreaker: (...a: unknown[]) => chat(...a), OLLAMA_MODEL: "test" }));
vi.mock("@/lib/services/EmbeddingService", () => ({ refreshEntryEmbedding: vi.fn(async () => {}) }));

import { DOMAIN_QUESTIONS, interviewState, processResponse } from "@/lib/services/InterviewService";

const [Q1, Q2, Q3] = DOMAIN_QUESTIONS.ACCESS_CONTROL;
const reply = (json: object) => ({ choices: [{ message: { content: JSON.stringify(json) } }] });

beforeEach(() => {
  vi.clearAllMocks();
  db.interviewSession.findUniqueOrThrow.mockResolvedValue({
    id: "s-1",
    organizationId: "org-1",
    status: "active",
    currentDomain: "ACCESS_CONTROL",
    domainsCompleted: [],
    questionsAsked: 1,
    entriesCreated: 0,
    conversationLog: [{ role: "assistant", content: Q1, domain: "ACCESS_CONTROL", timestamp: "t" }],
  });
});

describe("interview skips questions already answered", () => {
  it("skips the joiner/mover/leaver question after a reply that covered it", async () => {
    chat.mockResolvedValue(
      reply({ question: "How is access managed?", answer: "Joiner/mover/leaver via HR, quarterly reviews.", alsoAnswered: [1] }),
    );

    const res = await processResponse("s-1", "Access follows joiner/mover/leaver from HR; managers review it quarterly.");

    expect(res.nextQuestion).toBe(Q3);
    // the upcoming questions went to the model, numbered
    expect(chat.mock.calls[0][0].messages[1].content).toContain(`1. ${Q2}`);

    const saved = db.interviewSession.update.mock.calls[0][0].data;
    const log = saved.conversationLog as Array<{ content: string; skipped?: boolean }>;
    expect(log.find((m) => m.content === Q2)?.skipped).toBe(true);

    const state = interviewState({ ...saved, id: "s-1", status: "active", entriesCreated: 1 });
    expect(state.currentQuestion).toBe(Q3);
    expect(state.messages.map((m) => m.content)).not.toContain(Q2);
  });

  it("asks the next question as before when the reply covered nothing else", async () => {
    chat.mockResolvedValue(reply({ question: "How is access managed?", answer: "Through Entra ID groups.", alsoAnswered: [] }));

    const res = await processResponse("s-1", "Everything goes through Entra ID groups.");

    expect(res.nextQuestion).toBe(Q2);
  });

  it("moves to the next domain when the reply covered every remaining question", async () => {
    chat.mockResolvedValue(reply({ question: "q", answer: "a full answer", alsoAnswered: [1, 2, 7] }));

    const res = await processResponse("s-1", "A long reply that covers reviews, revocation and least privilege.");

    expect(res.domain).toBe("AUTHENTICATION");
    expect(res.nextQuestion).toBe(DOMAIN_QUESTIONS.AUTHENTICATION[0]);
  });
});
