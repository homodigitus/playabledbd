-- Core schema: users, sessions, documents, chunks, ingestion tracking, search logs.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users (email);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL,
  title text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  content_sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'INDEXED', 'FAILED', 'REMOVED')),
  chunk_count integer NOT NULL DEFAULT 0,
  last_indexed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS documents_source_key_idx ON documents (source_key);
CREATE INDEX IF NOT EXISTS documents_status_idx ON documents (status);
CREATE INDEX IF NOT EXISTS documents_sha256_idx ON documents (content_sha256);

CREATE TABLE IF NOT EXISTS document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  token_count integer NOT NULL,
  embedding vector(1536),
  page_number integer,
  section_title text,
  embedding_model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS document_chunks_doc_chunk_idx ON document_chunks (document_id, chunk_index);

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED')),
  triggered_by_user_id uuid REFERENCES users (id),
  source_path text NOT NULL,
  started_at timestamptz,
  finished_at timestamptz,
  documents_seen integer NOT NULL DEFAULT 0,
  documents_indexed integer NOT NULL DEFAULT 0,
  documents_skipped integer NOT NULL DEFAULT 0,
  documents_failed integer NOT NULL DEFAULT 0,
  chunks_created integer NOT NULL DEFAULT 0,
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ingestion_runs_status_idx ON ingestion_runs (status);
CREATE INDEX IF NOT EXISTS ingestion_runs_created_at_idx ON ingestion_runs (created_at);

CREATE TABLE IF NOT EXISTS ingestion_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES ingestion_runs (id) ON DELETE CASCADE,
  source_key text NOT NULL,
  document_id uuid REFERENCES documents (id),
  status text NOT NULL,
  message text,
  started_at timestamptz,
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS ingestion_items_run_id_idx ON ingestion_items (run_id);

CREATE TABLE IF NOT EXISTS search_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users (id),
  principal text,
  query text NOT NULL,
  retrieval_mode text NOT NULL,
  top_k integer NOT NULL,
  latency_ms integer NOT NULL,
  result_count integer NOT NULL,
  top_score real,
  answer_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS search_logs_created_at_idx ON search_logs (created_at);
CREATE INDEX IF NOT EXISTS search_logs_user_id_idx ON search_logs (user_id);
