/**
 * CompliBot - when may answer generation (re)start for a questionnaire?
 *
 * - PARSED: first run.
 * - IN_REVIEW with unanswered questions: fill the gaps a partial run left.
 * - GENERATING with no progress for STALE_MS: the run was interrupted (app
 *   restart, crash), so the questionnaire must not stay stuck forever.
 */

export const STALE_GENERATION_MS = 15 * 60 * 1000;

export function canStartGeneration(
  q: {
    status: string;
    totalQuestions: number;
    answeredCount: number;
    updatedAt: Date;
  },
  now: number = Date.now(),
): boolean {
  if (q.totalQuestions === 0) return false;
  switch (q.status) {
    case "PARSED":
      return true;
    case "IN_REVIEW":
      return q.answeredCount < q.totalQuestions;
    case "GENERATING":
      return now - q.updatedAt.getTime() > STALE_GENERATION_MS;
    default:
      return false;
  }
}
