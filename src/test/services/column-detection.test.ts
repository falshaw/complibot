import { describe, it, expect, vi, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  detectQuestionColumn,
  numberToColumn,
} from "@/lib/services/columnDetection";

vi.mock("@/lib/prisma", () => ({ default: {}, getPool: vi.fn() }));
vi.mock("@/lib/ollama", () => ({
  OLLAMA_MODEL: "test-model",
  ollamaChatWithBreaker: vi.fn(),
}));

import { resolveColumnMapping, parseCSV } from "@/lib/services/QuestionnaireParserService";

describe("detectQuestionColumn", () => {
  it("finds a 'Question' header in any column", () => {
    const rows = [
      ["ID", "Category", "Question", "Answer"],
      ["1", "Crypto", "Do you encrypt data at rest?", ""],
    ];
    expect(detectQuestionColumn(rows)).toEqual({
      questionCol: "C",
      headerRow: 1,
      reason: "header",
    });
  });

  it("matches header names case-insensitively, incl. German 'Frage'", () => {
    expect(detectQuestionColumn([["Nr", "FRAGE"], ["1", "Wird verschlüsselt?"]]))
      .toMatchObject({ questionCol: "B", reason: "header" });
    expect(detectQuestionColumn([["questions"], ["Is MFA enforced?"]]))
      .toMatchObject({ questionCol: "A", reason: "header" });
  });

  it("falls back to the column whose cells end in '?'", () => {
    const rows = [
      ["Ref", "Area", "Item"],
      ["AC-1", "Access Control", "Is access reviewed quarterly?"],
      ["CR-1", "Cryptography", "Do you encrypt backups?"],
    ];
    expect(detectQuestionColumn(rows)).toEqual({
      questionCol: "C",
      headerRow: 1,
      reason: "question-marks",
    });
  });

  it("uses the first text column when nothing ends in '?'", () => {
    const rows = [
      ["#", "Control"],
      ["1", "Describe your encryption at rest"],
      ["2", "Describe your backup strategy"],
    ];
    expect(detectQuestionColumn(rows)).toMatchObject({
      questionCol: "B",
      reason: "first-text-column",
    });
  });

  it("treats the first row as data when it is already a question", () => {
    const rows = [
      ["1", "Do you encrypt data at rest?"],
      ["2", "Do you enforce MFA?"],
    ];
    expect(detectQuestionColumn(rows)).toEqual({
      questionCol: "B",
      headerRow: 0,
      reason: "question-marks",
    });
  });

  it("returns null when no column holds text", () => {
    expect(detectQuestionColumn([["a", "b"], ["1", "2"]])).toBeNull();
    expect(detectQuestionColumn([])).toBeNull();
  });

  it("converts indexes to column letters", () => {
    expect([0, 1, 25, 26, 27].map(numberToColumn)).toEqual([
      "A",
      "B",
      "Z",
      "AA",
      "AB",
    ]);
  });
});

describe("resolveColumnMapping", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "complibot-cols-"));
  afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it("detects the column of a CSV whose questions are in column A", async () => {
    const file = path.join(tmpDir, "q.csv");
    fs.writeFileSync(
      file,
      "Question,Notes\nDo you encrypt customer data at rest?,\nDo you enforce MFA?,\n",
    );
    const mapping = await resolveColumnMapping(file, {});
    expect(mapping).toMatchObject({ questionCol: "A", headerRow: 1 });
    const questions = await parseCSV(file, mapping);
    expect(questions.map((q) => q.questionText)).toEqual([
      "Do you encrypt customer data at rest?",
      "Do you enforce MFA?",
    ]);
  });

  it("keeps an explicit questionCol (normalised to upper case)", async () => {
    await expect(resolveColumnMapping("unused.csv", { questionCol: "b" }))
      .resolves.toMatchObject({ questionCol: "B" });
    await expect(
      resolveColumnMapping("unused.csv", { questionCol: "1" }),
    ).rejects.toThrow(/Invalid questionCol/);
  });
});
