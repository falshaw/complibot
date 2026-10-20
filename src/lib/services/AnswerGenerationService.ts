/**
 * CompliBot - Answer Generation Service
 * Retrieval Augmented Generation: retrieve the most relevant knowledge-base
 * entries for a question, drop the weak ones, ask the configured LLM to draft
 * the answer from the rest, and cite only the entries the draft used.
 */

import prisma from "@/lib/prisma";
import { hybridSearch } from "./SearchService";
import { applyRelevanceCutoff } from "./relevance";
import { assessAnswer, type QualitySignals } from "./answerQuality";
import { logger } from "@/lib/logger";
import { sanitizeForPrompt } from "@/lib/sanitize";
import { ollamaChatWithBreaker, OLLAMA_MODEL } from "@/lib/ollama";
import type { QuestionType, SecurityDomain } from "@prisma/client";

export { detectQuestionType } from "./questionType";

/** At most this many entries are retrieved; the relevance cut-off keeps fewer. */
const MAX_CONTEXT_ENTRIES = 5;

const PROMPT_TEMPLATES: Record<string, string> = {
  YES_NO: `You are answering a yes/no question in a security questionnaire for the company.
Start with "Yes" or "No" and give a one or two sentence justification from the sources.`,

  FREE_TEXT: `You are answering a security questionnaire for the company.
Write 2-4 sentences that state the actual practice, with the specifics the sources give (frequencies, time limits, standards, tools). Do not say "we"; write from the company's perspective.`,

  MULTIPLE_CHOICE: `You are answering a multiple choice question in a security questionnaire for the company.
Name the option or options the sources support and explain the choice in one sentence.`,

  EVIDENCE: `You are answering a security questionnaire question that asks for evidence or documentation.
Name the policies, reports, certifications or records the sources mention that would serve as evidence, and what each covers.`,

  DATE: `You are answering a security questionnaire question that asks for a date or a point in time.
Give the date or time the sources state, with one sentence of context.`,

  NUMERIC: `You are answering a security questionnaire question that asks for a number.
Give the number or range the sources state, with one sentence of context.`,
};

/** Appended to every prompt: stay inside the sources and declare which were used. */
export const SOURCE_RULES = `
Rules:
- Use only facts from the numbered knowledge-base sources. Do not invent products, numbers, dates or certifications.
- If the sources do not answer the question, write that the knowledge base does not cover it, and nothing else.
- If they answer only part of it, answer that part and write which part the knowledge base does not cover.
- Do not put source numbers in the answer text.
- End with one last line in exactly this form, listing only the sources the answer uses:
Sources: 1, 3
or, if no source was used:
Sources: none`;

/**
 * Classify question into a security domain with the configured LLM
 */
export async function classifyDomain(
  questionText: string,
): Promise<SecurityDomain> {
  const domains = [
    "ACCESS_CONTROL",
    "AUTHENTICATION",
    "ENCRYPTION",
    "DATA_PROTECTION",
    "INCIDENT_RESPONSE",
    "NETWORK_SECURITY",
    "CLOUD_SECURITY",
    "PHYSICAL_SECURITY",
    "BUSINESS_CONTINUITY",
    "CHANGE_MANAGEMENT",
    "VULNERABILITY_MANAGEMENT",
    "LOGGING_MONITORING",
    "THIRD_PARTY_RISK",
    "COMPLIANCE",
    "PRIVACY",
    "ENDPOINT_SECURITY",
    "APPLICATION_SECURITY",
    "IDENTITY_MANAGEMENT",
    "GOVERNANCE",
    "GENERAL",
  ];

  // cache:true — deterministic prompt, same input always returns same output.
  // When LLM_PROVIDER=claude the bridge LRU cache will serve repeat calls.
  const response = await ollamaChatWithBreaker(
    {
      model: OLLAMA_MODEL,
      messages: [
        {
          role: "system",
          content: `Classify the following security questionnaire question into exactly one domain.
Available domains: ${domains.join(", ")}
Respond with ONLY the domain name, nothing else.`,
        },
        { role: "user", content: sanitizeForPrompt(questionText, 2000) },
      ],
      temperature: 0,
      max_tokens: 30,
    },
    { cache: true },
  );

  const result =
    response.choices[0]?.message?.content?.trim().toUpperCase() || "GENERAL";
  return (domains.includes(result) ? result : "GENERAL") as SecurityDomain;
}

/**
 * Shape of a prefetched question row — matches what Prisma returns from
 * Question.findMany / findUniqueOrThrow for the fields we actually use.
 */
interface QuestionData {
  id: string;
  questionText: string;
  questionType: QuestionType;
  domain: SecurityDomain;
}

/**
 * Run `fn` over every item in `items` with at most `limit` calls in-flight
 * at once.  Preserves result order.  No external dependencies.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

/**
 * Generate an AI answer for a single question using RAG.
 *
 * Retrieval returns up to MAX_CONTEXT_ENTRIES entries; the relevance cut-off
 * (relevance.ts) drops the weak ones before the model sees them, and only the
 * entries the draft declares (or visibly uses) are returned as citations.
 *
 * `prefetched.question` skips the DB read when called in a batch.
 */
export async function generateAnswer(
  questionId: string,
  organizationId: string,
  prefetched?: { question: QuestionData },
): Promise<{
  content: string;
  confidence: number;
  sourceIds: Array<{ id: string; similarity: number; rank: number }>;
  signals: QualitySignals;
}> {
  logger.ai.generate(questionId, "start");

  const question: QuestionData =
    prefetched?.question ??
    (await prisma.question.findUniqueOrThrow({ where: { id: questionId } }));

  // Best first. The domain only boosts matching entries; it does not filter.
  const retrieved = await hybridSearch(
    organizationId,
    question.questionText,
    MAX_CONTEXT_ENTRIES,
    question.domain,
  );
  const context = applyRelevanceCutoff(retrieved);

  const contextText =
    context.length > 0
      ? context
          .map(
            (r, i) =>
              `[Source ${i + 1}] (${r.domain})\nQ: ${r.question}\nA: ${r.answer}`,
          )
          .join("\n\n")
      : "No relevant entries were found in the knowledge base.";

  const promptTemplate =
    PROMPT_TEMPLATES[question.questionType] || PROMPT_TEMPLATES.FREE_TEXT;

  const response = await ollamaChatWithBreaker({
    model: OLLAMA_MODEL,
    messages: [
      { role: "system", content: promptTemplate + "\n" + SOURCE_RULES },
      {
        role: "user",
        content: `## Knowledge base sources:\n${contextText}\n\n## Question:\n${sanitizeForPrompt(question.questionText, 2000)}`,
      },
    ],
    temperature: 0.2,
    max_tokens: 500,
  });

  const raw = response.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("The model returned an empty answer");

  const { content, cited, confidence, signals } = assessAnswer(
    question.questionText,
    raw,
    context,
  );
  if (!content) throw new Error("The model returned only a sources line");

  const sourceIds = cited
    .map((i) => context[i])
    .sort((a, b) => b.similarity - a.similarity)
    .map((r, rank) => ({ id: r.id, similarity: r.similarity, rank }));

  logger.ai.generate(questionId, "success", {
    confidence,
    retrieved: retrieved.length,
    context: context.length,
    cited: sourceIds.length,
    ...signals,
  });

  return { content, confidence, sourceIds, signals };
}

/**
 * How many answers to draft in parallel. LLM_CONCURRENCY overrides; otherwise
 * 1 for Ollama (one local model) and 5 for the HTTP bridge.
 */
export function generationConcurrency(
  env: Record<string, string | undefined> = process.env,
): number {
  const explicit = parseInt(env.LLM_CONCURRENCY ?? "", 10);
  if (Number.isFinite(explicit) && explicit > 0) return Math.min(explicit, 10);
  return (env.LLM_PROVIDER ?? "ollama").toLowerCase() === "claude" ? 5 : 1;
}

/**
 * Generate answers for every question of a questionnaire that has no draft
 * yet. Answers are drafted with bounded concurrency (generationConcurrency);
 * each draft is written as soon as it is ready, so the review page can show
 * progress while the run continues.
 */
export async function generateQuestionnaireAnswers(
  questionnaireId: string,
  organizationId: string,
): Promise<{ generated: number; errors: number; lastError?: string }> {
  // Fetch org confidence threshold (CB-06)
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { confidenceThreshold: true },
  });
  const threshold = org?.confidenceThreshold ?? 0.8;

  // Update status to GENERATING
  await prisma.questionnaire.update({
    where: { id: questionnaireId },
    data: { status: "GENERATING" },
  });

  let generated = 0;
  let errors = 0;
  let lastError: string | undefined;

  try {
    // Only questions without a draft: a re-run after a partial failure (or
    // after an interrupted run) fills the gaps instead of duplicating answers.
    const questions = await prisma.question.findMany({
      where: { questionnaireId, answers: { none: {} } },
      orderBy: { rowIndex: "asc" },
    });

    // Bounded concurrency. A local Ollama model answers one request at a time
    // anyway; queueing several only makes the later ones wait (and time out)
    // and adds memory pressure, so the default there is 1.
    const CONCURRENCY = generationConcurrency();

    await mapWithConcurrency(questions, CONCURRENCY, async (question) => {
      try {
        const { content, confidence, sourceIds } = await generateAnswer(
          question.id,
          organizationId,
          { question },
        );

        const answer = await prisma.answer.create({
          data: {
            questionId: question.id,
            content,
            confidence,
            aiGenerated: true,
            // Below the organization's threshold the draft is flagged for a
            // closer look; above it, it waits for normal review.
            status: confidence >= threshold ? "PENDING" : "FLAGGED",
          },
        });

        // Create source attributions
        if (sourceIds.length > 0) {
          await prisma.answerSource.createMany({
            data: sourceIds.map((s) => ({
              answerId: answer.id,
              knowledgeEntryId: s.id,
              similarity: s.similarity,
              rank: s.rank,
            })),
          });
        }

        generated++;
        // Live progress for the review page while the run continues.
        await prisma.questionnaire.update({
          where: { id: questionnaireId },
          data: { answeredCount: { increment: 1 } },
        });
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        logger.error("Failed to generate answer", {
          questionId: question.id,
          error: lastError,
        });
        errors++;
      }
    });
  } catch (error) {
    // Unexpected failure outside a single question: put the questionnaire
    // back so generation can be retried.
    await prisma.questionnaire.update({
      where: { id: questionnaireId },
      data: { status: "PARSED" },
    });
    throw error;
  }

  // Only move to review when at least one answer exists. With zero answers
  // (LLM down, model not pulled, ...) the questionnaire goes back to PARSED
  // so "Generate Answers" can simply be run again.
  const answered = await prisma.question.count({
    where: { questionnaireId, answers: { some: {} } },
  });
  await prisma.questionnaire.update({
    where: { id: questionnaireId },
    data:
      answered > 0
        ? { status: "IN_REVIEW", answeredCount: answered }
        : { status: "PARSED", answeredCount: 0 },
  });

  return { generated, errors, lastError };
}
