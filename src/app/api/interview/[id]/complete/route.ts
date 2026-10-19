import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/apiHandler";
import prisma from "@/lib/prisma";

// POST /api/interview/[id]/complete - Finalize interview
export const POST = apiHandler(async ({ params }) => {
  const session = await prisma.interviewSession.update({
    where: { id: params.id },
    data: { status: "completed" },
  });

  return NextResponse.json({
    message: "Interview completed",
    entriesCreated: session.entriesCreated,
    questionsAsked: session.questionsAsked,
    domainsCompleted: session.domainsCompleted,
  });
});
