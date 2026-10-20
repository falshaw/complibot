import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { apiHandler } from "@/lib/apiHandler";
import { startInterview } from "@/lib/services/InterviewService";

// POST /api/interview - Start new interview session
export const POST = apiHandler(async ({ req, user, organizationId }) => {
  const result = await startInterview(organizationId, user.id);
  await audit({
    organizationId,
    userId: user.id,
    action: "interview.start",
    entityType: "InterviewSession",
    entityId: result.sessionId,
    req,
  });
  return NextResponse.json(result, { status: 201 });
});
