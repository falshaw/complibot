/**
 * CompliBot - Embedding Service (optional)
 * Uses an Ollama embedding model (default nomic-embed-text, 768 dimensions)
 * and stores vectors in the pgvector column KnowledgeEntry.embedding.
 *
 * Set EMBEDDING_MODEL=none to switch semantic search off. If the model is
 * missing in Ollama, semantic search pauses for a few minutes after the first
 * failure and keyword search carries on alone.
 */

import { getPool } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { ollamaFetchWithBreaker } from "@/lib/ollama";

const EMBEDDING_MODEL = (
  process.env.EMBEDDING_MODEL ?? "nomic-embed-text"
).trim();
const EMBEDDING_DIMENSIONS = 768;
const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000;

let unavailableUntil = 0;

/** False when EMBEDDING_MODEL=none or after a recent embedding/search failure. */
export function embeddingsEnabled(): boolean {
  if (!EMBEDDING_MODEL || EMBEDDING_MODEL.toLowerCase() === "none") return false;
  return Date.now() >= unavailableUntil;
}

/** Pause semantic search after a failure (model not pulled, no pgvector column, ...). */
export function markEmbeddingsUnavailable(): void {
  unavailableUntil = Date.now() + RETRY_AFTER_FAILURE_MS;
}

/**
 * Generate embedding for a single text string via Ollama
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await ollamaFetchWithBreaker("/api/embed", {
    model: EMBEDDING_MODEL,
    input: text.slice(0, 8000),
  });

  const data = await response.json();
  return data.embeddings[0];
}

/**
 * Generate embeddings for multiple texts (batch)
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const truncated = texts.map((t) => t.slice(0, 8000));
  const response = await ollamaFetchWithBreaker("/api/embed", {
    model: EMBEDDING_MODEL,
    input: truncated,
  });

  const data = await response.json();
  return data.embeddings;
}

/**
 * Initialize pgvector extension and embedding column.
 * Run once during setup.
 */
export async function initPgVector(): Promise<void> {
  const pool = getPool();
  await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
  // Add embedding column if it doesn't exist
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE "KnowledgeEntry" ADD COLUMN IF NOT EXISTS embedding vector(${EMBEDDING_DIMENSIONS});
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  // Create HNSW index for fast similarity search
  await pool.query(`
    CREATE INDEX IF NOT EXISTS knowledge_embedding_idx
    ON "KnowledgeEntry"
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
  `);
  logger.info("pgvector initialized with HNSW index");
}

/**
 * Store embedding for a knowledge entry
 */
export async function storeEmbedding(
  entryId: string,
  embedding: number[],
): Promise<void> {
  const pool = getPool();
  const vectorStr = `[${embedding.join(",")}]`;
  await pool.query(
    `UPDATE "KnowledgeEntry" SET embedding = $1::vector WHERE id = $2`,
    [vectorStr, entryId],
  );
}

/**
 * Generate and store embedding for a knowledge entry
 */
export async function embedKnowledgeEntry(
  entryId: string,
  question: string,
  answer: string,
): Promise<void> {
  if (!embeddingsEnabled()) return;
  logger.ai.embed("start", { entryId });
  try {
    const text = `Q: ${question}\nA: ${answer}`;
    const embedding = await generateEmbedding(text);
    await storeEmbedding(entryId, embedding);
    logger.ai.embed("success", { entryId });
  } catch (error) {
    markEmbeddingsUnavailable();
    logger.ai.embed("error", {
      entryId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Embed a new or changed entry without failing the request: keyword search
 * still finds the entry when the embedding model is down. A changed entry
 * loses its old vector first, so it is never ranked by text it no longer has.
 */
export async function refreshEntryEmbedding(
  entryId: string,
  question: string,
  answer: string,
  { changed = false }: { changed?: boolean } = {},
): Promise<void> {
  try {
    if (changed) {
      await getPool().query(`UPDATE "KnowledgeEntry" SET embedding = NULL WHERE id = $1`, [entryId]);
    }
    await embedKnowledgeEntry(entryId, question, answer);
  } catch {
    /* logged and paused inside embedKnowledgeEntry */
  }
}

/**
 * Semantic search using pgvector cosine similarity
 */
export async function semanticSearch(
  organizationId: string,
  queryEmbedding: number[],
  limit: number = 5,
  domain?: string,
): Promise<
  Array<{
    id: string;
    question: string;
    answer: string;
    domain: string;
    similarity: number;
  }>
> {
  const pool = getPool();
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  let sql = `
    SELECT id, question, answer, domain,
      1 - (embedding <=> $1::vector) as similarity
    FROM "KnowledgeEntry"
    WHERE "organizationId" = $2
      AND embedding IS NOT NULL
  `;
  const params: unknown[] = [vectorStr, organizationId];

  if (domain) {
    sql += ` AND domain = $3`;
    params.push(domain);
  }

  sql += ` ORDER BY embedding <=> $1::vector LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await pool.query(sql, params);
  return result.rows;
}
