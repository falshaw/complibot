import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { apiHandler } from "@/lib/apiHandler";
import { rolesFor } from "@/lib/permissions";
import { ExportError, exportQuestionnaire, type ExportFormat } from "@/lib/services/ExportService";

const FORMATS: ExportFormat[] = ["xlsx", "txt", "filled"];

// POST /api/questionnaires/[id]/export?format=xlsx|txt|filled - Export questionnaire
export const POST = apiHandler(async ({ params, user, organizationId, req }) => {
  const format = (new URL(req.url).searchParams.get("format") || "xlsx") as ExportFormat;
  if (!FORMATS.includes(format)) {
    return NextResponse.json({ error: `Unknown format. Use one of: ${FORMATS.join(", ")}` }, { status: 400 });
  }

  let file;
  try {
    file = await exportQuestionnaire(params.id, organizationId, format);
  } catch (error) {
    if (error instanceof ExportError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }

  await audit({
    organizationId,
    userId: user.id,
    action: "questionnaire.export",
    entityType: "Questionnaire",
    entityId: params.id,
    details: { format, fileName: file.fileName },
    req,
  });

  return new NextResponse(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.fileName}"`,
    },
  });
}, { roles: rolesFor("draft") });
