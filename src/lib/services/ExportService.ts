/**
 * CompliBot - Export Service
 *
 * Three exports of one questionnaire:
 *  - xlsx:   a review workbook (question, answer, status, confidence, sources)
 *  - txt:    a readable report
 *  - filled: the customer's own uploaded file with the answers written into
 *            its response column, same rows, same layout
 *
 * Only APPROVED answers are exported. A rejected, pending or flagged draft
 * never reaches a file that goes to the customer; its row stays empty and the
 * review exports name its status instead.
 */

import ExcelJS from "exceljs";
import Papa from "papaparse";
import * as fs from "fs";
import * as path from "path";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { domainLabel } from "@/lib/ui/labels";
import { detectAnswerColumn } from "./columnDetection";
import { readRows, resolveColumnMapping, columnToNumber } from "./QuestionnaireParserService";

export type ExportFormat = "xlsx" | "txt" | "filled";

export interface ExportFile {
  fileName: string;
  contentType: string;
  body: Buffer;
}

export class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportError";
  }
}

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const STATUS_LABELS: Record<string, string> = {
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PENDING: "Pending review",
  FLAGGED: "Flagged",
  SKIPPED: "Skipped",
};

async function loadQuestionnaire(questionnaireId: string, organizationId: string) {
  return prisma.questionnaire.findUniqueOrThrow({
    where: { id: questionnaireId, organizationId },
    include: {
      organization: { select: { name: true } },
      questions: {
        orderBy: { rowIndex: "asc" },
        include: {
          answers: {
            orderBy: { updatedAt: "desc" },
            take: 1,
            include: {
              sources: {
                include: { knowledgeEntry: { select: { question: true, domain: true } } },
                orderBy: { rank: "asc" },
              },
            },
          },
        },
      },
    },
  });
}

type LoadedQuestionnaire = Awaited<ReturnType<typeof loadQuestionnaire>>;
type LoadedAnswer = LoadedQuestionnaire["questions"][number]["answers"][number];

/** The text that may leave the app: approved answers only. */
export function exportedText(answer: Pick<LoadedAnswer, "status" | "content" | "editedContent"> | undefined): string {
  if (!answer || answer.status !== "APPROVED") return "";
  return answer.editedContent || answer.content;
}

export function statusLabel(status: string | undefined): string {
  return status ? (STATUS_LABELS[status] ?? status) : "No answer";
}

/** e.g. Vendor_A_answers_2026-10-24.xlsx */
export function exportFileName(name: string, kind: string, ext: string, date = new Date()): string {
  const safe = name.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "") || "questionnaire";
  return `${safe}_${kind}_${date.toISOString().slice(0, 10)}.${ext}`;
}

async function reviewWorkbook(q: LoadedQuestionnaire): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Answers");
  sheet.columns = [
    { header: "#", key: "n", width: 6 },
    { header: "Question", key: "question", width: 60 },
    { header: "Answer", key: "answer", width: 60 },
    { header: "Status", key: "status", width: 16 },
    { header: "Confidence", key: "confidence", width: 12 },
    { header: "Domain", key: "domain", width: 24 },
    { header: "Sources", key: "sources", width: 40 },
  ];
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "4F46E5" } };

  q.questions.forEach((question, i) => {
    const answer = question.answers[0];
    const row = sheet.addRow({
      n: i + 1,
      question: question.questionText,
      answer: exportedText(answer),
      status: statusLabel(answer?.status),
      confidence: answer ? `${Math.round(answer.confidence * 100)}%` : "",
      domain: domainLabel(question.domain),
      sources: answer?.sources.map((s) => s.knowledgeEntry.question.slice(0, 50)).join("; ") ?? "",
    });
    row.alignment = { vertical: "top", wrapText: true };
    if (answer) {
      const argb = answer.confidence >= 0.8 ? "D1FAE5" : answer.confidence >= 0.5 ? "FEF3C7" : "FEE2E2";
      row.getCell("confidence").fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
    }
  });

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: q.questions.length + 1, column: 7 } };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function textReport(q: LoadedQuestionnaire, date = new Date()): string {
  const approved = q.questions.filter((x) => x.answers[0]?.status === "APPROVED").length;
  const open = q.questions.length - approved;
  const out: string[] = [
    "SECURITY QUESTIONNAIRE REPORT",
    "=".repeat(60),
    "",
    `Organization:    ${q.organization.name}`,
    `Questionnaire:   ${q.name}`,
    `Report date:     ${date.toISOString().slice(0, 10)}`,
    `Questions:       ${q.questions.length}`,
    `Approved:        ${approved}`,
    `Not approved:    ${open}`,
    "",
    "APPROVED ANSWERS BY DOMAIN",
    "-".repeat(60),
  ];

  const domains = new Map<string, { total: number; approved: number }>();
  for (const x of q.questions) {
    const d = domainLabel(x.domain);
    const c = domains.get(d) ?? { total: 0, approved: 0 };
    c.total++;
    if (x.answers[0]?.status === "APPROVED") c.approved++;
    domains.set(d, c);
  }
  for (const [d, c] of domains) out.push(`  ${d.padEnd(30)} ${c.approved}/${c.total}`);

  out.push("", "QUESTIONS AND ANSWERS", "-".repeat(60));
  q.questions.forEach((x, i) => {
    const answer = x.answers[0];
    const text = exportedText(answer);
    out.push("", `${i + 1}. ${x.questionText}`);
    out.push(`    Domain: ${domainLabel(x.domain)} | Status: ${statusLabel(answer?.status)}`);
    out.push("");
    let line = "    ";
    for (const word of (text || "(Not answered yet)").split(/\s+/)) {
      if (line.length + word.length > 78) {
        out.push(line);
        line = "    " + word;
      } else {
        line += (line.trim() ? " " : "") + word;
      }
    }
    if (line.trim()) out.push(line);
    if (text && answer?.sources.length) {
      out.push("", "    Sources:");
      for (const s of answer.sources) {
        out.push(`      - ${domainLabel(s.knowledgeEntry.domain)}: ${s.knowledgeEntry.question.slice(0, 70)}`);
      }
    }
  });

  out.push("", "=".repeat(60), "Generated by CompliBot");
  return out.join("\n");
}

/** Write the approved answers into the customer's own file. */
async function filledFile(q: LoadedQuestionnaire): Promise<{ body: Buffer; ext: "xlsx" | "csv" }> {
  if (!q.filePath) {
    throw new ExportError(
      "This questionnaire has no uploaded file to fill in (it was started from a template). Use the Excel workbook instead.",
    );
  }
  if (!fs.existsSync(q.filePath)) {
    throw new ExportError(
      "The uploaded file is no longer on the server (uploads are not kept when the app container restarts). Use the Excel workbook instead.",
    );
  }
  const saved = (q.columnMapping ?? {}) as { questionCol?: string; answerCol?: string; headerRow?: number; sheetName?: string };
  const mapping = await resolveColumnMapping(q.filePath, saved);
  const questionCol = columnToNumber(mapping.questionCol) - 1;
  const hasHeader = (mapping.headerRow ?? 1) >= 1;
  const header = (await readRows(q.filePath, mapping.sheetName))[0] ?? [];
  const answerCol = saved.answerCol ? columnToNumber(saved.answerCol) - 1 : detectAnswerColumn(header, questionCol);
  const byRow = new Map(q.questions.map((x) => [x.rowIndex, exportedText(x.answers[0])]));

  if (q.filePath.toLowerCase().endsWith(".csv")) {
    const rows = Papa.parse<string[]>(fs.readFileSync(q.filePath, "utf-8"), { header: false, skipEmptyLines: true }).data;
    if (hasHeader && rows[0] && !String(rows[0][answerCol] ?? "").trim()) rows[0][answerCol] = "Response";
    for (const [rowIndex, text] of byRow) {
      const row = rows[rowIndex - 1];
      if (!row || !text) continue;
      while (row.length <= answerCol) row.push("");
      row[answerCol] = text;
    }
    return { body: Buffer.from(Papa.unparse(rows), "utf-8"), ext: "csv" };
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(q.filePath);
  const sheet = mapping.sheetName ? workbook.getWorksheet(mapping.sheetName) : workbook.worksheets[0];
  if (!sheet) throw new ExportError("The uploaded file's worksheet is missing.");
  if (hasHeader) {
    const cell = sheet.getRow(1).getCell(answerCol + 1);
    if (!String(cell.value ?? "").trim()) cell.value = "Response";
  }
  for (const [rowIndex, text] of byRow) {
    if (!text) continue;
    const cell = sheet.getRow(rowIndex).getCell(answerCol + 1);
    cell.value = text;
    cell.alignment = { ...cell.alignment, wrapText: true, vertical: "top" };
  }
  return { body: Buffer.from(await workbook.xlsx.writeBuffer()), ext: "xlsx" };
}

export async function exportQuestionnaire(
  questionnaireId: string,
  organizationId: string,
  format: ExportFormat,
): Promise<ExportFile> {
  const q = await loadQuestionnaire(questionnaireId, organizationId);

  let file: ExportFile;
  if (format === "txt") {
    file = {
      fileName: exportFileName(q.name, "report", "txt"),
      contentType: "text/plain; charset=utf-8",
      body: Buffer.from(textReport(q), "utf-8"),
    };
  } else if (format === "filled") {
    const { body, ext } = await filledFile(q);
    file = {
      fileName: exportFileName(q.name, "filled", ext),
      contentType: ext === "csv" ? "text/csv; charset=utf-8" : XLSX_TYPE,
      body,
    };
  } else {
    file = { fileName: exportFileName(q.name, "answers", "xlsx"), contentType: XLSX_TYPE, body: await reviewWorkbook(q) };
  }

  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const filePath = path.join(uploadsDir, `${Date.now()}_${file.fileName}`);
  fs.writeFileSync(filePath, file.body);

  await prisma.questionnaireExport.create({
    data: { questionnaireId, fileName: file.fileName, filePath, format },
  });
  await prisma.questionnaire.update({ where: { id: questionnaireId }, data: { status: "EXPORTED" } });
  logger.info("Questionnaire exported", { questionnaireId, format, fileName: file.fileName });

  return file;
}
