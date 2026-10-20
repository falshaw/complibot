/**
 * CompliBot - Question column detection (pure, no I/O)
 *
 * Used when a questionnaire is parsed without an explicit columnMapping.
 *   1. Header match: a cell in the header row named like "Question",
 *      "Questions", "Question Text", "Frage", "Fragen", "Requirement", ...
 *   2. Otherwise the data rows decide: the column with the most cells that
 *      end in "?", or failing that the first column that holds text
 *      (not IDs, numbers or blanks).
 * If the first row itself looks like a question (no header), headerRow is 0.
 */

export interface DetectedColumns {
  questionCol: string; // column letter, e.g. "A"
  headerRow: number; // number of header rows to skip (0 or 1)
  reason: "header" | "question-marks" | "first-text-column";
}

const HEADER_PATTERNS = [
  /^questions?$/,
  /^question[ _-]?text$/,
  /^(control|security|assessment) questions?$/,
  /^fragen?$/,
  /^fragetext$/,
  /^requirements?$/,
  /^anforderung(en)?$/,
];

/** 0-based column index -> letter (0 -> A, 25 -> Z, 26 -> AA). */
export function numberToColumn(index: number): string {
  let n = index + 1;
  let col = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    col = String.fromCharCode(65 + rem) + col;
    n = Math.floor((n - 1) / 26);
  }
  return col;
}

function normalise(cell: unknown): string {
  return String(cell ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isText(cell: unknown): boolean {
  const s = String(cell ?? "").trim();
  return s.length > 5 && /[a-zA-ZÀ-ÿ]{3,}/.test(s) && /\s/.test(s);
}

function isQuestion(cell: unknown): boolean {
  return isText(cell) && String(cell).trim().endsWith("?");
}

export function detectQuestionColumn(
  rows: unknown[][],
  sampleSize: number = 50,
): DetectedColumns | null {
  const nonEmpty = rows.filter((r) => r.some((c) => normalise(c) !== ""));
  if (nonEmpty.length === 0) return null;
  const width = Math.max(...nonEmpty.map((r) => r.length));

  // 1. Header names
  const header = nonEmpty[0];
  for (let col = 0; col < header.length; col++) {
    const name = normalise(header[col]);
    if (HEADER_PATTERNS.some((p) => p.test(name))) {
      return { questionCol: numberToColumn(col), headerRow: 1, reason: "header" };
    }
  }

  // 2. Data rows. Treat row 1 as a header unless it already looks like data.
  const firstRowIsData = header.some(isQuestion);
  const data = nonEmpty.slice(firstRowIsData ? 0 : 1, (firstRowIsData ? 0 : 1) + sampleSize);
  if (data.length === 0) return null;
  const headerRow = firstRowIsData ? 0 : 1;

  let bestCol = -1;
  let bestCount = 0;
  for (let col = 0; col < width; col++) {
    const count = data.filter((r) => isQuestion(r[col])).length;
    if (count > bestCount) {
      bestCount = count;
      bestCol = col;
    }
  }
  if (bestCol >= 0) {
    return { questionCol: numberToColumn(bestCol), headerRow, reason: "question-marks" };
  }

  for (let col = 0; col < width; col++) {
    const filled = data.filter((r) => normalise(r[col]) !== "");
    const text = filled.filter((r) => isText(r[col]));
    if (text.length > 0 && text.length * 2 >= filled.length) {
      return { questionCol: numberToColumn(col), headerRow, reason: "first-text-column" };
    }
  }
  return null;
}
