CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS gateway_sessions (
  id TEXT PRIMARY KEY,
  project TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS gateway_requests (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT REFERENCES gateway_sessions(id) ON DELETE SET NULL,
  scenario TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER,
  status TEXT NOT NULL,
  error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS semantic_documents (
  id BIGSERIAL PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('session', 'project', 'reference')),
  topic TEXT NOT NULL,
  depth TEXT NOT NULL DEFAULT 's1',
  trust TEXT NOT NULL DEFAULT 'raw',
  source TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gateway_requests_session_created_idx
  ON gateway_requests (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS semantic_documents_scope_topic_idx
  ON semantic_documents (scope, topic);

CREATE INDEX IF NOT EXISTS semantic_documents_embedding_idx
  ON semantic_documents USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
