/**
 * CompliBot - Retrieval relevance (pure, no I/O)
 *
 * Semantic search (pgvector cosine similarity) and keyword search
 * (keywordScoring.ts) score on different scales. With nomic-embed-text, an
 * unrelated security entry still reaches a cosine similarity of 0.50 to 0.63
 * against a security question, while a keyword score of 0.25 is already a
 * real match. Both are mapped onto one 0..1 relevance scale before results
 * are merged, cut off or used for confidence:
 *
 *   semantic: (cosine - 0.45) / (0.80 - 0.45), clamped to 0..1
 *   keyword:  score / 0.5, clamped to 0..1
 *
 * The anchors come from the sample questionnaire against the demo knowledge
 * base: correct entries scored cosine 0.61-0.78 / keyword 0.23-0.52, the
 * best wrong entries cosine 0.50-0.63 / keyword 0-0.22. They are tuned for
 * nomic-embed-text; another embedding model may need other anchors.
 */

export const SEMANTIC_FLOOR = 0.45;
export const SEMANTIC_CEILING = 0.8;
export const KEYWORD_CEILING = 0.5;

/** Entries below this relevance are never used or cited. */
export const MIN_RELEVANCE = 0.3;
/** Entries below this share of the best entry's relevance are dropped. */
export const RELATIVE_CUTOFF = 0.7;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function semanticRelevance(cosine: number): number {
  return round3(
    clamp01((cosine - SEMANTIC_FLOOR) / (SEMANTIC_CEILING - SEMANTIC_FLOOR)),
  );
}

export function keywordRelevance(score: number): number {
  return round3(clamp01(score / KEYWORD_CEILING));
}

/**
 * Keep only entries worth showing the model: at least MIN_RELEVANCE and at
 * least RELATIVE_CUTOFF of the best entry. Order is preserved; the input is
 * expected best first.
 */
export function applyRelevanceCutoff<T extends { similarity: number }>(
  results: T[],
  options: { min?: number; relative?: number } = {},
): T[] {
  const { min = MIN_RELEVANCE, relative = RELATIVE_CUTOFF } = options;
  if (results.length === 0) return [];
  const top = Math.max(...results.map((r) => r.similarity));
  const cutoff = Math.max(min, top * relative);
  return results.filter((r) => r.similarity >= cutoff);
}
