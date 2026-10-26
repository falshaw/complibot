import { describe, it, expect, vi, beforeEach } from "vitest";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import path from "path";

/**
 * Exports: only approved answers leave the app, questions are numbered 1..n,
 * and "filled" writes the answers into the customer's own file.
 */

const { db } = vi.hoisted(() => ({
  db: {
    questionnaire: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    questionnaireExport: { create: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({ default: db, prisma: db }));
vi.mock("fs", async (orig) => {
  const real = await orig<typeof import("fs")>();
  // keep the real reads; swallow the copy written to uploads/
  return { ...real, default: { ...real, writeFileSync: vi.fn(), mkdirSync: vi.fn() }, writeFileSync: vi.fn(), mkdirSync: vi.fn() };
});

import { exportQuestionnaire, exportedText, exportFileName } from "@/lib/services/ExportService";
import { detectAnswerColumn } from "@/lib/services/columnDetection";

const SAMPLES = path.resolve(__dirname, "../../../samples");

const answer = (status: string, content: string, edited: string | null = null) => ({
  status,
  content,
  editedContent: edited,
  confidence: 0.9,
  sources: [{ knowledgeEntry: { question: "Encryption at rest?", domain: "ENCRYPTION" } }],
});

// rowIndex = row in the sample files (header is row 1)
const questionnaire = (filePath: string | null) => ({
  id: "qn-1",
  name: "Vendor A / Q4",
  filePath,
  columnMapping: null,
  organization: { name: "Demo Ltd" },
  questions: [
    { rowIndex: 2, questionText: "Is customer data encrypted at rest?", domain: "ENCRYPTION", answers: [answer("APPROVED", "AES-256.", "AES-256 on every volume.")] },
    { rowIndex: 3, questionText: "Is traffic encrypted in transit?", domain: "ENCRYPTION", answers: [answer("REJECTED", "SECRET DRAFT TEXT")] },
    { rowIndex: 4, questionText: "Minimum password rules?", domain: "AUTHENTICATION", answers: [answer("PENDING", "PENDING DRAFT TEXT")] },
    { rowIndex: 5, questionText: "Vulnerability scanning?", domain: "VULNERABILITY_MANAGEMENT", answers: [] },
  ],
});

beforeEach(() => vi.clearAllMocks());

describe("exportedText", () => {
  it("exports approved answers only, edited text first", () => {
    expect(exportedText(answer("APPROVED", "a", "b"))).toBe("b");
    expect(exportedText(answer("APPROVED", "a"))).toBe("a");
    for (const s of ["REJECTED", "PENDING", "FLAGGED", "SKIPPED"]) expect(exportedText(answer(s, "a"))).toBe("");
    expect(exportedText(undefined)).toBe("");
  });
});

describe("exportFileName", () => {
  it("uses one name_kind_date pattern", () => {
    expect(exportFileName("Vendor A / Q4", "report", "txt", new Date("2026-10-24T09:00:00Z"))).toBe(
      "Vendor_A_Q4_report_2026-10-24.txt",
    );
  });
});

describe("detectAnswerColumn", () => {
  it("finds a response header, else the first free column", () => {
    expect(detectAnswerColumn(["ID", "Category", "Question", "Response"], 2)).toBe(3);
    expect(detectAnswerColumn(["Nr", "Frage", "Antwort"], 1)).toBe(2);
    expect(detectAnswerColumn(["ID", "Question", "Owner"], 1)).toBe(3);
  });
});

describe("text report", () => {
  it("never contains rejected or pending drafts and counts approved only", async () => {
    db.questionnaire.findUniqueOrThrow.mockResolvedValue(questionnaire(null));

    const file = await exportQuestionnaire("qn-1", "org-1", "txt");
    const text = file.body.toString("utf-8");

    expect(text).toContain("AES-256 on every volume.");
    expect(text).not.toContain("SECRET DRAFT TEXT");
    expect(text).not.toContain("PENDING DRAFT TEXT");
    expect(text).toContain("Approved:        1");
    expect(text).toContain("Encryption                     1/2");
    expect(text).toMatch(/^1\. Is customer data/m);
    expect(text).toMatch(/^4\. Vulnerability scanning/m);
    expect(text).toContain("Status: Rejected");
    expect(text).toContain("(Rejected, not exported)");
    expect(text).toContain("(Waiting for review, not exported)");
    expect(text).toContain("(Not answered yet)");
    expect(text).not.toContain("VULNERABILITY_MANAGEMENT");
    expect(file.fileName).toMatch(/^Vendor_A_Q4_report_\d{4}-\d{2}-\d{2}\.txt$/);
  });
});

describe("review workbook", () => {
  it("leaves the answer cell empty for anything not approved", async () => {
    db.questionnaire.findUniqueOrThrow.mockResolvedValue(questionnaire(null));

    const file = await exportQuestionnaire("qn-1", "org-1", "xlsx");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file.body as unknown as ArrayBuffer);
    const sheet = wb.worksheets[0];

    expect(sheet.getRow(2).getCell(1).value).toBe(1);
    expect(sheet.getRow(2).getCell(3).value).toBe("AES-256 on every volume.");
    expect(sheet.getRow(3).getCell(3).value ?? "").toBe("");
    expect(sheet.getRow(3).getCell(4).value).toBe("Rejected");
    // a hand-edited answer has no generated score of its own
    expect(sheet.getRow(2).getCell(5).value).toBe("edited by hand");
    expect(sheet.getRow(3).getCell(5).value).toBe("90%");
    expect(db.questionnaire.update).toHaveBeenCalledWith({ where: { id: "qn-1" }, data: { status: "EXPORTED" } });
  });
});

describe("fill the uploaded file", () => {
  it("writes approved answers into the Response column of the customer's xlsx", async () => {
    db.questionnaire.findUniqueOrThrow.mockResolvedValue(questionnaire(path.join(SAMPLES, "vendor-questionnaire.xlsx")));

    const file = await exportQuestionnaire("qn-1", "org-1", "filled");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file.body as unknown as ArrayBuffer);
    const sheet = wb.worksheets[0];

    expect(sheet.getRow(1).getCell(4).value).toBe("Response");
    expect(sheet.getRow(2).getCell(4).value).toBe("AES-256 on every volume.");
    expect(sheet.getRow(3).getCell(4).value ?? "").toBe("");
    expect(sheet.getRow(4).getCell(4).value ?? "").toBe("");
    expect(file.fileName).toMatch(/_filled_.*\.xlsx$/);
  });

  it("does the same for a CSV and keeps the other columns", async () => {
    db.questionnaire.findUniqueOrThrow.mockResolvedValue(questionnaire(path.join(SAMPLES, "vendor-questionnaire.csv")));

    const file = await exportQuestionnaire("qn-1", "org-1", "filled");
    const rows = Papa.parse<string[]>(file.body.toString("utf-8")).data;

    expect(rows[0]).toEqual(["ID", "Category", "Question", "Response"]);
    expect(rows[1][3]).toBe("AES-256 on every volume.");
    expect(rows[1][2]).toContain("encrypted at rest");
    expect(rows[2][3]).toBe("");
    expect(file.fileName).toMatch(/_filled_.*\.csv$/);
  });

  it("explains that a template questionnaire has no file to fill", async () => {
    db.questionnaire.findUniqueOrThrow.mockResolvedValue(questionnaire(null));

    await expect(exportQuestionnaire("qn-1", "org-1", "filled")).rejects.toThrow(/no uploaded file/);
  });
});
