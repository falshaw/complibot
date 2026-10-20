/**
 * CompliBot - Hybrid Search Service
 *
 * Keyword search always runs and needs nothing but Postgres. Semantic search
 * (pgvector + an Ollama embedding model) is optional: when it is disabled or
 * unavailable, results come from keyword search alone. When both return
 * results they are merged with Reciprocal Rank Fusion.
 *
 * The question's classified domain only boosts matching entries; it never
 * filters entries out, because an LLM classifier can file "Do you encrypt
 * customer data at rest?" under DATA_PROTECTION while the knowledge base has
 * the answer under ENCRYPTION.
 */

import prisma from "@/lib/prisma";
import {
  embeddingsEnabled,
  generateEmbedding,
  markEmbeddingsUnavailable,
  semanticSearch,
} from "./EmbeddingService";
import { extractSearchTerms, rankEntries } from "./keywordScoring";
import { logger } from "@/lib/logger";
import type { SecurityDomain } from "@prisma/client";

export interface SearchResult {
  id: string;
  question: string;
  answer: string;
  domain: string;
  similarity: number;
  keywords: string[];
  source: "semantic" | "keyword" | "hybrid";
}

/** Upper bound on rows pulled from Postgres before scoring in memory. */
const KEYWORD_CANDIDATES = 500;

/**
 * Keyword search: Postgres pre-filters rows that contain any query term,
 * then rankEntries() scores them (question-title hits weigh most) and sorts
 * by score.
 */
export async function keywordSearch(
  organizationId: string,
  query: string,
  limit: number = 10,
  domain?: SecurityDomain,
): Promise<SearchResult[]> {
  const terms = extractSearchTerms(query);
  if (terms.length === 0) return [];

  const candidates = await prisma.knowledgeEntry.findMany({
    where: {
      organizationId,
      OR: terms.flatMap((term) => [
        { question: { contains: term, mode: "insensitive" as const } },
        { answer: { contains: term, mode: "insensitive" as const } },
        { keywords: { hasSome: [term] } },
      ]),
    },
    select: {
      id: true,
      question: true,
      answer: true,
      domain: true,
      keywords: true,
    },
    take: KEYWORD_CANDIDATES,
    orderBy: { updatedAt: "desc" },
  });

  return rankEntries(query, candidates, { limit, domain }).map(
    ({ entry, score }) => ({
      id: entry.id,
      question: entry.question,
      answer: entry.answer,
      domain: entry.domain,
      similarity: score,
      keywords: entry.keywords,
      source: "keyword" as const,
    }),
  );
}

/**
 * Reciprocal Rank Fusion to merge two ranked lists.
 * Order: RRF score = sum(1 / (k + rank)). The reported similarity stays the
 * best underlying similarity (0..1) so confidence scoring is not distorted by
 * the tiny raw RRF values.
 */
export function reciprocalRankFusion(
  semanticResults: SearchResult[],
  keywordResults: SearchResult[],
  k: number = 60,
): SearchResult[] {
  const scores = new Map<string, { score: number; result: SearchResult }>();

  const add = (list: SearchResult[]) => {
    list.forEach((r, rank) => {
      const rrf = 1 / (k + rank + 1);
      const existing = scores.get(r.id);
      if (existing) {
        existing.score += rrf;
        existing.result = {
          ...existing.result,
          source: "hybrid",
          similarity: Math.max(existing.result.similarity, r.similarity),
          keywords: existing.result.keywords.length
            ? existing.result.keywords
            : r.keywords,
        };
      } else {
        scores.set(r.id, { score: rrf, result: { ...r } });
      }
    });
  };
  add(semanticResults);
  add(keywordResults);

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .map(({ result }) => result);
}

/**
 * Hybrid search combining semantic + keyword with RRF.
 */
export async function hybridSearch(
  organizationId: string,
  query: string,
  limit: number = 5,
  domain?: SecurityDomain,
): Promise<SearchResult[]> {
  logger.debug("Hybrid search", { query: query.slice(0, 100), domain, limit });

  const [semanticResults, keywordResults] = await Promise.all([
    (async (): Promise<SearchResult[]> => {
      if (!embeddingsEnabled()) return [];
      try {
        const embedding = await generateEmbedding(query);
        const results = await semanticSearch(
          organizationId,
          embedding,
          limit * 2,
        );
        return results.map((r) => ({
          ...r,
          similarity: Number(r.similarity),
          keywords: [] as string[],
          source: "semantic" as const,
        }));
      } catch (error) {
        markEmbeddingsUnavailable();
        logger.warn("Semantic search unavailable, using keyword search only", {
          error: error instanceof Error ? error.message : String(error),
        });
        return [];
      }
    })(),
    keywordSearch(organizationId, query, limit * 2, domain),
  ]);

  if (semanticResults.length === 0) return keywordResults.slice(0, limit);
  if (keywordResults.length === 0) return semanticResults.slice(0, limit);

  return reciprocalRankFusion(semanticResults, keywordResults).slice(0, limit);
}
