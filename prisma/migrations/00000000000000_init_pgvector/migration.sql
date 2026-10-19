-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Embeddings table (managed outside Prisma since it uses vector type)
CREATE TABLE IF NOT EXISTS knowledge_embeddings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  knowledge_entry_id TEXT NOT NULL,
  embedding vector(768) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fk_knowledge_entry
    FOREIGN KEY (knowledge_entry_id)
    REFERENCES "KnowledgeEntry"(id)
    ON DELETE CASCADE
);

-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw
  ON knowledge_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Index for looking up embeddings by entry ID
CREATE INDEX IF NOT EXISTS idx_embeddings_entry_id
  ON knowledge_embeddings (knowledge_entry_id);
