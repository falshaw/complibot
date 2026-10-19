import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/apiHandler";
import { startInterview } from "@/lib/services/InterviewService";

// POST /api/interview - Start new interview session
export const POST = apiHandler(async ({ user, organizationId }) => {
  const result = await startInterview(organizationId, user.id);
  return NextResponse.json(result, { status: 201 });
});
