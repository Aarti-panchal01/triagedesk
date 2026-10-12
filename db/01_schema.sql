-- =====================================================================
-- TriageDesk : 01_schema.sql
-- DDL for the relational core (PostgreSQL 16) + vector columns (pgvector)
-- Re-runnable: drops everything it owns first.
-- =====================================================================

-- ---------- DROP (reverse dependency order) ----------
DROP VIEW  IF EXISTS v_case_overview, v_agent_workload, v_category_stats CASCADE;
DROP TABLE IF EXISTS audit_log, follow_up, escalation, case_note, case_symptom,
                     help_case, protocol, symptom, caller, district, app_user CASCADE;
DROP DOMAIN IF EXISTS case_category CASCADE;
DROP TYPE  IF EXISTS user_role, case_severity, case_status, escalation_status CASCADE;

-- ---------- EXTENSIONS ----------
CREATE EXTENSION IF NOT EXISTS vector;   -- pgvector: vector type, <=> operator, HNSW index

-- ---------- TYPES & DOMAINS ----------
CREATE TYPE user_role         AS ENUM ('agent', 'supervisor', 'admin');
-- Enum order matters: it lets us write severity >= 'high'
CREATE TYPE case_severity     AS ENUM ('low', 'moderate', 'high', 'critical');
CREATE TYPE case_status       AS ENUM ('open', 'in_progress', 'escalated', 'follow_up', 'closed');
CREATE TYPE escalation_status AS ENUM ('pending', 'acknowledged', 'resolved');

-- Shared by help_case and protocol, so the category list lives in one place
CREATE DOMAIN case_category AS VARCHAR(40)
  CHECK (VALUE IN ('Fever & Infection', 'Maternal & Child', 'Cardiac', 'Respiratory',
                   'Mental Health', 'Injury', 'Poisoning', 'Chronic Disease',
                   'Information', 'Other'));

-- ---------- TABLES ----------

CREATE TABLE app_user (
  user_id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name       VARCHAR(100) NOT NULL CHECK (length(trim(full_name)) >= 2),
  email           VARCHAR(150) NOT NULL CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- Only bcrypt hashes are accepted, so a plaintext password can never be stored
  password_hash   TEXT NOT NULL CHECK (password_hash ~ '^\$2[aby]\$\d{2}\$.{53}$'),
  role            user_role NOT NULL DEFAULT 'agent',
  is_active       BOOLEAN   NOT NULL DEFAULT TRUE,
  max_open_cases  SMALLINT  NOT NULL DEFAULT 15 CHECK (max_open_cases BETWEEN 1 AND 50),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at   TIMESTAMPTZ
);
-- Functional unique index: emails are unique case-insensitively
CREATE UNIQUE INDEX uq_app_user_email ON app_user (lower(email));

CREATE TABLE district (
  district_id  SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         VARCHAR(60) NOT NULL UNIQUE,
  state        VARCHAR(60) NOT NULL DEFAULT 'Karnataka'
);

CREATE TABLE caller (
  caller_id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name           VARCHAR(100) NOT NULL CHECK (length(trim(full_name)) >= 2),
  phone               CHAR(10) NOT NULL UNIQUE CHECK (phone ~ '^[6-9][0-9]{9}$'),  -- Indian mobile
  age                 SMALLINT CHECK (age BETWEEN 0 AND 120),
  gender              CHAR(1) CHECK (gender IN ('M', 'F', 'O')),
  district_id         SMALLINT REFERENCES district (district_id) ON DELETE SET NULL,
  preferred_language  VARCHAR(20) NOT NULL DEFAULT 'Kannada'
                      CHECK (preferred_language IN ('Kannada','Hindi','English','Telugu','Marathi','Tamil','Other')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE symptom (
  symptom_id   SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         VARCHAR(60) NOT NULL UNIQUE,
  body_system  VARCHAR(40) NOT NULL,
  is_red_flag  BOOLEAN NOT NULL DEFAULT FALSE   -- red flags force severity >= high (trigger)
);

CREATE TABLE protocol (
  protocol_id  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code         VARCHAR(20) NOT NULL UNIQUE CHECK (code ~ '^[A-Z]{2,5}-[0-9]{2,3}$'),
  title        VARCHAR(150) NOT NULL,
  category     case_category NOT NULL,
  content      TEXT NOT NULL CHECK (length(content) >= 50),
  embedding    vector(384),            -- all-MiniLM-L6-v2 sentence embedding of title + content
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_by   INT REFERENCES app_user (user_id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "case" is a reserved word, hence help_case
CREATE TABLE help_case (
  case_id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  caller_id         BIGINT NOT NULL REFERENCES caller (caller_id) ON DELETE RESTRICT,
  created_by        INT    NOT NULL REFERENCES app_user (user_id) ON DELETE RESTRICT,
  assigned_to       INT             REFERENCES app_user (user_id) ON DELETE SET NULL,
  chief_complaint   TEXT NOT NULL CHECK (length(trim(chief_complaint)) >= 10),
  category          case_category NOT NULL,
  severity          case_severity NOT NULL DEFAULT 'moderate',
  status            case_status   NOT NULL DEFAULT 'open',
  resolution_notes  TEXT,
  opened_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at         TIMESTAMPTZ,
  embedding         vector(384),       -- embedding of complaint (+ resolution once closed)
  -- Full-text search document, maintained by Postgres itself
  search_tsv        tsvector GENERATED ALWAYS AS (
                      setweight(to_tsvector('english', coalesce(chief_complaint, '')), 'A') ||
                      setweight(to_tsvector('english', coalesce(resolution_notes, '')), 'B')
                    ) STORED,
  CONSTRAINT chk_closed_has_timestamp CHECK ((status = 'closed') = (closed_at IS NOT NULL)),
  CONSTRAINT chk_closed_has_resolution CHECK (
    status <> 'closed' OR (resolution_notes IS NOT NULL AND length(trim(resolution_notes)) >= 10)),
  CONSTRAINT chk_close_after_open CHECK (closed_at IS NULL OR closed_at >= opened_at)
);

-- M:N between cases and symptoms
CREATE TABLE case_symptom (
  case_id     BIGINT   NOT NULL REFERENCES help_case (case_id) ON DELETE CASCADE,
  symptom_id  SMALLINT NOT NULL REFERENCES symptom (symptom_id) ON DELETE RESTRICT,
  PRIMARY KEY (case_id, symptom_id)
);

CREATE TABLE case_note (
  note_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id     BIGINT NOT NULL REFERENCES help_case (case_id) ON DELETE CASCADE,
  author_id   INT    NOT NULL REFERENCES app_user (user_id) ON DELETE RESTRICT,
  note_type   VARCHAR(20) NOT NULL DEFAULT 'observation'
              CHECK (note_type IN ('observation', 'advice', 'follow_up', 'handoff', 'system')),
  body        TEXT NOT NULL CHECK (length(trim(body)) >= 3),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE escalation (
  escalation_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id              BIGINT NOT NULL REFERENCES help_case (case_id) ON DELETE CASCADE,
  raised_by            INT    NOT NULL REFERENCES app_user (user_id),
  assigned_supervisor  INT             REFERENCES app_user (user_id) ON DELETE SET NULL,
  reason               TEXT NOT NULL CHECK (length(trim(reason)) >= 5),
  status               escalation_status NOT NULL DEFAULT 'pending',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at          TIMESTAMPTZ,
  CONSTRAINT chk_escalation_resolved CHECK ((status = 'resolved') = (resolved_at IS NOT NULL))
);
-- Partial unique index: at most ONE unresolved escalation per case
CREATE UNIQUE INDEX uq_escalation_one_active ON escalation (case_id) WHERE status <> 'resolved';

CREATE TABLE follow_up (
  follow_up_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id        BIGINT NOT NULL REFERENCES help_case (case_id) ON DELETE CASCADE,
  created_by     INT    NOT NULL REFERENCES app_user (user_id),
  scheduled_for  TIMESTAMPTZ NOT NULL,
  completed_at   TIMESTAMPTZ,
  outcome        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_followup_future CHECK (scheduled_for > created_at - interval '1 minute'),
  CONSTRAINT chk_followup_outcome CHECK (completed_at IS NULL OR outcome IS NOT NULL)
);

-- Append-only history written by triggers. No FK on changed_by on purpose:
-- the log must survive even if a user row is later removed.
CREATE TABLE audit_log (
  log_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name  VARCHAR(40) NOT NULL,
  record_id   BIGINT      NOT NULL,
  action      CHAR(1)     NOT NULL CHECK (action IN ('I', 'U', 'D')),
  changed_by  INT,
  old_data    JSONB,
  new_data    JSONB,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- ALTER (schema evolution, v2) ----------
-- v2: record which protocol the agent followed on a case
ALTER TABLE help_case ADD COLUMN applied_protocol_id INT;
ALTER TABLE help_case ADD CONSTRAINT fk_case_protocol
  FOREIGN KEY (applied_protocol_id) REFERENCES protocol (protocol_id) ON DELETE SET NULL;
-- v2: callers can leave an alternate number
ALTER TABLE caller ADD COLUMN alt_phone CHAR(10)
  CONSTRAINT chk_alt_phone CHECK (alt_phone IS NULL OR (alt_phone ~ '^[6-9][0-9]{9}$' AND alt_phone <> phone));

-- ---------- INDEXES ----------
CREATE INDEX idx_case_status_severity ON help_case (status, severity);
CREATE INDEX idx_case_opened_at       ON help_case (opened_at DESC);
CREATE INDEX idx_case_caller          ON help_case (caller_id);
CREATE INDEX idx_case_category        ON help_case (category);
-- Partial index: workload queries only ever look at non-closed cases
CREATE INDEX idx_case_assigned_active ON help_case (assigned_to) WHERE status <> 'closed';
-- GIN index for full-text search
CREATE INDEX idx_case_search_tsv      ON help_case USING GIN (search_tsv);
-- HNSW approximate-nearest-neighbour indexes for cosine similarity
CREATE INDEX idx_case_embedding       ON help_case USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_protocol_embedding   ON protocol  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX idx_note_case            ON case_note (case_id, created_at);
CREATE INDEX idx_followup_pending     ON follow_up (scheduled_for) WHERE completed_at IS NULL;
CREATE INDEX idx_caller_district      ON caller (district_id);
CREATE INDEX idx_audit_record         ON audit_log (table_name, record_id, changed_at DESC);
