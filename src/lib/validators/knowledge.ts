import { z } from "zod";

const securityDomains = [
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

export const createKnowledgeEntrySchema = z.object({
  question: z.string().min(5).max(2000),
  answer: z.string().min(5).max(10000),
  domain: z.enum(securityDomains).default("GENERAL"),
  keywords: z.array(z.string()).default([]),
});

export const updateKnowledgeEntrySchema = z.object({
  question: z.string().min(5).max(2000).optional(),
  answer: z.string().min(5).max(10000).optional(),
  domain: z.enum(securityDomains).optional(),
  keywords: z.array(z.string()).optional(),
  isVerified: z.boolean().optional(),
});

export const searchKnowledgeSchema = z.object({
  query: z.string().min(3).max(500),
  domain: z.enum(securityDomains).optional(),
  limit: z.number().int().min(1).max(20).default(5),
});

export type CreateKnowledgeEntry = z.infer<typeof createKnowledgeEntrySchema>;
export type UpdateKnowledgeEntry = z.infer<typeof updateKnowledgeEntrySchema>;
export type SearchKnowledge = z.infer<typeof searchKnowledgeSchema>;
