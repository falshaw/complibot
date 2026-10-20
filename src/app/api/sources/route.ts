import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { apiHandler } from "@/lib/apiHandler";
import prisma from "@/lib/prisma";
import { RATE_LIMITS } from "@/lib/rateLimit";
import { ingestQuestionnaireAsKB } from "@/lib/services/QuestionnaireParserService";
import * as fs from "fs";
import * as path from "path";

const columnMappingSchema = z
  .object({
    questionCol: z.string().min(1).max(10),
    answerCol: z.string().min(1).max(10).optional(),
    sheetName: z.string().max(100).optional(),
    headerRow: z.number().int().min(0).max(1000).optional(),
  })
  .strict();

// GET /api/sources - List sources
export const GET = apiHandler(async ({ req, organizationId }) => {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(
    Math.max(1, parseInt(searchParams.get("limit") || "20")),
    100,
  );

  const where = { organizationId };

  const [sources, total] = await Promise.all([
    prisma.knowledgeSource.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.knowledgeSource.count({ where }),
  ]);

  return NextResponse.json({
    sources,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
});

// POST /api/sources - Upload source file for KB ingestion
export const POST = apiHandler(
  async ({ req, user, organizationId }) => {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const sourceType =
      (formData.get("sourceType") as string) || "QUESTIONNAIRE";
    const columnMapping = formData.get("columnMapping") as string;

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    // ExcelJS reads .xlsx only (not the old binary .xls); PDF and Word
    // documents are not parsed at all.
    if (!["xlsx", "csv"].includes(ext || "")) {
      return NextResponse.json(
        { error: "Only Excel (.xlsx) and CSV files are supported" },
        { status: 400 },
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size must be under 10MB" },
        { status: 400 },
      );
    }

    // Save file
    const uploadsDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(uploadsDir))
      fs.mkdirSync(uploadsDir, { recursive: true });

    const fileName = `src_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const filePath = path.resolve(uploadsDir, fileName);

    // Verify resolved path stays within uploads directory
    if (!filePath.startsWith(path.resolve(uploadsDir))) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    // Create source record
    const source = await prisma.knowledgeSource.create({
      data: {
        organizationId,
        name: file.name,
        sourceType: sourceType as
          | "QUESTIONNAIRE"
          | "POLICY"
          | "INTERVIEW"
          | "MANUAL",
        fileName: file.name,
        filePath,
        fileSize: file.size,
        mimeType: file.type,
        status: "processing",
      },
    });

    // Process in background for Excel/CSV with answer columns
    if (columnMapping) {
      let mapping;
      try {
        const parsed = JSON.parse(columnMapping);
        mapping = columnMappingSchema.parse(parsed);
      } catch {
        return NextResponse.json(
          {
            error:
              "Invalid columnMapping. Expected: { questionCol: string, answerCol?: string, sheetName?: string, headerRow?: number }",
          },
          { status: 400 },
        );
      }
      ingestQuestionnaireAsKB(
        source.id,
        filePath,
        mapping,
        organizationId,
      ).catch(async (err) => {
        await prisma.knowledgeSource.update({
          where: { id: source.id },
          data: { status: "failed", errorMessage: err.message },
        });
      });
    } else {
      // Mark as pending manual processing for now
      await prisma.knowledgeSource.update({
        where: { id: source.id },
        data: { status: "pending" },
      });
    }

    await audit({
      organizationId,
      userId: user.id,
      action: "knowledge.source_upload",
      entityType: "KnowledgeSource",
      entityId: source.id,
      details: { fileName: source.fileName },
      req,
    });

    return NextResponse.json(source, { status: 201 });
  },
  { rateLimit: RATE_LIMITS.upload },
);
