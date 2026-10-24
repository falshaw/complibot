import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/apiHandler";
import { rolesFor } from "@/lib/permissions";
import { interviewState, processResponse } from "@/lib/services/InterviewService";
import prisma from "@/lib/prisma";

const respondSchema = z.object({
  response: z.string().min(1).max(5000),
});

// POST /api/interview/[id]/respond - Submit answer, return full state
export const POST = apiHandler(
  async ({ body, params, organizationId }) => {
    const owned = await prisma.interviewSession.findFirst({
      where: { id: params.id, organizationId },
      select: { status: true },
    });
    if (!owned) {
      return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    }
    if (owned.status !== "active") {
      return NextResponse.json(
        { error: "This interview is finished." },
        { status: 409 },
      );
    }

    await processResponse(params.id, body.response);

    // Re-fetch updated session and return transformed state
    const session = await prisma.interviewSession.findUniqueOrThrow({
      where: { id: params.id },
    });

    return NextResponse.json(interviewState(session));
  },
  { roles: rolesFor("knowledge"), schema: respondSchema },
);
