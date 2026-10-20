/**
 * CompliBot - display labels and badge tones shared by the pages.
 */

export const SECURITY_DOMAINS = [
  "ACCESS_CONTROL",
  "AUTHENTICATION",
  "ENCRYPTION",
  "DATA_PROTECTION",
  "INCIDENT_RESPONSE",
  "NETWORK_SECURITY",
  "CLOUD_SECURITY",
  "PHYSICAL_SECURITY",
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
  "GENERAL",
] as const;

const DOMAIN_LABELS: Record<string, string> = {
  ACCESS_CONTROL: "Access control",
  AUTHENTICATION: "Authentication",
  ENCRYPTION: "Encryption",
  DATA_PROTECTION: "Data protection",
  INCIDENT_RESPONSE: "Incident response",
  NETWORK_SECURITY: "Network security",
  CLOUD_SECURITY: "Cloud security",
  PHYSICAL_SECURITY: "Physical security",
  BUSINESS_CONTINUITY: "Business continuity",
  CHANGE_MANAGEMENT: "Change management",
  VULNERABILITY_MANAGEMENT: "Vulnerability management",
  LOGGING_MONITORING: "Logging & monitoring",
  THIRD_PARTY_RISK: "Third-party risk",
  COMPLIANCE: "Compliance",
  PRIVACY: "Privacy",
  ENDPOINT_SECURITY: "Endpoint security",
  APPLICATION_SECURITY: "Application security",
  IDENTITY_MANAGEMENT: "Identity management",
  GOVERNANCE: "Governance",
  GENERAL: "General",
};

export function domainLabel(domain: string): string {
  return (
    DOMAIN_LABELS[domain] ??
    domain.charAt(0) + domain.slice(1).toLowerCase().replace(/_/g, " ")
  );
}

export function typeLabel(type: string): string {
  const t = type.toLowerCase().replace(/_/g, " ");
  return t === "yes no" ? "Yes / no" : t.charAt(0).toUpperCase() + t.slice(1);
}

/** Questionnaire status -> pill label + tone class. */
export const QUESTIONNAIRE_STATUS: Record<
  string,
  { label: string; tone: string }
> = {
  UPLOADED: { label: "Uploaded", tone: "p-grey" },
  PARSING: { label: "Parsing", tone: "p-pend" },
  PARSED: { label: "Parsed", tone: "p-pend" },
  GENERATING: { label: "Generating", tone: "p-pend" },
  IN_REVIEW: { label: "In review", tone: "p-flag" },
  COMPLETED: { label: "Completed", tone: "p-ok" },
  EXPORTED: { label: "Exported", tone: "p-ok" },
};

export function questionnaireStatus(status: string) {
  return QUESTIONNAIRE_STATUS[status] ?? { label: status, tone: "p-grey" };
}

/** Answer status -> badge label + tone class. */
export const ANSWER_STATUS: Record<string, { label: string; badge: string }> = {
  PENDING: { label: "Pending", badge: "b-blue" },
  FLAGGED: { label: "Flagged", badge: "b-amber" },
  APPROVED: { label: "Approved", badge: "b-teal" },
  REJECTED: { label: "Rejected", badge: "b-red" },
  SKIPPED: { label: "Skipped", badge: "b-grey" },
};

export function answerStatus(status: string | undefined) {
  if (!status) return { label: "No answer", badge: "b-grey" };
  return ANSWER_STATUS[status] ?? { label: status, badge: "b-grey" };
}

/** Colour for a 0..1 confidence value relative to the org threshold. */
export function confidenceColor(confidence: number, threshold = 0.8): string {
  if (confidence >= threshold) return "var(--accent)";
  if (confidence >= threshold * 0.625) return "var(--amber)";
  return "var(--red)";
}

export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
