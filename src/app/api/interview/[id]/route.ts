import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/apiHandler";
import prisma from "@/lib/prisma";
import { interviewState } from "@/lib/services/InterviewService";

// GET /api/interview/[id] - Get interview state (transformed for frontend)
export const GET = apiHandler(async ({ params, organizationId }) => {
  const session = await prisma.interviewSession.findFirst({
    where: { id: params.id, organizationId },
  });

  if (!session) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }

  return NextResponse.json(interviewState(session));
});
