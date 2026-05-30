-- ============================================================================
-- Gateway Schema - Postgres + pgvector initialization
-- For: proxy_local CCR middleware:
--   ContextCapture, SemanticCache (optional), MemoryBridge
-- ============================================================================

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- gateway_sessions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gateway_sessions (
    session_id       TEXT PRIMARY KEY,
    project_name     TEXT,
    started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at         TIMESTAMPTZ,
    total_requests   INTEGER DEFAULT 0,
    total_input_tokens  BIGINT DEFAULT 0,
    total_output_tokens BIGINT DEFAULT 0,
    agent_types      JSONB DEFAULT '[]'::jsonb,
    metadata         JSONB DEFAULT '{}'::jsonb
);

-- ----------------------------------------------------------------------------
-- gateway_requests
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gateway_requests (
    id               SERIAL PRIMARY KEY,
    capture_id       TEXT UNIQUE NOT NULL,
    session_id       TEXT REFERENCES gateway_sessions(session_id) ON DELETE CASCADE,
    sequence_num     INTEGER DEFAULT 0,
    agent_type       TEXT,
    model_tier       TEXT,
    provider         TEXT,
    model_id         TEXT,
    turn_number      INTEGER DEFAULT 0,
    input_tokens     INTEGER DEFAULT 0,
    output_tokens    INTEGER DEFAULT 0,
    cache_create_input_tokens  INTEGER DEFAULT 0,
    cache_read_input_tokens    INTEGER DEFAULT 0,
    request_summary  TEXT,
    request_body     JSONB,
    response_body    JSONB,
    tool_calls       JSONB DEFAULT '[]'::jsonb,
    referenced_files JSONB DEFAULT '[]'::jsonb,
    route_reason     TEXT,
    scenario_type    TEXT,
    hallucination_risk REAL DEFAULT 0,
    cache_hit        BOOLEAN DEFAULT false,
    rag_enriched     BOOLEAN DEFAULT false,
    error_msg        TEXT,
    latency_ms       INTEGER DEFAULT 0,
    start_time       BIGINT,
    end_time         BIGINT,
    request_embedding vector(1536),    -- embedding for semantic search (opt)
    captured_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_requests_session ON gateway_requests(session_id);
CREATE INDEX IF NOT EXISTS idx_requests_captured_at ON gateway_requests(captured_at);
CREATE INDEX IF NOT EXISTS idx_requests_agent_type ON gateway_requests(agent_type);
CREATE INDEX IF NOT EXISTS idx_requests_hallucination ON gateway_requests(hallucination_risk) WHERE hallucination_risk > 0.5;

-- ----------------------------------------------------------------------------
-- semantic_documents
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS semantic_documents (
    id               SERIAL PRIMARY KEY,
    document_id      TEXT UNIQUE NOT NULL,
    source           TEXT NOT NULL DEFAULT 'ccr',  -- 'ccr', 'memory_mcp', 'clawmem', 'project_docs'
    content          TEXT,
    entity_type      TEXT,
    embedding        vector(1536),
    metadata         JSONB DEFAULT '{}'::jsonb,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    ttl_seconds      INTEGER
);

CREATE INDEX IF NOT EXISTS idx_semantic_source ON semantic_documents(source);
CREATE INDEX IF NOT EXISTS idx_semantic_type ON semantic_documents(entity_type);

-- ----------------------------------------------------------------------------
-- gateway_config
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gateway_config (
    key              TEXT PRIMARY KEY,
    value            JSONB NOT NULL,
    description      TEXT,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- Default config values
-- ----------------------------------------------------------------------------
INSERT INTO gateway_config (key, value, description) VALUES
    ('semantic_cache.enabled', 'true', 'Enable semantic cache middleware'),
    ('semantic_cache.ttl_ms', '600000', 'Cache TTL in milliseconds (10min)'),
    ('context_capture.enabled', 'true', 'Enable full context capture'),
    ('memory_bridge.enabled', 'true', 'Enable memory bridge sync'),
    ('rag_enricher.enabled', 'true', 'Enable RAG context enrichment'),
    ('hallucination_fence.enabled', 'true', 'Enable hallucination risk detection'),
    ('hallucination_fence.risk_threshold', '0.5', 'Risk threshold for warnings')
ON CONFLICT (key) DO NOTHING;
