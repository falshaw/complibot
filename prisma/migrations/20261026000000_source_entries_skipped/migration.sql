-- Rows a knowledge import skipped because the same question and answer were already in the knowledge base
ALTER TABLE "KnowledgeSource" ADD COLUMN "entriesSkipped" INTEGER NOT NULL DEFAULT 0;
