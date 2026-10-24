/**
 * CompliBot - Answer quality: citations and confidence (pure, no I/O)
 *
 * The model is asked to end every draft with a line "Sources: 1, 3" (or
 * "Sources: none") naming the knowledge-base sources it actually used.
 * parseCitations() strips that line and returns the numbers; only those
 * entries are cited. When the model leaves the line out, the sources whose
 * text the answer visibly draws on are cited instead (supportingSources).
 *
 * Confidence describes the draft, not the size of the knowledge base:
 *
 *   relevance   best relevance among the cited entries (relevance.ts, 0..1)
 *   coverage    share of the question's terms found in the cited entries
 *   grounding   share of the answer's terms found in the cited entries,
 *               full marks from GROUNDING_FULL upwards (a paraphrase never
 *               reuses every word)
 *
 *   confidence = W_RELEVANCE * relevance + W_COVERAGE * coverage + W_GROUNDING * grounding
 *
 * A draft that says the knowledge base does not cover the question is
 * halved, and a draft that cites nothing is capped at NO_SOURCE_CAP, so both
 * land below any sensible review threshold.
 */

import { extractSearchTerms, stemSet } from "./keywordScoring";

export const W_RELEVANCE = 0.3;
export const W_COVERAGE = 0.3;
export const W_GROUNDING = 0.4;
export const GROUNDING_FULL = 0.7;
export const HEDGE_FACTOR = 0.5;
export const NO_SOURCE_CAP = 0.2;

export interface ContextSource {
  question: string;
  answer: string;
  similarity: number;
}

export interface QualitySignals {
  relevance: number;
  coverage: number;
  grounding: number;
  hedged: boolean;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

const SOURCES_LINE = /^[\s>*_-]*sources?(?:\s+used)?[*_]*\s*[:=]\s*(.*?)[\s*_.]*$/i;
const INLINE_MARKER = /\s*\[(?:sources?\s*)?(\d+(?:\s*,\s*(?:sources?\s*)?\d+)*)\]/gi;

/**
 * Split the model output into the answer text and the source numbers it
 * declares (0-based indexes into the context). `cited` is null when the
 * output declares nothing at all.
 */
export function parseCitations(
  raw: string,
  sourceCount: number,
): { content: string; cited: number[] | null } {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  let declared: number[] | null = null;

  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(SOURCES_LINE);
    if (!m) continue;
    declared = /\bnone\b|^n\/?a$|^-$/i.test(m[1].trim())
      ? []
      : (m[1].match(/\d+/g) ?? []).map(Number);
    lines.splice(i, 1);
    break;
  }

  let content = lines.join("\n");
  const inline: number[] = [];
  content = content.replace(INLINE_MARKER, (_, nums: string) => {
    inline.push(...(nums.match(/\d+/g) ?? []).map(Number));
    return "";
  });
  content = content
    .replace(/[ \t]+([.,;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  const numbers = declared ?? (inline.length > 0 ? inline : null);
  if (numbers === null) return { content, cited: null };
  const cited = Array.from(
    new Set(numbers.filter((n) => n >= 1 && n <= sourceCount).map((n) => n - 1)),
  );
  return { content, cited };
}

/** Share of `terms` that occur in `text` (stemmed); 0 when there are no terms. */
function share(terms: string[], text: string): number {
  if (terms.length === 0) return 0;
  const stems = stemSet(text);
  return terms.filter((t) => stems.has(t)).length / terms.length;
}

const sourceText = (s: ContextSource) => `${s.question}\n${s.answer}`;

/**
 * Fallback when the model does not declare its sources: the context entries
 * that hold at least a quarter of the answer's terms (and at least two).
 */
export function supportingSources(
  answer: string,
  sources: ContextSource[],
): number[] {
  const terms = extractSearchTerms(answer);
  if (terms.length === 0) return [];
  return sources.flatMap((s, i) => {
    const stems = stemSet(sourceText(s));
    const hits = terms.filter((t) => stems.has(t)).length;
    return hits >= 2 && hits / terms.length >= 0.25 ? [i] : [];
  });
}

const HEDGES = [
  /\b(knowledge base|context|sources?|provided information)\b[^.]*\b(does not|do not|doesn't|don't)\s+(cover|contain|specify|mention|state|include|provide|address)\b/i,
  /\bnot (covered|specified|mentioned|stated|documented|addressed|included)\s+(in|by)\s+(the\s+)?(knowledge base|context|sources?|provided)/i,
  /\b(no|insufficient)\s+(relevant\s+)?(information|context|details|data)\s+(is\s+|was\s+)?(available|provided|found)\b/i,
  /\b(cannot|can't|unable to)\s+(be\s+)?(determine|confirm|verif|answer)/i,
  /\badditional information (is|would be|may be) (needed|required)\b/i,
];

/** The draft says the knowledge base does not answer the question. */
export function isHedged(answer: string): boolean {
  return HEDGES.some((re) => re.test(answer));
}

/**
 * An unedited draft that cites nothing and says the knowledge base does not
 * cover the question. Approving it would send "not covered" to the customer,
 * so a person has to write the answer first.
 */
export function needsEditBeforeApproval(answer: {
  content: string;
  editedContent: string | null;
  sourceCount: number;
}): boolean {
  return !answer.editedContent && answer.sourceCount === 0 && isHedged(answer.content);
}

export function qualitySignals(
  question: string,
  answer: string,
  cited: ContextSource[],
): QualitySignals {
  const text = cited.map(sourceText).join("\n");
  return {
    relevance: cited.length ? Math.max(...cited.map((s) => s.similarity)) : 0,
    coverage: cited.length ? share(extractSearchTerms(question), text) : 0,
    grounding: cited.length ? share(extractSearchTerms(answer), text) : 0,
    hedged: isHedged(answer),
  };
}

export function scoreConfidence(signals: QualitySignals, citedCount: number): number {
  const grounding = clamp01(signals.grounding / GROUNDING_FULL);
  let c =
    W_RELEVANCE * clamp01(signals.relevance) +
    W_COVERAGE * clamp01(signals.coverage) +
    W_GROUNDING * grounding;
  if (citedCount === 0) c = Math.min(c, NO_SOURCE_CAP);
  if (signals.hedged) c *= HEDGE_FACTOR;
  return round2(clamp01(c));
}

/**
 * Turn raw model output into the stored draft: answer text without the
 * sources line, the context indexes it cites, the confidence and the
 * signals behind it.
 */
export function assessAnswer(
  question: string,
  raw: string,
  context: ContextSource[],
): {
  content: string;
  cited: number[];
  confidence: number;
  signals: QualitySignals;
} {
  const parsed = parseCitations(raw, context.length);
  const cited = parsed.cited ?? supportingSources(parsed.content, context);
  const citedSources = cited.map((i) => context[i]);
  const signals = qualitySignals(question, parsed.content, citedSources);
  return {
    content: parsed.content,
    cited,
    confidence: scoreConfidence(signals, cited.length),
    signals,
  };
}
