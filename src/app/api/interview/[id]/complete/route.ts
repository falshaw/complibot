import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { apiHandler } from "@/lib/apiHandler";
import { rolesFor } from "@/lib/permissions";
import prisma from "@/lib/prisma";

// POST /api/interview/[id]/complete - Finalize interview
export const POST = apiHandler(async ({ req, params, user, organizationId }) => {
  const existing = await prisma.interviewSession.findFirst({
    where: { id: params.id, organizationId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }

  const session = await prisma.interviewSession.update({
    where: { id: params.id },
    data: { status: "completed" },
  });
  await audit({
    organizationId,
    userId: user.id,
    action: "interview.complete",
    entityType: "InterviewSession",
    entityId: session.id,
    details: { entriesCreated: session.entriesCreated },
    req,
  });

  return NextResponse.json({
    message: "Interview completed",
    entriesCreated: session.entriesCreated,
    questionsAsked: session.questionsAsked,
    domainsCompleted: session.domainsCompleted,
  });
}, { roles: rolesFor("knowledge") });
