/**
 * CompliBot - Questionnaire Parser Service
 * Parses uploaded Excel/CSV files into Question records.
 */

import ExcelJS from "exceljs";
import Papa from "papaparse";
import prisma from "@/lib/prisma";
import { classifyDomain, detectQuestionType } from "./AnswerGenerationService";
import { logger } from "@/lib/logger";
import * as fs from "fs";

interface ColumnMapping {
  questionCol: string; // e.g. "B"
  answerCol?: string; // e.g. "C" (for KB import)
  sheetName?: string;
  headerRow?: number;
}

interface ParsedQuestion {
  rowIndex: number;
  questionText: string;
  existingAnswer?: string;
  context?: string;
}

/**
 * Parse an Excel file and extract questions
 */
export async function parseExcel(
  filePath: string,
  mapping: ColumnMapping,
): Promise<ParsedQuestion[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheet = mapping.sheetName
    ? workbook.getWorksheet(mapping.sheetName)
    : workbook.worksheets[0];

  if (!sheet) throw new Error("Worksheet not found");

  const questions: ParsedQuestion[] = [];
  const headerRow = mapping.headerRow || 1;
  const questionColNum = columnToNumber(mapping.questionCol);
  const answerColNum = mapping.answerCol
    ? columnToNumber(mapping.answerCol)
    : undefined;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow) return; // Skip header

    const questionCell = row.getCell(questionColNum);
    const questionText = cellToString(questionCell);

    if (questionText && questionText.length > 5) {
      const parsed: ParsedQuestion = {
        rowIndex: rowNumber,
        questionText: questionText.trim(),
      };

      if (answerColNum) {
        const answerCell = row.getCell(answerColNum);
        parsed.existingAnswer = cellToString(answerCell);
      }

      // Get context from surrounding cells
      const contextParts: string[] = [];
      for (let col = 1; col <= Math.min(row.cellCount, 6); col++) {
        if (col === questionColNum || col === answerColNum) continue;
        const val = cellToString(row.getCell(col));
        if (val) contextParts.push(val);
      }
      if (contextParts.length > 0) parsed.context = contextParts.join(" | ");

      questions.push(parsed);
    }
  });

  return questions;
}

/**
 * Parse a CSV file and extract questions
 */
export async function parseCSV(
  filePath: string,
  mapping: ColumnMapping,
): Promise<ParsedQuestion[]> {
  const content = fs.readFileSync(filePath, "utf-8");
  const result = Papa.parse(content, { header: false, skipEmptyLines: true });

  const questions: ParsedQuestion[] = [];
  const headerRow = mapping.headerRow || 1;
  const questionColIdx = columnToNumber(mapping.questionCol) - 1;
  const answerColIdx = mapping.answerCol
    ? columnToNumber(mapping.answerCol) - 1
    : undefined;

  for (let i = headerRow; i < result.data.length; i++) {
    const row = result.data[i] as string[];
    const questionText = row[questionColIdx]?.trim();

    if (questionText && questionText.length > 5) {
      const parsed: ParsedQuestion = {
        rowIndex: i + 1,
        questionText,
      };

      if (answerColIdx !== undefined && row[answerColIdx]) {
        parsed.existingAnswer = row[answerColIdx].trim();
      }

      questions.push(parsed);
    }
  }

  return questions;
}

/**
 * Parse a questionnaire file and create Question records
 */
export async function parseQuestionnaire(
  questionnaireId: string,
  filePath: string,
  mapping: ColumnMapping,
): Promise<{ questionCount: number }> {
  // Update status to PARSING
  await prisma.questionnaire.update({
    where: { id: questionnaireId },
    data: { status: "PARSING" },
  });

  const isCSV = filePath.toLowerCase().endsWith(".csv");
  const parsed = isCSV
    ? await parseCSV(filePath, mapping)
    : await parseExcel(filePath, mapping);

  logger.info("Questionnaire parsed", {
    questionnaireId,
    questionCount: parsed.length,
  });

  // Classify domains and question types in batches
  const questions = [];
  for (const q of parsed) {
    const [domain, questionType] = await Promise.all([
      classifyDomain(q.questionText),
      detectQuestionType(q.questionText),
    ]);

    questions.push({
      questionnaireId,
      rowIndex: q.rowIndex,
      questionText: q.questionText,
      questionType,
      domain,
      originalContext: q.context || null,
      metadata: q.existingAnswer
        ? { existingAnswer: q.existingAnswer }
        : undefined,
    });
  }

  // Batch create
  await prisma.question.createMany({ data: questions });

  // Update questionnaire
  await prisma.questionnaire.update({
    where: { id: questionnaireId },
    data: {
      status: "PARSED",
      totalQuestions: questions.length,
    },
  });

  return { questionCount: questions.length };
}

/**
 * Ingest a completed questionnaire as knowledge base entries
 */
export async function ingestQuestionnaireAsKB(
  sourceId: string,
  filePath: string,
  mapping: ColumnMapping,
  organizationId: string,
): Promise<{ entriesCreated: number }> {
  if (!mapping.answerCol) {
    throw new Error("Answer column required for KB ingestion");
  }

  const isCSV = filePath.toLowerCase().endsWith(".csv");
  const parsed = isCSV
    ? await parseCSV(filePath, mapping)
    : await parseExcel(filePath, mapping);

  const withAnswers = parsed.filter(
    (q) => q.existingAnswer && q.existingAnswer.length > 5,
  );

  let entriesCreated = 0;
  for (const q of withAnswers) {
    const domain = await classifyDomain(q.questionText);

    await prisma.knowledgeEntry.create({
      data: {
        organizationId,
        sourceId,
        question: q.questionText,
        answer: q.existingAnswer!,
        domain,
        keywords: extractKeywords(q.questionText),
      },
    });
    entriesCreated++;
  }

  // Update source
  await prisma.knowledgeSource.update({
    where: { id: sourceId },
    data: { status: "completed", entriesCreated },
  });

  return { entriesCreated };
}

// Helper: Convert column letter to number (A=1, B=2, ..., AA=27)
function columnToNumber(col: string): number {
  let num = 0;
  for (let i = 0; i < col.length; i++) {
    num = num * 26 + col.charCodeAt(i) - 64;
  }
  return num;
}

// Helper: Convert cell value to string
function cellToString(cell: ExcelJS.Cell): string {
  if (!cell || !cell.value) return "";
  if (typeof cell.value === "string") return cell.value;
  if (typeof cell.value === "number") return String(cell.value);
  if (cell.value instanceof Date) return cell.value.toISOString();
  if (typeof cell.value === "object" && "text" in cell.value)
    return (cell.value as { text: string }).text;
  if (typeof cell.value === "object" && "richText" in cell.value) {
    return (cell.value as { richText: Array<{ text: string }> }).richText
      .map((r) => r.text)
      .join("");
  }
  return String(cell.value);
}

// Helper: Extract keywords from question text
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "do",
    "does",
    "your",
    "you",
    "we",
    "our",
    "have",
    "has",
    "been",
    "for",
    "and",
    "or",
    "in",
    "to",
    "of",
    "with",
    "this",
    "that",
    "what",
    "how",
    "when",
    "where",
    "which",
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w))
    .slice(0, 10);
}
