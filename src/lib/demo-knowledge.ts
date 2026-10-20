/**
 * Demo knowledge-base entries used by prisma/seed.ts and by the retrieval
 * tests (src/test/services/keyword-search.test.ts).
 */

export interface DemoKnowledgeEntry {
  question: string;
  answer: string;
  domain: string;
  keywords: string[];
}

export const DEMO_KNOWLEDGE: DemoKnowledgeEntry[] = [
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
