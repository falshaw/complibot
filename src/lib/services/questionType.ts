/**
 * CompliBot - Question type detection (pure, no I/O)
 *
 * Picks the answer format a questionnaire question asks for. The type only
 * selects the drafting prompt, so a wrong guess costs answer quality, not
 * data. Rules run in this order and the first match wins:
 *
 *   MULTIPLE_CHOICE  "Which of the following ...", "Select all ..."
 *   EVIDENCE         "Please provide/attach ...", "Provide a copy of ..."
 *   YES_NO           starts with an auxiliary verb: "Do you", "Is customer data", "Has the ..."
 *   NUMERIC          "How many", "How much", "number of", "what percentage"
 *   DATE             "When was/did ...", "date of", "on what date"
 *   FREE_TEXT        everything else
 *
 * Frequency and duration questions ("How often do you scan ...", "How long
 * do you keep ...") are FREE_TEXT: the answer is a cadence or a period with
 * an explanation, not a calendar date.
 */

export type DetectedQuestionType =
  | "YES_NO"
  | "FREE_TEXT"
  | "MULTIPLE_CHOICE"
  | "EVIDENCE"
  | "DATE"
  | "NUMERIC";

const MULTIPLE_CHOICE =
  /\b(which of the following|select (all|one|any|the applicable)|choose (all|one|from)|check all)\b/;
const EVIDENCE =
  /(^(please )?(provide|attach|upload|submit|share) )|\bplease (provide|attach|upload|submit|share|include)\b|\b(provide|attach) (a |the |your )?(copy|evidence|proof)\b/;
const YES_NO =
  /^(do|does|did|is|are|was|were|has|have|had|can|could|will|would|shall|should|must)\b/;
const NUMERIC =
  /^how (many|much)\b|\b(number of|what percentage|percentage of|how many)\b/;
const DATE =
  /^when\b|\b(date of|what date|which date|on what date|as of what date|when (was|were|did|is|will))\b/;

export function detectQuestionType(questionText: string): DetectedQuestionType {
  const q = questionText.trim().toLowerCase();
  if (MULTIPLE_CHOICE.test(q)) return "MULTIPLE_CHOICE";
  if (EVIDENCE.test(q)) return "EVIDENCE";
  if (YES_NO.test(q)) return "YES_NO";
  if (NUMERIC.test(q)) return "NUMERIC";
  if (DATE.test(q)) return "DATE";
  return "FREE_TEXT";
}
