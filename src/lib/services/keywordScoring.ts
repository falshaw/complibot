/**
 * CompliBot - Keyword relevance scoring (pure, no I/O)
 *
 * Used by SearchService.keywordSearch as the retrieval path that always works,
 * with or without an embedding model. The database only pre-filters candidate
 * rows; ranking happens here so it can be unit-tested.
 *
 * Scoring per query term (after stopword removal and light stemming):
 *   - term appears in the entry's question (title)  -> 3
 *   - term appears in the entry's keywords          -> 2
 *   - term appears in the entry's answer            -> 1
 * The total is normalised to 0..1 and blended with the share of query terms
 * found in the entry's question, so "Do you encrypt data at rest?" ranks the
 * entry titled "Do you encrypt data at rest?" above an entry that merely
 * mentions "data" somewhere in a long answer.
 */

export interface ScorableEntry {
  id: string;
  question: string;
  answer: string;
  domain: string;
  keywords: string[];
}

export interface ScoredEntry<T extends ScorableEntry = ScorableEntry> {
  entry: T;
  score: number;
}

const STOPWORDS = new Set([
  "a", "about", "above", "after", "again", "all", "also", "am", "an", "and",
  "any", "are", "as", "at", "be", "been", "before", "being", "both", "but",
  "by", "can", "could", "describe", "did", "do", "does", "doing", "each",
  "either", "explain", "for", "from", "had", "has", "have", "having", "how",
  "i", "if", "in", "into", "is", "it", "its", "may", "me", "might", "more",
  "most", "must", "my", "no", "nor", "not", "of", "on", "or", "other", "our",
  "ours", "please", "provide", "shall", "should", "so", "some", "such",
  "than", "that", "the", "their", "them", "then", "there", "these", "they",
  "this", "those", "through", "to", "under", "until", "up", "us", "use",
  "used", "using", "very", "via", "was", "we", "were", "what", "when",
  "where", "whether", "which", "while", "who", "whom", "why", "will", "with",
  "within", "would", "yes", "you", "your", "yours",
  // questionnaire filler that carries no topic
  "company", "organization", "organisation", "vendor", "ensure", "ensured",
  "process", "processes", "procedure", "procedures", "currently",
]);

const SUFFIXES: Array<[string, string]> = [
  ["ations", ""],
  ["ation", ""],
  ["ions", ""],
  ["ion", ""],
  ["ings", ""],
  ["ing", ""],
  ["ies", "i"],
  ["es", ""],
  ["ed", ""],
  ["ly", ""],
  ["s", ""],
];

/** Very small suffix stripper: encryption / encrypted / encrypts -> encrypt. */
export function stem(word: string): string {
  let w = word;
  for (const [suffix, replacement] of SUFFIXES) {
    if (suffix === "s" && w.endsWith("ss")) break; // access, business
    if (w.endsWith(suffix) && w.length - suffix.length >= 3) {
      w = w.slice(0, w.length - suffix.length) + replacement;
      // logging -> logg -> log, planned -> plann -> plan
      if (
        (suffix === "ing" || suffix === "ed") &&
        /([b-df-hj-np-rtv-z])\1$/.test(w)
      ) {
        w = w.slice(0, -1);
      }
      break;
    }
  }
  if (w.length > 4 && w.endsWith("y")) w = w.slice(0, -1) + "i"; // policy -> polici
  return w;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Query terms: lowercase, punctuation stripped, stopwords removed, stemmed, deduplicated. */
export function extractSearchTerms(query: string): string[] {
  const terms = tokenize(query)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    .map(stem);
  return Array.from(new Set(terms));
}

/** Every word of `text`, stemmed (stopwords kept: used for membership tests). */
export function stemSet(text: string): Set<string> {
  return new Set(tokenize(text).map(stem));
}

/**
 * Score one entry against pre-extracted query terms. Returns 0..1.
 * `domain` (optional) gives a small boost to entries in the question's
 * classified domain; it never filters entries out.
 */
export function scoreEntry(
  terms: string[],
  entry: ScorableEntry,
  domain?: string,
): number {
  if (terms.length === 0) return 0;

  const questionStems = stemSet(entry.question);
  const keywordStems = stemSet(entry.keywords.join(" "));
  const answerStems = stemSet(entry.answer);

  let weighted = 0;
  let questionHits = 0;
  for (const term of terms) {
    if (questionStems.has(term)) {
      weighted += 3;
      questionHits++;
    }
    if (keywordStems.has(term)) weighted += 2;
    if (answerStems.has(term)) weighted += 1;
  }
  if (weighted === 0) return 0;

  let score = 0.7 * (weighted / (6 * terms.length)) + 0.3 * (questionHits / terms.length);
  if (domain && entry.domain === domain) score += 0.05;
  return Math.min(1, score);
}

/**
 * Rank entries for a query: highest score first, entries below `minScore`
 * dropped, ties broken by more question-title hits then original order.
 */
export function rankEntries<T extends ScorableEntry>(
  query: string,
  entries: T[],
  options: { limit?: number; domain?: string; minScore?: number } = {},
): ScoredEntry<T>[] {
  const { limit = 10, domain, minScore = 0.05 } = options;
  const terms = extractSearchTerms(query);
  if (terms.length === 0) return [];

  return entries
    .map((entry, index) => ({ entry, score: scoreEntry(terms, entry, domain), index }))
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ entry, score }) => ({ entry, score }));
}
