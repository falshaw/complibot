/**
 * CompliBot - Hybrid Search Service
 * Combines semantic search (pgvector) + keyword search with Reciprocal Rank Fusion.
 */

import prisma from "@/lib/prisma";
import { generateEmbedding, semanticSearch } from "./EmbeddingService";
import { logger } from "@/lib/logger";
import type { SecurityDomain } from "@prisma/client";

interface SearchResult {
  id: string;
  question: string;
  answer: string;
  domain: string;
  similarity: number;
  keywords: string[];
  source: "semantic" | "keyword" | "hybrid";
}

/**
 * Keyword search on KnowledgeEntry using Prisma full-text search
 */
async function keywordSearch(
  organizationId: string,
  query: string,
  limit: number = 10,
  domain?: SecurityDomain,
): Promise<SearchResult[]> {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (words.length === 0) return [];

  const where: Record<string, unknown> = {
    organizationId,
    OR: [
      ...words.map((word) => ({
        question: { contains: word, mode: "insensitive" as const },
      })),
      ...words.map((word) => ({
        answer: { contains: word, mode: "insensitive" as const },
      })),
      ...words.map((word) => ({ keywords: { has: word } })),
    ],
  };

  if (domain) where.domain = domain;

  const entries = await prisma.knowledgeEntry.findMany({
    where,
    take: limit,
    orderBy: { updatedAt: "desc" },
  });

  return entries.map((entry, i) => ({
    id: entry.id,
    question: entry.question,
    answer: entry.answer,
    domain: entry.domain,
    similarity: 1 - i * 0.05, // Approximate rank-based score
    keywords: entry.keywords,
    source: "keyword" as const,
  }));
}

/**
 * Reciprocal Rank Fusion to merge two ranked lists
 * RRF score = sum(1 / (k + rank)) for each list where the item appears
 */
function reciprocalRankFusion(
  semanticResults: SearchResult[],
  keywordResults: SearchResult[],
  k: number = 60,
): SearchResult[] {
  const scores = new Map<string, { score: number; result: SearchResult }>();

  semanticResults.forEach((r, rank) => {
    const existing = scores.get(r.id);
    const rrfScore = 1 / (k + rank + 1);
    if (existing) {
      existing.score += rrfScore;
      existing.result.source = "hybrid";
    } else {
      scores.set(r.id, {
        score: rrfScore,
        result: { ...r, source: "semantic" },
      });
    }
  });

  keywordResults.forEach((r, rank) => {
    const existing = scores.get(r.id);
    const rrfScore = 1 / (k + rank + 1);
    if (existing) {
      existing.score += rrfScore;
      existing.result.source = "hybrid";
    } else {
      scores.set(r.id, {
        score: rrfScore,
        result: { ...r, source: "keyword" },
      });
    }
  });

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .map(({ result, score }) => ({ ...result, similarity: score }));
}

/**
 * Hybrid search combining semantic + keyword with RRF
 */
export async function hybridSearch(
  organizationId: string,
  query: string,
  limit: number = 5,
  domain?: SecurityDomain,
): Promise<SearchResult[]> {
  logger.debug("Hybrid search", { query: query.slice(0, 100), domain, limit });

  const [semanticResults, keywordResults] = await Promise.all([
    (async () => {
      try {
        const embedding = await generateEmbedding(query);
        const results = await semanticSearch(
          organizationId,
          embedding,
          limit * 2,
          domain,
        );
        return results.map((r) => ({
          ...r,
          keywords: [] as string[],
          source: "semantic" as const,
        }));
      } catch (error) {
        logger.warn("Semantic search failed, falling back to keyword only", {
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
