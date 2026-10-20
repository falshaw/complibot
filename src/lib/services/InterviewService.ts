/**
 * CompliBot - Interview Service
 * Domain-cycling AI interview to build knowledge base interactively.
 */

import prisma from "@/lib/prisma";
import { embedKnowledgeEntry } from "./EmbeddingService";
import { logger } from "@/lib/logger";
import { ollamaChatWithBreaker, OLLAMA_MODEL } from "@/lib/ollama";
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

/**
 * Start a new interview session
 */
export async function startInterview(
  organizationId: string,
  userId: string,
): Promise<{
  sessionId: string;
  firstQuestion: string;
  domain: SecurityDomain;
}> {
  const firstDomain = DOMAIN_ORDER[0];
  const firstQuestion = DOMAIN_QUESTIONS[firstDomain][0];

  const session = await prisma.interviewSession.create({
    data: {
      organizationId,
      userId,
      status: "active",
      currentDomain: firstDomain,
      domainsCompleted: [],
      questionsAsked: 1,
      conversationLog: [
        {
          role: "assistant",
          content: firstQuestion,
          domain: firstDomain,
          timestamp: new Date().toISOString(),
        },
      ],
    },
  });

  return { sessionId: session.id, firstQuestion, domain: firstDomain };
}

/**
 * Process a user response in the interview and return the next question
 */
export async function processResponse(
  sessionId: string,
  userResponse: string,
): Promise<{
  nextQuestion: string | null;
  domain: SecurityDomain;
  isComplete: boolean;
  entriesCreated: number;
}> {
  const session = await prisma.interviewSession.findUniqueOrThrow({
    where: { id: sessionId },
  });

  if (session.status !== "active") {
    throw new Error("Interview session is not active");
  }

  const conversationLog =
    (session.conversationLog as Array<{
      role: string;
      content: string;
      domain: string;
      timestamp: string;
    }>) || [];

  // Get the last question asked
  const lastQuestion = conversationLog
    .filter((m) => m.role === "assistant")
    .pop();

  // Create KB entry from the Q&A pair
  let entriesCreated = 0;
  if (lastQuestion && userResponse.trim().length > 10) {
    // Use GPT to extract a clean Q&A pair
    const extraction = await ollamaChatWithBreaker({
      model: OLLAMA_MODEL,
      messages: [
        {
          role: "system",
          content: `Extract a clean knowledge base entry from this interview exchange. Return JSON with "question" and "answer" fields. The question should be a generic security questionnaire question, and the answer should be a professional response based on what the user said.`,
        },
        {
          role: "user",
          content: `Interviewer asked: "${lastQuestion.content}"\nUser responded: "${userResponse}"`,
        },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    try {
      const extracted = JSON.parse(
        extraction.choices[0]?.message?.content || "{}",
      );
      if (extracted.question && extracted.answer) {
        const entry = await prisma.knowledgeEntry.create({
          data: {
            organizationId: session.organizationId,
            question: extracted.question,
            answer: extracted.answer,
            domain: session.currentDomain,
            keywords: [],
          },
        });

        // Generate embedding in background (optional; keyword search works without it)
        embedKnowledgeEntry(
          entry.id,
          extracted.question,
          extracted.answer,
        ).catch(() => {
          /* logged and paused inside embedKnowledgeEntry */
        });
        entriesCreated = 1;
      }
    } catch {
      logger.warn("Failed to extract KB entry from interview response");
    }
  }

  // Add user response to log
  conversationLog.push({
    role: "user",
    content: userResponse,
    domain: session.currentDomain,
    timestamp: new Date().toISOString(),
  });

  // Determine next question
  const currentDomainQuestions = DOMAIN_QUESTIONS[session.currentDomain] || [];
  const askedInDomain = conversationLog.filter(
    (m) => m.role === "assistant" && m.domain === session.currentDomain,
  ).length;

  let nextQuestion: string | null = null;
  let nextDomain = session.currentDomain;
  const domainsCompleted = [...(session.domainsCompleted || [])];

  if (askedInDomain < currentDomainQuestions.length) {
    // More questions in this domain
    nextQuestion = currentDomainQuestions[askedInDomain];
  } else {
    // Move to next domain
    domainsCompleted.push(session.currentDomain);
    const currentIndex = DOMAIN_ORDER.indexOf(session.currentDomain);
    if (currentIndex < DOMAIN_ORDER.length - 1) {
      nextDomain = DOMAIN_ORDER[currentIndex + 1];
      nextQuestion = DOMAIN_QUESTIONS[nextDomain]?.[0] || null;
    }
  }

  const isComplete = nextQuestion === null;

  if (nextQuestion) {
    conversationLog.push({
      role: "assistant",
      content: nextQuestion,
      domain: nextDomain,
      timestamp: new Date().toISOString(),
    });
  }

  await prisma.interviewSession.update({
    where: { id: sessionId },
    data: {
      currentDomain: nextDomain,
      domainsCompleted,
      questionsAsked: session.questionsAsked + 1,
      entriesCreated: session.entriesCreated + entriesCreated,
      conversationLog,
      status: isComplete ? "completed" : "active",
    },
  });

  return { nextQuestion, domain: nextDomain, isComplete, entriesCreated };
}
