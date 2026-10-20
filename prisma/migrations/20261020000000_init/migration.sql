-- pgvector for the optional KnowledgeEntry.embedding column
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'RESPONDER', 'REVIEWER', 'VIEWER');

-- CreateEnum
CREATE TYPE "SecurityDomain" AS ENUM ('ACCESS_CONTROL', 'AUTHENTICATION', 'ENCRYPTION', 'DATA_PROTECTION', 'INCIDENT_RESPONSE', 'NETWORK_SECURITY', 'CLOUD_SECURITY', 'PHYSICAL_SECURITY', 'BUSINESS_CONTINUITY', 'CHANGE_MANAGEMENT', 'VULNERABILITY_MANAGEMENT', 'LOGGING_MONITORING', 'THIRD_PARTY_RISK', 'COMPLIANCE', 'PRIVACY', 'ENDPOINT_SECURITY', 'APPLICATION_SECURITY', 'IDENTITY_MANAGEMENT', 'GOVERNANCE', 'GENERAL');

-- CreateEnum
CREATE TYPE "AnswerStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'FLAGGED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "QuestionnaireStatus" AS ENUM ('UPLOADED', 'PARSING', 'PARSED', 'GENERATING', 'IN_REVIEW', 'COMPLETED', 'EXPORTED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('YES_NO', 'FREE_TEXT', 'MULTIPLE_CHOICE', 'EVIDENCE', 'DATE', 'NUMERIC');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('QUESTIONNAIRE', 'POLICY', 'INTERVIEW', 'MANUAL');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "confidenceThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'RESPONDER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "emailVerified" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "KnowledgeSource" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "fileName" TEXT,
    "filePath" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "entriesCreated" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceId" TEXT,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "domain" "SecurityDomain" NOT NULL DEFAULT 'GENERAL',
    "keywords" TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "embedding" vector(768),

    CONSTRAINT "KnowledgeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Questionnaire" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileName" TEXT,
    "filePath" TEXT,
    "status" "QuestionnaireStatus" NOT NULL DEFAULT 'UPLOADED',
    "totalQuestions" INTEGER NOT NULL DEFAULT 0,
    "answeredCount" INTEGER NOT NULL DEFAULT 0,
    "approvedCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "columnMapping" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Questionnaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "questionnaireId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "questionText" TEXT NOT NULL,
    "questionType" "QuestionType" NOT NULL DEFAULT 'FREE_TEXT',
    "domain" "SecurityDomain" NOT NULL DEFAULT 'GENERAL',
    "originalContext" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "AnswerStatus" NOT NULL DEFAULT 'PENDING',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT true,
    "editedContent" TEXT,
    "reviewNote" TEXT,
    "createdById" TEXT,
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerSource" (
    "id" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "knowledgeEntryId" TEXT NOT NULL,
    "similarity" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "AnswerSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentDomain" "SecurityDomain" NOT NULL DEFAULT 'ACCESS_CONTROL',
    "domainsCompleted" "SecurityDomain"[],
    "questionsAsked" INTEGER NOT NULL DEFAULT 0,
    "entriesCreated" INTEGER NOT NULL DEFAULT 0,
    "conversationLog" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionnaireExport" (
    "id" TEXT NOT NULL,
    "questionnaireId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'xlsx',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionnaireExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionnaireTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "framework" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "questionCount" INTEGER NOT NULL DEFAULT 0,
    "domains" "SecurityDomain"[],
    "questions" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionnaireTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationInvitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'RESPONDER',
    "token" TEXT NOT NULL,
    "invitedById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "details" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "KnowledgeSource_organizationId_idx" ON "KnowledgeSource"("organizationId");

-- CreateIndex
CREATE INDEX "KnowledgeEntry_organizationId_idx" ON "KnowledgeEntry"("organizationId");

-- CreateIndex
CREATE INDEX "KnowledgeEntry_domain_idx" ON "KnowledgeEntry"("domain");

-- CreateIndex
CREATE INDEX "KnowledgeEntry_sourceId_idx" ON "KnowledgeEntry"("sourceId");

-- CreateIndex
CREATE INDEX "Questionnaire_organizationId_idx" ON "Questionnaire"("organizationId");

-- CreateIndex
CREATE INDEX "Questionnaire_status_idx" ON "Questionnaire"("status");

-- CreateIndex
CREATE INDEX "Question_questionnaireId_idx" ON "Question"("questionnaireId");

-- CreateIndex
CREATE INDEX "Question_domain_idx" ON "Question"("domain");

-- CreateIndex
CREATE INDEX "Answer_questionId_idx" ON "Answer"("questionId");

-- CreateIndex
CREATE INDEX "Answer_status_idx" ON "Answer"("status");

-- CreateIndex
CREATE INDEX "Answer_questionId_status_idx" ON "Answer"("questionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerSource_answerId_knowledgeEntryId_key" ON "AnswerSource"("answerId", "knowledgeEntryId");

-- CreateIndex
CREATE INDEX "InterviewSession_organizationId_idx" ON "InterviewSession"("organizationId");

-- CreateIndex
CREATE INDEX "InterviewSession_userId_idx" ON "InterviewSession"("userId");

-- CreateIndex
CREATE INDEX "QuestionnaireExport_questionnaireId_idx" ON "QuestionnaireExport"("questionnaireId");

-- CreateIndex
CREATE INDEX "QuestionnaireTemplate_organizationId_idx" ON "QuestionnaireTemplate"("organizationId");

-- CreateIndex
CREATE INDEX "QuestionnaireTemplate_framework_idx" ON "QuestionnaireTemplate"("framework");

-- CreateIndex
CREATE INDEX "QuestionnaireTemplate_isBuiltIn_idx" ON "QuestionnaireTemplate"("isBuiltIn");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationInvitation_token_key" ON "OrganizationInvitation"("token");

-- CreateIndex
CREATE INDEX "OrganizationInvitation_token_idx" ON "OrganizationInvitation"("token");

-- CreateIndex
CREATE INDEX "OrganizationInvitation_email_idx" ON "OrganizationInvitation"("email");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationInvitation_organizationId_email_key" ON "OrganizationInvitation"("organizationId", "email");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_idx" ON "AuditLog"("organizationId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeEntry" ADD CONSTRAINT "KnowledgeEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeEntry" ADD CONSTRAINT "KnowledgeEntry_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "KnowledgeSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Questionnaire" ADD CONSTRAINT "Questionnaire_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_questionnaireId_fkey" FOREIGN KEY ("questionnaireId") REFERENCES "Questionnaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerSource" ADD CONSTRAINT "AnswerSource_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerSource" ADD CONSTRAINT "AnswerSource_knowledgeEntryId_fkey" FOREIGN KEY ("knowledgeEntryId") REFERENCES "KnowledgeEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireExport" ADD CONSTRAINT "QuestionnaireExport_questionnaireId_fkey" FOREIGN KEY ("questionnaireId") REFERENCES "Questionnaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireTemplate" ADD CONSTRAINT "QuestionnaireTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- HNSW index for cosine similarity search over embeddings
CREATE INDEX IF NOT EXISTS "knowledge_embedding_idx" ON "KnowledgeEntry"
  USING hnsw ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 64);
