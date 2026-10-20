import "dotenv/config";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

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
      planTier: "PRO",
    },
  });

  // Create admin user
  const adminPassword =
    process.env.SEED_ADMIN_PASSWORD ||
    crypto.randomBytes(16).toString("base64url");
  console.log(`Admin password: ${adminPassword}`);
  const hashedPassword = await bcrypt.hash(adminPassword, 12);
  const admin = await prisma.user.upsert({
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

  // Seed knowledge base entries
  const kbEntries = [
    {
      question: "Do you encrypt data at rest?",
      answer:
        "Yes. All data at rest is encrypted using AES-256 encryption. Database storage uses Transparent Data Encryption (TDE), and file storage uses server-side encryption with customer-managed keys. Encryption keys are rotated annually and stored in a dedicated key management system (KMS).",
      domain: "ENCRYPTION",
      keywords: ["encryption", "aes-256", "data at rest", "tde", "kms"],
    },
    {
      question: "Do you encrypt data in transit?",
      answer:
        "Yes. All data in transit is encrypted using TLS 1.2 or higher. We enforce HTTPS across all endpoints with HSTS headers. Internal service-to-service communication uses mutual TLS (mTLS). Certificate management is automated with 90-day rotation cycles.",
      domain: "ENCRYPTION",
      keywords: ["encryption", "tls", "https", "data in transit", "mtls"],
    },
    {
      question: "What is your password policy?",
      answer:
        "Our password policy requires a minimum of 12 characters with complexity requirements (uppercase, lowercase, numbers, special characters). Passwords expire every 90 days. We enforce account lockout after 5 failed attempts with a 15-minute lockout period. Password history prevents reuse of the last 12 passwords. Multi-factor authentication is mandatory for all users.",
      domain: "AUTHENTICATION",
      keywords: ["password", "mfa", "authentication", "lockout", "complexity"],
    },
    {
      question: "Do you have an incident response plan?",
      answer:
        "Yes. We maintain a documented Incident Response Plan that is reviewed and tested annually. The plan covers identification, containment, eradication, recovery, and lessons learned phases. Our IR team is on-call 24/7 with defined escalation procedures. We conduct tabletop exercises quarterly and a full simulation annually. Critical incidents are communicated to affected parties within 72 hours per GDPR requirements.",
      domain: "INCIDENT_RESPONSE",
      keywords: [
        "incident response",
        "ir plan",
        "tabletop",
        "escalation",
        "breach notification",
      ],
    },
    {
      question: "How do you handle access control?",
      answer:
        "We implement Role-Based Access Control (RBAC) following the principle of least privilege. Access is granted based on job function and reviewed quarterly. All access requests require manager approval and are tracked in our IAM system. Privileged access requires additional approval from the security team and is logged and monitored. Separation of duties is enforced for critical operations.",
      domain: "ACCESS_CONTROL",
      keywords: [
        "rbac",
        "least privilege",
        "access review",
        "iam",
        "separation of duties",
      ],
    },
    {
      question: "Do you perform vulnerability scanning?",
      answer:
        "Yes. We perform automated vulnerability scanning weekly on all external-facing systems and monthly on internal systems. Critical and high vulnerabilities are remediated within 7 and 30 days respectively. We use industry-standard scanning tools and maintain a vulnerability management program with defined SLAs. Annual penetration testing is conducted by an independent third party.",
      domain: "VULNERABILITY_MANAGEMENT",
      keywords: [
        "vulnerability scanning",
        "penetration testing",
        "remediation",
        "patching",
      ],
    },
    {
      question: "What logging and monitoring do you have in place?",
      answer:
        "All systems generate security-relevant logs that are centrally collected in our SIEM platform. Logs are retained for a minimum of 12 months (90 days hot, remainder in cold storage). We monitor for anomalous activity 24/7 with automated alerting for security events. Log integrity is ensured through tamper-evident logging mechanisms. Access to logs is restricted to the security operations team.",
      domain: "LOGGING_MONITORING",
      keywords: ["siem", "logging", "monitoring", "alerting", "log retention"],
    },
    {
      question: "What is your business continuity plan?",
      answer:
        "We maintain a comprehensive Business Continuity Plan (BCP) and Disaster Recovery Plan (DRP). Our RTO is 4 hours and RPO is 1 hour for critical systems. We perform daily backups with geographic replication to a secondary data center. BCP/DRP is tested annually with documented results and improvement actions. Critical systems are designed with high availability across multiple availability zones.",
      domain: "BUSINESS_CONTINUITY",
      keywords: ["bcp", "drp", "rto", "rpo", "backup", "disaster recovery"],
    },
    {
      question: "How do you manage third-party risk?",
      answer:
        "We maintain a Third-Party Risk Management (TPRM) program that assesses all vendors handling sensitive data. Vendors are classified by risk tier (critical, high, medium, low) with corresponding assessment depth. Annual reassessments are conducted for critical and high-risk vendors. All vendor contracts include security requirements, right-to-audit clauses, and breach notification obligations. We maintain a vendor inventory with risk ratings and review status.",
      domain: "THIRD_PARTY_RISK",
      keywords: [
        "third party",
        "vendor risk",
        "tprm",
        "vendor assessment",
        "supply chain",
      ],
    },
    {
      question: "Are you SOC 2 certified?",
      answer:
        "Yes. We maintain SOC 2 Type II certification covering Security, Availability, and Confidentiality trust service criteria. Our most recent audit was completed within the last 12 months with no exceptions noted. The audit is performed by an independent CPA firm. We also maintain ISO 27001 certification. Reports are available under NDA upon request.",
      domain: "COMPLIANCE",
      keywords: ["soc 2", "iso 27001", "certification", "audit", "compliance"],
    },
  ];

  for (const entry of kbEntries) {
    await prisma.knowledgeEntry.create({
      data: {
        question: entry.question,
        answer: entry.answer,
        domain: entry.domain as any,
        keywords: entry.keywords,
        isVerified: true,
        organizationId: org.id,
      },
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
    `Seeded: 1 org, 2 users, ${kbEntries.length} KB entries, ${templates.length} templates`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
