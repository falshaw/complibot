import "dotenv/config";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { DEMO_KNOWLEDGE } from "../src/lib/demo-knowledge";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding CompliBot database...");

  // Create demo organization
  const org = await prisma.organization.upsert({
    where: { id: "org-demo" },
    update: {},
    create: {
      id: "org-demo",
      name: "Demo Security Corp",
    },
  });

  // Demo users. The password is only set when the users are first created;
  // re-running the seed leaves existing passwords alone.
  const adminExists = await prisma.user.findUnique({
    where: { email: "admin@demo.com" },
    select: { id: true },
  });
  // The login form requires >= 12 characters incl. one special character.
  const adminPassword =
    process.env.SEED_ADMIN_PASSWORD ||
    `Demo-${crypto.randomBytes(9).toString("hex")}!`;
  if (
    adminPassword.length < 12 ||
    !/[!@#$%^&*()_+\-=\[\]{}|;':",.<>?\/\\]/.test(adminPassword)
  ) {
    throw new Error(
      "SEED_ADMIN_PASSWORD must be at least 12 characters and contain a special character (login rule)",
    );
  }
  if (!adminExists) {
    console.log(
      `Demo users admin@demo.com / reviewer@demo.com created, password: ${adminPassword}`,
    );
  } else {
    console.log("Demo users already exist, password unchanged");
  }
  const hashedPassword = await bcrypt.hash(adminPassword, 12);
  await prisma.user.upsert({
    where: { email: "admin@demo.com" },
    update: {},
    create: {
      email: "admin@demo.com",
      name: "Admin User",
      passwordHash: hashedPassword,
      role: "ADMIN",
      organizationId: org.id,
    },
  });

  // Create reviewer user
  await prisma.user.upsert({
    where: { email: "reviewer@demo.com" },
    update: {},
    create: {
      email: "reviewer@demo.com",
      name: "Security Reviewer",
      passwordHash: hashedPassword,
      role: "REVIEWER",
      organizationId: org.id,
    },
  });

  // Seed the demo knowledge base once (re-running the seed must not duplicate it).
  const existingEntries = await prisma.knowledgeEntry.count({
    where: { organizationId: org.id },
  });
  if (existingEntries === 0) {
    await prisma.knowledgeEntry.createMany({
      data: DEMO_KNOWLEDGE.map((entry) => ({
        question: entry.question,
        answer: entry.answer,
        domain: entry.domain as never,
        keywords: entry.keywords,
        isVerified: true,
        organizationId: org.id,
      })),
    });
  }

  // Seed built-in questionnaire templates (CB-03)
  const templates = [
    {
      id: "tpl-sig-lite",
      name: "SIG Lite",
      framework: "SIG Lite",
      description:
        "Shared Assessments Standardized Information Gathering (SIG) Lite questionnaire — 200 key controls for third-party risk assessment.",
      questionCount: 18,
      domains: [
        "ACCESS_CONTROL",
        "ENCRYPTION",
        "NETWORK_SECURITY",
        "INCIDENT_RESPONSE",
        "BUSINESS_CONTINUITY",
        "COMPLIANCE",
        "THIRD_PARTY_RISK",
        "PRIVACY",
      ],
      questions: [
        {
          text: "Does the organization have a documented information security policy?",
          type: "YES_NO",
          domain: "GOVERNANCE",
          required: true,
        },
        {
          text: "Is there a designated individual responsible for information security?",
          type: "YES_NO",
          domain: "GOVERNANCE",
          required: true,
        },
        {
          text: "Does the organization encrypt data at rest?",
          type: "YES_NO",
          domain: "ENCRYPTION",
          required: true,
        },
        {
          text: "Does the organization encrypt data in transit using TLS 1.2+?",
          type: "YES_NO",
          domain: "ENCRYPTION",
          required: true,
        },
        {
          text: "Is multi-factor authentication required for remote access?",
          type: "YES_NO",
          domain: "ACCESS_CONTROL",
          required: true,
        },
        {
          text: "Does the organization perform regular vulnerability scanning?",
          type: "YES_NO",
          domain: "VULNERABILITY_MANAGEMENT",
          required: true,
        },
        {
          text: "Is there a documented incident response plan?",
          type: "YES_NO",
          domain: "INCIDENT_RESPONSE",
          required: true,
        },
        {
          text: "Are security logs centrally collected and monitored?",
          type: "YES_NO",
          domain: "LOGGING_MONITORING",
          required: true,
        },
        {
          text: "Does the organization conduct annual penetration testing?",
          type: "YES_NO",
          domain: "VULNERABILITY_MANAGEMENT",
          required: true,
        },
        {
          text: "Is there a business continuity and disaster recovery plan?",
          type: "YES_NO",
          domain: "BUSINESS_CONTINUITY",
          required: true,
        },
        {
          text: "Are background checks performed on employees with access to sensitive data?",
          type: "YES_NO",
          domain: "GOVERNANCE",
          required: true,
        },
        {
          text: "Is there a formal change management process?",
          type: "YES_NO",
          domain: "CHANGE_MANAGEMENT",
          required: true,
        },
        {
          text: "Are third-party vendors assessed for security risk?",
          type: "YES_NO",
          domain: "THIRD_PARTY_RISK",
          required: true,
        },
        {
          text: "Is a data classification scheme in place?",
          type: "YES_NO",
          domain: "DATA_PROTECTION",
          required: true,
        },
        {
          text: "Are network firewalls deployed and maintained?",
          type: "YES_NO",
          domain: "NETWORK_SECURITY",
          required: true,
        },
        {
          text: "Is endpoint protection (AV/EDR) deployed on all endpoints?",
          type: "YES_NO",
          domain: "ENDPOINT_SECURITY",
          required: true,
        },
        {
          text: "Does the organization comply with GDPR or equivalent privacy regulations?",
          type: "YES_NO",
          domain: "PRIVACY",
          required: true,
        },
        {
          text: "Is security awareness training provided to all employees?",
          type: "YES_NO",
          domain: "GOVERNANCE",
          required: true,
        },
      ],
    },
    {
      id: "tpl-caiq",
      name: "CAIQ v4",
      framework: "CAIQ",
      description:
        "Cloud Security Alliance Consensus Assessments Initiative Questionnaire — cloud-specific security controls aligned with CCM v4.",
      questionCount: 15,
      domains: [
        "CLOUD_SECURITY",
        "ENCRYPTION",
        "ACCESS_CONTROL",
        "LOGGING_MONITORING",
        "DATA_PROTECTION",
        "COMPLIANCE",
      ],
      questions: [
        {
          text: "Do you use encryption for data at rest in all cloud storage services?",
          type: "YES_NO",
          domain: "ENCRYPTION",
          required: true,
        },
        {
          text: "Is tenant data logically or physically segregated in multi-tenant environments?",
          type: "FREE_TEXT",
          domain: "CLOUD_SECURITY",
          required: true,
        },
        {
          text: "Do you support customer-managed encryption keys (BYOK/HYOK)?",
          type: "YES_NO",
          domain: "ENCRYPTION",
          required: true,
        },
        {
          text: "Are cloud infrastructure configurations continuously monitored for drift?",
          type: "YES_NO",
          domain: "CLOUD_SECURITY",
          required: true,
        },
        {
          text: "Do you provide a SOC 2 Type II report covering cloud operations?",
          type: "YES_NO",
          domain: "COMPLIANCE",
          required: true,
        },
        {
          text: "How is identity and access management handled for cloud resources?",
          type: "FREE_TEXT",
          domain: "ACCESS_CONTROL",
          required: true,
        },
        {
          text: "Are cloud audit logs retained for at least 12 months?",
          type: "YES_NO",
          domain: "LOGGING_MONITORING",
          required: true,
        },
        {
          text: "Is there a documented cloud incident response procedure?",
          type: "YES_NO",
          domain: "INCIDENT_RESPONSE",
          required: true,
        },
        {
          text: "Do you perform regular cloud penetration testing?",
          type: "YES_NO",
          domain: "VULNERABILITY_MANAGEMENT",
          required: true,
        },
        {
          text: "Are virtual network controls (security groups, NACLs) used to isolate workloads?",
          type: "YES_NO",
          domain: "NETWORK_SECURITY",
          required: true,
        },
        {
          text: "Describe your cloud backup and data recovery process.",
          type: "FREE_TEXT",
          domain: "BUSINESS_CONTINUITY",
          required: true,
        },
        {
          text: "Do you support data residency requirements (EU, US, etc.)?",
          type: "YES_NO",
          domain: "DATA_PROTECTION",
          required: true,
        },
        {
          text: "How are cloud API keys and secrets managed?",
          type: "FREE_TEXT",
          domain: "ACCESS_CONTROL",
          required: true,
        },
        {
          text: "Is container/serverless security scanning performed?",
          type: "YES_NO",
          domain: "APPLICATION_SECURITY",
          required: true,
        },
        {
          text: "Do you have a shared responsibility model documented?",
          type: "YES_NO",
          domain: "CLOUD_SECURITY",
          required: true,
        },
      ],
    },
    {
      id: "tpl-vsa",
      name: "VSA Questionnaire",
      framework: "VSA",
      description:
        "Vendor Security Alliance questionnaire — standardized vendor security assessment used by major tech companies.",
      questionCount: 12,
      domains: [
        "GOVERNANCE",
        "ACCESS_CONTROL",
        "DATA_PROTECTION",
        "INCIDENT_RESPONSE",
        "COMPLIANCE",
      ],
      questions: [
        {
          text: "Does your organization maintain ISO 27001 or equivalent certification?",
          type: "YES_NO",
          domain: "COMPLIANCE",
          required: true,
        },
        {
          text: "Describe your data handling and classification procedures.",
          type: "FREE_TEXT",
          domain: "DATA_PROTECTION",
          required: true,
        },
        {
          text: "How do you ensure least-privilege access across systems?",
          type: "FREE_TEXT",
          domain: "ACCESS_CONTROL",
          required: true,
        },
        {
          text: "Do you have a formal vulnerability disclosure program?",
          type: "YES_NO",
          domain: "VULNERABILITY_MANAGEMENT",
          required: true,
        },
        {
          text: "What is your breach notification timeline (hours)?",
          type: "NUMERIC",
          domain: "INCIDENT_RESPONSE",
          required: true,
        },
        {
          text: "Do you perform SAST/DAST on application code?",
          type: "YES_NO",
          domain: "APPLICATION_SECURITY",
          required: true,
        },
        {
          text: "Is there a formal data retention and deletion policy?",
          type: "YES_NO",
          domain: "DATA_PROTECTION",
          required: true,
        },
        {
          text: "Do you conduct security awareness training at least annually?",
          type: "YES_NO",
          domain: "GOVERNANCE",
          required: true,
        },
        {
          text: "Are production systems monitored 24/7?",
          type: "YES_NO",
          domain: "LOGGING_MONITORING",
          required: true,
        },
        {
          text: "Describe your sub-processor management process.",
          type: "FREE_TEXT",
          domain: "THIRD_PARTY_RISK",
          required: true,
        },
        {
          text: "Do you support SSO integration (SAML/OIDC)?",
          type: "YES_NO",
          domain: "IDENTITY_MANAGEMENT",
          required: true,
        },
        {
          text: "Is there a designated Data Protection Officer?",
          type: "YES_NO",
          domain: "PRIVACY",
          required: true,
        },
      ],
    },
    {
      id: "tpl-nist-csf",
      name: "NIST CSF Assessment",
      framework: "NIST CSF",
      description:
        "NIST Cybersecurity Framework assessment — Identify, Protect, Detect, Respond, Recover functions.",
      questionCount: 15,
      domains: [
        "GOVERNANCE",
        "ACCESS_CONTROL",
        "DATA_PROTECTION",
        "LOGGING_MONITORING",
        "INCIDENT_RESPONSE",
        "BUSINESS_CONTINUITY",
      ],
      questions: [
        {
          text: "Is there a current asset inventory covering hardware, software, and data?",
          type: "YES_NO",
          domain: "GOVERNANCE",
          required: true,
        },
        {
          text: "Has a risk assessment been performed within the last 12 months?",
          type: "YES_NO",
          domain: "GOVERNANCE",
          required: true,
        },
        {
          text: "Are critical business processes and their dependencies documented?",
          type: "YES_NO",
          domain: "BUSINESS_CONTINUITY",
          required: true,
        },
        {
          text: "Is identity proofing performed before granting system access?",
          type: "YES_NO",
          domain: "IDENTITY_MANAGEMENT",
          required: true,
        },
        {
          text: "Are remote access connections authenticated and encrypted?",
          type: "YES_NO",
          domain: "ACCESS_CONTROL",
          required: true,
        },
        {
          text: "Is data-at-rest protected on mobile devices and removable media?",
          type: "YES_NO",
          domain: "DATA_PROTECTION",
          required: true,
        },
        {
          text: "Are protective technology solutions (IDS/IPS, WAF) deployed?",
          type: "YES_NO",
          domain: "NETWORK_SECURITY",
          required: true,
        },
        {
          text: "Is anomalous activity detected and analyzed for security events?",
          type: "YES_NO",
          domain: "LOGGING_MONITORING",
          required: true,
        },
        {
          text: "Are security events correlated across multiple sources?",
          type: "YES_NO",
          domain: "LOGGING_MONITORING",
          required: true,
        },
        {
          text: "Is there continuous monitoring of network traffic for threats?",
          type: "YES_NO",
          domain: "LOGGING_MONITORING",
          required: true,
        },
        {
          text: "Are incident response roles and responsibilities defined?",
          type: "YES_NO",
          domain: "INCIDENT_RESPONSE",
          required: true,
        },
        {
          text: "Are incidents categorized, prioritized, and tracked to resolution?",
          type: "YES_NO",
          domain: "INCIDENT_RESPONSE",
          required: true,
        },
        {
          text: "Is forensic analysis capability available for incident investigation?",
          type: "YES_NO",
          domain: "INCIDENT_RESPONSE",
          required: true,
        },
        {
          text: "Are recovery plans tested at least annually?",
          type: "YES_NO",
          domain: "BUSINESS_CONTINUITY",
          required: true,
        },
        {
          text: "Are lessons learned incorporated into updated procedures?",
          type: "YES_NO",
          domain: "GOVERNANCE",
          required: true,
        },
      ],
    },
    {
      id: "tpl-iso27001",
      name: "ISO 27001 Controls",
      framework: "ISO 27001",
      description:
        "ISO/IEC 27001:2022 Annex A controls assessment — information security management system controls across 4 themes.",
      questionCount: 16,
      domains: [
        "GOVERNANCE",
        "ACCESS_CONTROL",
        "ENCRYPTION",
        "PHYSICAL_SECURITY",
        "NETWORK_SECURITY",
        "INCIDENT_RESPONSE",
        "BUSINESS_CONTINUITY",
        "COMPLIANCE",
        "DATA_PROTECTION",
      ],
      questions: [
        {
          text: "Is there a documented Information Security Management System (ISMS) with defined scope?",
          type: "YES_NO",
          domain: "GOVERNANCE",
          required: true,
        },
        {
          text: "Has top management defined an information security policy?",
          type: "YES_NO",
          domain: "GOVERNANCE",
          required: true,
        },
        {
          text: "Are information security roles and responsibilities clearly assigned?",
          type: "YES_NO",
          domain: "GOVERNANCE",
          required: true,
        },
        {
          text: "Is there a formal risk assessment and treatment process?",
          type: "YES_NO",
          domain: "GOVERNANCE",
          required: true,
        },
        {
          text: "Are access rights provisioned and revoked through a formal process?",
          type: "YES_NO",
          domain: "ACCESS_CONTROL",
          required: true,
        },
        {
          text: "Is privileged access restricted and monitored?",
          type: "YES_NO",
          domain: "ACCESS_CONTROL",
          required: true,
        },
        {
          text: "Describe your cryptographic key management process.",
          type: "FREE_TEXT",
          domain: "ENCRYPTION",
          required: true,
        },
        {
          text: "Are physical security perimeters defined and controlled?",
          type: "YES_NO",
          domain: "PHYSICAL_SECURITY",
          required: true,
        },
        {
          text: "Is network segmentation implemented to isolate sensitive systems?",
          type: "YES_NO",
          domain: "NETWORK_SECURITY",
          required: true,
        },
        {
          text: "Are secure development lifecycle practices followed?",
          type: "YES_NO",
          domain: "APPLICATION_SECURITY",
          required: true,
        },
        {
          text: "Is there a supplier/third-party information security policy?",
          type: "YES_NO",
          domain: "THIRD_PARTY_RISK",
          required: true,
        },
        {
          text: "Are information security events reported and assessed?",
          type: "YES_NO",
          domain: "INCIDENT_RESPONSE",
          required: true,
        },
        {
          text: "Are ICT continuity plans tested and maintained?",
          type: "YES_NO",
          domain: "BUSINESS_CONTINUITY",
          required: true,
        },
        {
          text: "Is compliance with legal, regulatory, and contractual requirements regularly reviewed?",
          type: "YES_NO",
          domain: "COMPLIANCE",
          required: true,
        },
        {
          text: "Are internal audits of the ISMS conducted at planned intervals?",
          type: "YES_NO",
          domain: "COMPLIANCE",
          required: true,
        },
        {
          text: "Is personally identifiable information (PII) protection ensured per applicable regulations?",
          type: "YES_NO",
          domain: "DATA_PROTECTION",
          required: true,
        },
      ],
    },
    {
      id: "tpl-cis-controls",
      name: "CIS Controls v8",
      framework: "CIS Controls",
      description:
        "Center for Internet Security Controls v8 — prioritized security actions organized into 18 control families.",
      questionCount: 18,
      domains: [
        "GOVERNANCE",
        "ACCESS_CONTROL",
        "DATA_PROTECTION",
        "VULNERABILITY_MANAGEMENT",
        "LOGGING_MONITORING",
        "NETWORK_SECURITY",
        "ENDPOINT_SECURITY",
        "INCIDENT_RESPONSE",
        "APPLICATION_SECURITY",
      ],
      questions: [
        {
          text: "Is there an enterprise asset inventory that is actively maintained?",
          type: "YES_NO",
          domain: "GOVERNANCE",
          required: true,
        },
        {
          text: "Is there a software asset inventory with authorized/unauthorized classification?",
          type: "YES_NO",
          domain: "GOVERNANCE",
          required: true,
        },
        {
          text: "Are sensitive data assets identified, classified, and inventoried?",
          type: "YES_NO",
          domain: "DATA_PROTECTION",
          required: true,
        },
        {
          text: "Are enterprise assets and software securely configured using hardening standards?",
          type: "YES_NO",
          domain: "ENDPOINT_SECURITY",
          required: true,
        },
        {
          text: "Is there a process to manage user accounts including creation, modification, and deactivation?",
          type: "YES_NO",
          domain: "ACCESS_CONTROL",
          required: true,
        },
        {
          text: "Is MFA enforced for all administrative and remote access?",
          type: "YES_NO",
          domain: "ACCESS_CONTROL",
          required: true,
        },
        {
          text: "Is there a continuous vulnerability management process with remediation SLAs?",
          type: "YES_NO",
          domain: "VULNERABILITY_MANAGEMENT",
          required: true,
        },
        {
          text: "Are audit logs collected, maintained, and reviewed from enterprise assets?",
          type: "YES_NO",
          domain: "LOGGING_MONITORING",
          required: true,
        },
        {
          text: "Are email and web browser protections implemented to block malicious content?",
          type: "YES_NO",
          domain: "ENDPOINT_SECURITY",
          required: true,
        },
        {
          text: "Are anti-malware solutions deployed and maintained on all endpoints?",
          type: "YES_NO",
          domain: "ENDPOINT_SECURITY",
          required: true,
        },
        {
          text: "Are data recovery processes tested and capable of restoring enterprise assets?",
          type: "YES_NO",
          domain: "BUSINESS_CONTINUITY",
          required: true,
        },
        {
          text: "Is network infrastructure managed using security best practices (firewalls, IDS/IPS)?",
          type: "YES_NO",
          domain: "NETWORK_SECURITY",
          required: true,
        },
        {
          text: "Is network monitoring and defense capability established?",
          type: "YES_NO",
          domain: "NETWORK_SECURITY",
          required: true,
        },
        {
          text: "Is security awareness training conducted for all employees?",
          type: "YES_NO",
          domain: "GOVERNANCE",
          required: true,
        },
        {
          text: "Are secure application development practices followed (OWASP, SAST/DAST)?",
          type: "YES_NO",
          domain: "APPLICATION_SECURITY",
          required: true,
        },
        {
          text: "Is there an incident response management process with defined roles?",
          type: "YES_NO",
          domain: "INCIDENT_RESPONSE",
          required: true,
        },
        {
          text: "Are penetration tests performed at least annually?",
          type: "YES_NO",
          domain: "VULNERABILITY_MANAGEMENT",
          required: true,
        },
        {
          text: "Is there a service provider management process covering security requirements?",
          type: "YES_NO",
          domain: "THIRD_PARTY_RISK",
          required: true,
        },
      ],
    },
    {
      id: "tpl-soc2",
      name: "SOC 2 Type II Readiness",
      framework: "SOC 2",
      description:
        "SOC 2 Trust Services Criteria readiness assessment — Security, Availability, Processing Integrity, Confidentiality, Privacy.",
      questionCount: 15,
      domains: [
        "GOVERNANCE",
        "ACCESS_CONTROL",
        "ENCRYPTION",
        "LOGGING_MONITORING",
        "INCIDENT_RESPONSE",
        "CHANGE_MANAGEMENT",
        "BUSINESS_CONTINUITY",
        "PRIVACY",
      ],
      questions: [
        {
          text: "Is there a formal information security program with executive sponsorship?",
          type: "YES_NO",
          domain: "GOVERNANCE",
          required: true,
        },
        {
          text: "Are logical access controls in place to restrict system access to authorized users?",
          type: "YES_NO",
          domain: "ACCESS_CONTROL",
          required: true,
        },
        {
          text: "Are new hires screened through background checks before access is granted?",
          type: "YES_NO",
          domain: "GOVERNANCE",
          required: true,
        },
        {
          text: "Is data encrypted in transit and at rest using industry-standard algorithms?",
          type: "YES_NO",
          domain: "ENCRYPTION",
          required: true,
        },
        {
          text: "Are system changes tested and approved before deployment to production?",
          type: "YES_NO",
          domain: "CHANGE_MANAGEMENT",
          required: true,
        },
        {
          text: "Is there a formal change management process with documented approvals?",
          type: "YES_NO",
          domain: "CHANGE_MANAGEMENT",
          required: true,
        },
        {
          text: "Are system events logged, monitored, and retained per a defined retention policy?",
          type: "YES_NO",
          domain: "LOGGING_MONITORING",
          required: true,
        },
        {
          text: "Is there a defined incident response plan with escalation procedures?",
          type: "YES_NO",
          domain: "INCIDENT_RESPONSE",
          required: true,
        },
        {
          text: "Are risk assessments performed at least annually?",
          type: "YES_NO",
          domain: "GOVERNANCE",
          required: true,
        },
        {
          text: "Are system availability commitments defined and monitored (SLAs)?",
          type: "YES_NO",
          domain: "BUSINESS_CONTINUITY",
          required: true,
        },
        {
          text: "Is there a disaster recovery plan that is tested annually?",
          type: "YES_NO",
          domain: "BUSINESS_CONTINUITY",
          required: true,
        },
        {
          text: "Are vendor/sub-processor security practices assessed?",
          type: "YES_NO",
          domain: "THIRD_PARTY_RISK",
          required: true,
        },
        {
          text: "Is there a privacy notice describing data collection and use practices?",
          type: "YES_NO",
          domain: "PRIVACY",
          required: true,
        },
        {
          text: "Are data subject access and deletion requests handled within defined timelines?",
          type: "YES_NO",
          domain: "PRIVACY",
          required: true,
        },
        {
          text: "Describe how processing integrity is ensured for critical system outputs.",
          type: "FREE_TEXT",
          domain: "GOVERNANCE",
          required: true,
        },
      ],
    },
  ];

  for (const tpl of templates) {
    await prisma.questionnaireTemplate.upsert({
      where: { id: tpl.id },
      update: {
        questions: tpl.questions as object[],
        questionCount: tpl.questionCount,
      },
      create: {
        id: tpl.id,
        name: tpl.name,
        framework: tpl.framework,
        description: tpl.description,
        isBuiltIn: true,
        questionCount: tpl.questionCount,
        domains: tpl.domains as never[],
        questions: tpl.questions as object[],
      },
    });
  }

  console.log(
    `Seeded: 1 org, 2 users, ${DEMO_KNOWLEDGE.length} KB entries, ${templates.length} templates`,
  );

  await embedMissingEntries();
}

/**
 * Optional: store embeddings for knowledge entries that have none yet, so
 * semantic search can be used next to keyword search. Skipped (not an error)
 * when EMBEDDING_MODEL is "none" or the model is not available in Ollama.
 */
async function embedMissingEntries() {
  const model = (process.env.EMBEDDING_MODEL ?? "nomic-embed-text").trim();
  const ollamaHost = process.env.OLLAMA_HOST || "http://localhost:11434";
  if (!model || model.toLowerCase() === "none") {
    console.log("Embeddings disabled (EMBEDDING_MODEL=none): keyword search only");
    return;
  }

  const { rows } = await pool.query<{ id: string; question: string; answer: string }>(
    `SELECT id, question, answer FROM "KnowledgeEntry" WHERE embedding IS NULL`,
  );
  if (rows.length === 0) return;

  let embedded = 0;
  for (const row of rows) {
    try {
      const res = await fetch(`${ollamaHost}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          input: `Q: ${row.question}
A: ${row.answer}`.slice(0, 8000),
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const data = (await res.json()) as { embeddings: number[][] };
      await pool.query(
        `UPDATE "KnowledgeEntry" SET embedding = $1::vector WHERE id = $2`,
        [`[${data.embeddings[0].join(",")}]`, row.id],
      );
      embedded++;
    } catch (error) {
      console.log(
        `Embeddings skipped (${model} not available at ${ollamaHost}: ${
          error instanceof Error ? error.message.slice(0, 120) : String(error)
        }). Keyword search still works; pull the model and re-run the seed to enable semantic search.`,
      );
      return;
    }
  }
  console.log(`Embedded ${embedded} knowledge entries with ${model}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
