/**
 * CompliBot - Export Service
 * Exports questionnaire answers back to Excel format.
 */

import ExcelJS from "exceljs";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import * as fs from "fs";
import * as path from "path";

/**
 * Export questionnaire with answers to Excel
 */
export async function exportToExcel(
  questionnaireId: string,
  organizationId: string,
): Promise<{ filePath: string; fileName: string }> {
  const questionnaire = await prisma.questionnaire.findUniqueOrThrow({
    where: { id: questionnaireId, organizationId },
    include: {
      questions: {
        orderBy: { rowIndex: "asc" },
        include: {
          answers: {
            orderBy: { updatedAt: "desc" },
            take: 1,
            include: {
              sources: {
                include: {
                  knowledgeEntry: { select: { question: true, domain: true } },
                },
                orderBy: { rank: "asc" },
              },
            },
          },
        },
      },
    },
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Questionnaire Answers");

  // Header row
  sheet.columns = [
    { header: "#", key: "row", width: 6 },
    { header: "Question", key: "question", width: 60 },
    { header: "Answer", key: "answer", width: 60 },
    { header: "Confidence", key: "confidence", width: 12 },
    { header: "Status", key: "status", width: 12 },
    { header: "Domain", key: "domain", width: 22 },
    { header: "Sources", key: "sources", width: 40 },
  ];

  // Style header
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "4F46E5" },
  };

  // Data rows
  for (const question of questionnaire.questions) {
    const answer = question.answers[0];
    const answerText = answer?.editedContent || answer?.content || "";
    const sourceRefs =
      answer?.sources
        ?.map((s) => s.knowledgeEntry.question.slice(0, 50))
        .join("; ") || "";

    const row = sheet.addRow({
      row: question.rowIndex,
      question: question.questionText,
      answer: answerText,
      confidence: answer ? `${Math.round(answer.confidence * 100)}%` : "N/A",
      status: answer?.status || "NO ANSWER",
      domain: question.domain.replace(/_/g, " "),
      sources: sourceRefs,
    });

    // Color code confidence
    if (answer) {
      const confCell = row.getCell("confidence");
      if (answer.confidence >= 0.8) {
        confCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "D1FAE5" },
        };
      } else if (answer.confidence >= 0.5) {
        confCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FEF3C7" },
        };
      } else {
        confCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FEE2E2" },
        };
      }
    }
  }

  // Auto-filter
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: questionnaire.questions.length + 1, column: 7 },
  };

  const fileName = `${questionnaire.name.replace(/[^a-zA-Z0-9]/g, "_")}_answers_${Date.now()}.xlsx`;
  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const filePath = path.join(uploadsDir, fileName);

  await workbook.xlsx.writeFile(filePath);

  // Record export
  await prisma.questionnaireExport.create({
    data: {
      questionnaireId,
      fileName,
      filePath,
      format: "xlsx",
    },
  });

  // Update questionnaire status
  await prisma.questionnaire.update({
    where: { id: questionnaireId },
    data: { status: "EXPORTED" },
  });

  logger.info("Questionnaire exported", { questionnaireId, fileName });

  return { filePath, fileName };
}
