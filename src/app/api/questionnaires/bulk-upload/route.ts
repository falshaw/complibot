/**
 * CompliBot - Bulk Upload API (CB-04)
 * Accept multiple questionnaire files in a single upload.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { checkPlanLimit, incrementUsage } from "@/lib/billing";
import * as fs from "fs";
import * as path from "path";

const MAX_FILES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
const ALLOWED_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
];
const ALLOWED_EXTENSIONS = [".xlsx", ".xls", ".csv"];

/**
 * POST /api/questionnaires/bulk-upload
 * Accepts multipart FormData with multiple files.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user as { id: string; organizationId: string };
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_FILES} files allowed per upload` },
        { status: 400 },
      );
    }

    // Check questionnaire plan limit before processing files
    const limitCheck = await checkPlanLimit(
      user.organizationId,
      "questionnairesPerMonth",
    );
    if (!limitCheck.allowed) {
      return NextResponse.json({ error: limitCheck.reason }, { status: 403 });
    }

    // For free tier, check if adding these files would exceed the limit
    if (
      limitCheck.limit !== undefined &&
      limitCheck.limit !== -1 &&
      limitCheck.current !== undefined
    ) {
      const remaining = limitCheck.limit - limitCheck.current;
      if (files.length > remaining) {
        return NextResponse.json(
          {
            error: `You can only upload ${remaining} more questionnaire(s) this month (limit: ${limitCheck.limit}). Upgrade your plan for more.`,
          },
          { status: 403 },
        );
      }
    }

    const uploadsDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(uploadsDir))
      fs.mkdirSync(uploadsDir, { recursive: true });

    const results: Array<{
      fileName: string;
      status: "uploaded" | "error";
      questionnaireId?: string;
      error?: string;
    }> = [];

    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase();

      // Validate extension
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        results.push({
          fileName: file.name,
          status: "error",
          error: `Unsupported file type: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`,
        });
        continue;
      }

      // Validate MIME type
      if (!ALLOWED_TYPES.includes(file.type) && file.type !== "") {
        results.push({
          fileName: file.name,
          status: "error",
          error: `Invalid MIME type: ${file.type}`,
        });
        continue;
      }

      // Validate size
      if (file.size > MAX_FILE_SIZE) {
        results.push({
          fileName: file.name,
          status: "error",
          error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max: 10MB`,
        });
        continue;
      }

      try {
        // Save file to disk
        const buffer = Buffer.from(await file.arrayBuffer());
        const safeFileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const filePath = path.join(uploadsDir, safeFileName);
        fs.writeFileSync(filePath, buffer);

        // Create questionnaire record
        const questionnaire = await prisma.questionnaire.create({
          data: {
            organizationId: user.organizationId,
            name: file.name.replace(/\.[^.]+$/, ""),
            fileName: file.name,
            filePath,
            status: "UPLOADED",
          },
        });

        // Track usage
        await incrementUsage(user.organizationId, "questionnaires");

        results.push({
          fileName: file.name,
          status: "uploaded",
          questionnaireId: questionnaire.id,
        });

        logger.info("Bulk upload: file saved", {
          fileName: file.name,
          questionnaireId: questionnaire.id,
        });
      } catch (err) {
        results.push({
          fileName: file.name,
          status: "error",
          error: "Failed to process file",
        });
        logger.error("Bulk upload: file failed", {
          fileName: file.name,
          error: err,
        });
      }
    }

    const uploaded = results.filter((r) => r.status === "uploaded").length;
    const failed = results.filter((r) => r.status === "error").length;

    return NextResponse.json({
      success: true,
      summary: { total: files.length, uploaded, failed },
      results,
    });
  } catch (error) {
    logger.error("Bulk upload error", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
