import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { apiHandler } from "@/lib/apiHandler";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { z } from "zod";
import { RATE_LIMITS } from "@/lib/rateLimit";

const columnMappingSchema = z
  .object({
    questionCol: z.string().min(1).max(10),
    answerCol: z.string().min(1).max(10).optional(),
    sheetName: z.string().max(100).optional(),
    headerRow: z.number().int().min(0).max(1000).optional(),
  })
  .strict();

// GET /api/questionnaires
export const GET = apiHandler(async ({ req, organizationId }) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(
    Math.max(1, parseInt(searchParams.get("limit") || "20")),
    100,
  );

  const where: Record<string, unknown> = { organizationId };
  if (status) where.status = status;

  const [questionnaires, total] = await Promise.all([
    prisma.questionnaire.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.questionnaire.count({ where }),
  ]);

  return NextResponse.json({
    questionnaires,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
});

// POST /api/questionnaires - Upload new questionnaire
export const POST = apiHandler(
  async ({ req, user, organizationId }) => {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const name = formData.get("name") as string;
    const columnMapping = formData.get("columnMapping") as string;

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Validate file type
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext || "")) {
      return NextResponse.json(
        { error: "Only Excel (.xlsx/.xls) and CSV files are supported" },
        { status: 400 },
      );
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size must be under 10MB" },
        { status: 400 },
      );
    }

    // Validate columnMapping if provided
    let parsedColumnMapping = null;
    if (columnMapping) {
      try {
        const parsed = JSON.parse(columnMapping);
        parsedColumnMapping = columnMappingSchema.parse(parsed);
      } catch {
        return NextResponse.json(
          {
            error:
              "Invalid columnMapping. Expected: { questionCol: string, answerCol?: string, sheetName?: string, headerRow?: number }",
          },
          { status: 400 },
        );
      }
    }

    // Save file with UUID-based name to prevent path traversal
    const uploadsDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(uploadsDir))
      fs.mkdirSync(uploadsDir, { recursive: true });

    const safeExt = ext || "xlsx";
    const fileName = `q_${crypto.randomUUID()}.${safeExt}`;
    const filePath = path.resolve(uploadsDir, fileName);

    // Verify resolved path stays within uploads directory
    if (!filePath.startsWith(path.resolve(uploadsDir))) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    const questionnaire = await prisma.questionnaire.create({
      data: {
        organizationId,
        name,
        fileName: file.name,
        filePath,
        status: "UPLOADED",
        columnMapping: parsedColumnMapping ?? Prisma.JsonNull,
      },
    });

    await audit({
      organizationId,
      userId: user.id,
      action: "questionnaire.upload",
      entityType: "Questionnaire",
      entityId: questionnaire.id,
      details: { fileName: file.name },
      req,
    });

    return NextResponse.json(questionnaire, { status: 201 });
  },
  { rateLimit: RATE_LIMITS.upload },
);
