import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/apiHandler";
import { processResponse } from "@/lib/services/InterviewService";
import prisma from "@/lib/prisma";
import type { SecurityDomain } from "@prisma/client";

const DOMAIN_ORDER: SecurityDomain[] = [
  "ACCESS_CONTROL",
  "AUTHENTICATION",
  "ENCRYPTION",
  "DATA_PROTECTION",
  "INCIDENT_RESPONSE",
  "NETWORK_SECURITY",
  "CLOUD_SECURITY",
  "BUSINESS_CONTINUITY",
  "CHANGE_MANAGEMENT",
  "VULNERABILITY_MANAGEMENT",
  "LOGGING_MONITORING",
  "THIRD_PARTY_RISK",
  "COMPLIANCE",
  "PRIVACY",
  "ENDPOINT_SECURITY",
  "APPLICATION_SECURITY",
  "IDENTITY_MANAGEMENT",
  "GOVERNANCE",
  "PHYSICAL_SECURITY",
  "GENERAL",
];

const DOMAIN_QUESTIONS: Record<string, string[]> = {
  ACCESS_CONTROL: [
    "How do you manage user access to systems and applications?",
    "Describe your process for granting, reviewing, and revoking access rights.",
    "Do you implement the principle of least privilege?",
  ],
  AUTHENTICATION: [
    "What authentication methods do you use (passwords, MFA, SSO)?",
    "Describe your password policy requirements.",
    "Do you use multi-factor authentication? For which systems?",
  ],
  ENCRYPTION: [
    "What encryption do you use for data at rest?",
    "How do you encrypt data in transit?",
    "Describe your key management practices.",
  ],
  DATA_PROTECTION: [
    "How do you classify data by sensitivity level?",
    "Describe your data retention and disposal policies.",
    "How do you handle personal data (PII)?",
  ],
  INCIDENT_RESPONSE: [
    "Do you have a formal incident response plan?",
    "What are your notification timelines for security incidents?",
    "Describe your incident classification and escalation procedures.",
  ],
  NETWORK_SECURITY: [
    "How do you segment your network?",
    "What firewall and intrusion detection systems do you use?",
    "Describe your network monitoring practices.",
  ],
  CLOUD_SECURITY: [
    "Which cloud providers do you use?",
    "How do you secure cloud configurations?",
    "Describe your cloud access management approach.",
  ],
  BUSINESS_CONTINUITY: [
    "Do you have a business continuity plan?",
    "What are your backup procedures and frequencies?",
    "What are your RPO and RTO targets?",
  ],
  CHANGE_MANAGEMENT: [
    "Describe your change management process.",
    "How do you test changes before deploying to production?",
    "How do you handle emergency changes?",
  ],
  VULNERABILITY_MANAGEMENT: [
    "How often do you perform vulnerability scans?",
    "Describe your patch management process.",
    "Do you conduct penetration testing? How often?",
  ],
  LOGGING_MONITORING: [
    "What events do you log?",
    "How long do you retain logs?",
    "Do you use a SIEM or centralized logging solution?",
  ],
  THIRD_PARTY_RISK: [
    "How do you assess vendor security?",
    "Do you require vendors to meet specific security standards?",
    "How do you monitor ongoing vendor risk?",
  ],
  COMPLIANCE: [
    "What compliance frameworks do you follow (SOC 2, ISO 27001, etc.)?",
    "Are you currently certified for any standards?",
    "How do you handle compliance audits?",
  ],
  PRIVACY: [
    "How do you comply with GDPR or other privacy regulations?",
    "Do you have a Data Protection Officer?",
    "How do you handle data subject access requests?",
  ],
  ENDPOINT_SECURITY: [
    "What endpoint protection solutions do you use?",
    "How do you manage mobile devices?",
    "Do you use endpoint detection and response (EDR)?",
  ],
  APPLICATION_SECURITY: [
    "Do you perform secure code reviews?",
    "Describe your SDLC security practices.",
    "Do you use static or dynamic application security testing?",
  ],
  IDENTITY_MANAGEMENT: [
    "Do you use a centralized identity provider?",
    "How do you manage service accounts?",
    "Describe your user lifecycle management process.",
  ],
  GOVERNANCE: [
    "Do you have a dedicated information security team?",
    "How is security governance structured in your organization?",
    "How do you communicate security policies to employees?",
  ],
  PHYSICAL_SECURITY: [
    "How do you control physical access to data centers?",
    "Do you use surveillance systems?",
    "Describe environmental controls for your facilities.",
  ],
  GENERAL: [
    "Is there anything else about your security posture you'd like to document?",
  ],
};

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

    const domainIndex = DOMAIN_ORDER.indexOf(session.currentDomain);
    const conversationLog =
      (session.conversationLog as Array<{
        role: string;
        content: string;
        domain: string;
        timestamp: string;
      }>) || [];

    const questionsForDomain = DOMAIN_QUESTIONS[session.currentDomain] || [];
    const questionsAskedInDomain = conversationLog.filter(
      (m) => m.role === "assistant" && m.domain === session.currentDomain,
    ).length;
    const questionIndex = Math.min(
      questionsAskedInDomain,
      questionsForDomain.length - 1,
    );
    const currentQuestion = questionsForDomain[questionIndex] || "";

    return NextResponse.json({
      id: session.id,
      status: session.status,
      currentDomain: session.currentDomain,
      currentQuestion,
      domainIndex,
      questionIndex,
      totalDomains: DOMAIN_ORDER.length,
      entriesCreated: session.entriesCreated,
      messages: conversationLog.map((m) => ({
        role: m.role,
        content: m.content,
        domain: m.domain,
      })),
    });
  },
  { schema: respondSchema },
);
