/**
 * CompliBot - Answer Generation Service
 * Uses RAG (Retrieval Augmented Generation) with GPT-4o to generate answers.
 */

import prisma from "@/lib/prisma";
import { hybridSearch } from "./SearchService";
import { logger } from "@/lib/logger";
import { sanitizeForPrompt } from "@/lib/sanitize";
import { ollamaChatWithBreaker, OLLAMA_MODEL } from "@/lib/ollama";
import type { QuestionType, SecurityDomain } from "@prisma/client";

const PROMPT_VERSION = "2026-03-01";

const PROMPT_TEMPLATES: Record<string, string> = {
  YES_NO: `You are answering a security questionnaire. Based on the company's knowledge base context below, answer this yes/no question.
If the context supports it, answer "Yes" and provide a brief justification (1-2 sentences).
If not supported, answer "No" or "N/A" with explanation.
Be definitive and concise.`,

  FREE_TEXT: `You are answering a security questionnaire. Based on the company's knowledge base context below, provide a professional, accurate answer.
Write 2-4 sentences. Be specific and reference actual practices. Don't say "we" — use the company's perspective implicitly.
If context is insufficient, provide the best answer possible and note what additional information may be needed.`,

  MULTIPLE_CHOICE: `You are answering a security questionnaire multiple choice question. Based on the company's knowledge base context, select the most appropriate option and explain briefly why.`,

  EVIDENCE: `You are answering a security questionnaire that requires evidence or documentation references.
Based on the context, describe the relevant policies, procedures, or controls. Reference specific document names where possible.
If evidence isn't directly available, describe what documentation would exist and where it would be maintained.`,

  DATE: `Based on the company's security knowledge base, provide the relevant date or timeframe requested. If the exact date isn't available, provide the most reasonable estimate based on context.`,

  NUMERIC: `Based on the company's security knowledge base, provide the relevant numeric value requested. If the exact number isn't available, provide a reasonable estimate or range based on context.`,
};

/**
 * Calculate confidence score for a generated answer
 */
function calculateConfidence(
  similarities: number[],
  questionType: QuestionType,
  domainEntryCount: number,
): number {
  if (similarities.length === 0) return 0.1;

  // Weighted average of top-K similarities
  const weights = [0.4, 0.25, 0.15, 0.1, 0.1];
  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = 0; i < Math.min(similarities.length, weights.length); i++) {
    weightedSum += similarities[i] * weights[i];
    totalWeight += weights[i];
  }
  let base = weightedSum / totalWeight;

  // Exact match bonus
  if (similarities[0] > 0.92) base += 0.15;

  // Domain coverage penalty
  if (domainEntryCount < 3) base *= 0.7;
  else if (domainEntryCount < 5) base *= 0.85;

  // Question type adjustments
  if (questionType === "YES_NO") base += 0.05;
  if (questionType === "EVIDENCE") base *= 0.8;

  return Math.max(0, Math.min(1, base));
}

/**
 * Classify question into a security domain using GPT-4o-mini
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
 * Detect question type
 */
export async function detectQuestionType(
  questionText: string,
): Promise<QuestionType> {
  const lower = questionText.toLowerCase();
  if (
    /^(do you|does your|is your|are you|have you|can you|will you|is there)\b/i.test(
      lower,
    )
  )
    return "YES_NO";
  if (/\b(how many|number of|count|quantity|percentage|rate)\b/i.test(lower))
    return "NUMERIC";
  if (/\b(when|date|last time|how often|frequency)\b/i.test(lower))
    return "DATE";
  if (
    /\b(evidence|documentation|proof|certificate|attestation|report)\b/i.test(
      lower,
    )
  )
    return "EVIDENCE";
  if (/\b(select|choose|which of the following|check all)\b/i.test(lower))
    return "MULTIPLE_CHOICE";
  return "FREE_TEXT";
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
 * Accepts a prefetched `question` object to avoid a redundant DB round-trip
 * when called in a batch (e.g. from generateQuestionnaireAnswers).
 * Also accepts a prefetched `domainEntryCount` for the same reason.
 *
 * The public overload that takes only (questionId, organizationId) is kept
 * for callers that invoke this function in isolation.
 */
export async function generateAnswer(
  questionId: string,
  organizationId: string,
  prefetched?: {
    question: QuestionData;
    domainEntryCount: number;
  },
): Promise<{
  content: string;
  confidence: number;
  sourceIds: Array<{ id: string; similarity: number }>;
}> {
  logger.ai.generate(questionId, "start");

  // Use prefetched question data when available; fall back to DB fetch for
  // standalone calls (e.g. regenerate-single-answer endpoint).
  const question: QuestionData =
    prefetched?.question ??
    (await prisma.question.findUniqueOrThrow({ where: { id: questionId } }));

  // Search for relevant knowledge
  const searchResults = await hybridSearch(
    organizationId,
    question.questionText,
    5,
    question.domain,
  );

  // Use prefetched domain entry count when available; fall back to DB query.
  const domainEntryCount =
    prefetched?.domainEntryCount ??
    (await prisma.knowledgeEntry.count({
      where: { organizationId, domain: question.domain },
    }));

  // Build context from search results
  const context =
    searchResults.length > 0
      ? searchResults
          .map(
            (r, i) =>
              `[Source ${i + 1}] (${r.domain})\nQ: ${r.question}\nA: ${r.answer}`,
          )
          .join("\n\n")
      : "No relevant context found in the knowledge base.";

  // Select prompt template
  const promptTemplate =
    PROMPT_TEMPLATES[question.questionType] || PROMPT_TEMPLATES.FREE_TEXT;

  const response = await ollamaChatWithBreaker({
    model: OLLAMA_MODEL,
    messages: [
      { role: "system", content: promptTemplate },
      {
        role: "user",
        content: `## Knowledge Base Context:\n${context}\n\n## Question:\n${sanitizeForPrompt(question.questionText, 2000)}`,
      },
    ],
    temperature: 0.2,
    max_tokens: 500,
  });

  const content =
    response.choices[0]?.message?.content?.trim() ||
    "Unable to generate answer.";
  const similarities = searchResults.map((r) => r.similarity);
  const confidence = calculateConfidence(
    similarities,
    question.questionType,
    domainEntryCount,
  );
  const sourceIds = searchResults.map((r, i) => ({
    id: r.id,
    similarity: r.similarity,
    rank: i,
  }));

  logger.ai.generate(questionId, "success", {
    confidence,
    sourceCount: sourceIds.length,
  });

  return { content, confidence, sourceIds };
}

/**
 * Generate answers for all questions in a questionnaire.
 *
 * Optimisations vs the original serial loop:
 *   1. All questions are already fetched by the outer findMany — we pass the
 *      question data directly into generateAnswer to skip N redundant
 *      findUniqueOrThrow calls.
 *   2. Domain entry counts are prefetched in a single groupBy query instead
 *      of one COUNT per question.
 *   3. Answer generation calls run with bounded concurrency (5 in-flight at
 *      once) via mapWithConcurrency — serial DB writes still happen per
 *      answer to preserve atomicity, but LLM calls and hybridSearch overlap.
 */
export async function generateQuestionnaireAnswers(
  questionnaireId: string,
  organizationId: string,
): Promise<{ generated: number; errors: number }> {
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

  const questions = await prisma.question.findMany({
    where: { questionnaireId },
    orderBy: { rowIndex: "asc" },
  });

  // Batch-prefetch per-domain knowledge entry counts in a single query.
  // groupBy returns one row per distinct domain value for this org.
  const domainCountRows = await prisma.knowledgeEntry.groupBy({
    by: ["domain"],
    where: { organizationId },
    _count: { id: true },
  });
  const domainCountMap = new Map<SecurityDomain, number>(
    domainCountRows.map((r) => [r.domain, r._count.id]),
  );

  // Bounded-concurrency generation — cap at 5 in-flight to avoid
  // overwhelming Ollama/bridge while still parallelising the slow LLM calls.
  const CONCURRENCY = 5;

  let generated = 0;
  let errors = 0;

  // We need the DB writes (answer.create, answerSource.createMany) to be
  // accounted correctly even when tasks overlap, so we use a shared counter
  // updated atomically after each task resolves.
  await mapWithConcurrency(questions, CONCURRENCY, async (question) => {
    try {
      const domainEntryCount = domainCountMap.get(question.domain) ?? 0;
      const { content, confidence, sourceIds } = await generateAnswer(
        question.id,
        organizationId,
        { question, domainEntryCount },
      );

      const answer = await prisma.answer.create({
        data: {
          questionId: question.id,
          content,
          confidence,
          aiGenerated: true,
          status:
            confidence >= threshold
              ? "PENDING"
              : confidence >= threshold * 0.625
                ? "FLAGGED"
                : "FLAGGED",
        },
      });

      // Create source attributions
      if (sourceIds.length > 0) {
        await prisma.answerSource.createMany({
          data: sourceIds.map((s) => ({
            answerId: answer.id,
            knowledgeEntryId: s.id,
            similarity: s.similarity,
            rank: sourceIds.indexOf(s),
          })),
        });
      }

      generated++;
    } catch (error) {
      logger.error("Failed to generate answer", {
        questionId: question.id,
        error: error instanceof Error ? error.message : String(error),
      });
      errors++;
    }
  });

  // Update questionnaire status
  await prisma.questionnaire.update({
    where: { id: questionnaireId },
    data: {
      status: "IN_REVIEW",
      answeredCount: generated,
    },
  });

  return { generated, errors };
}
