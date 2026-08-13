-- Hybrid search indexes: full-text (generated tsvector column) and vector similarity (HNSW).
-- Corpus content is English prose, so we use the 'english' text-search config for stemming.
ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS content_tsvector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX IF NOT EXISTS document_chunks_tsvector_idx
  ON document_chunks USING GIN (content_tsvector);

-- HNSW needs no training data pass (unlike ivfflat), so it is safe to create before/while ingesting.
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
  ON document_chunks USING hnsw (embedding vector_cosine_ops);
