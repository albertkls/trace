PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS source (
    id           TEXT PRIMARY KEY,
    kind         TEXT NOT NULL,
    title        TEXT NOT NULL,
    file_path    TEXT,
    url          TEXT,
    raw_text     TEXT NOT NULL DEFAULT '',
    hash         TEXT NOT NULL UNIQUE,
    imported_at  TEXT NOT NULL,
    event_time   TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    workspace_id TEXT NOT NULL DEFAULT 'ws_default' REFERENCES workspace(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspace (
    id                     TEXT PRIMARY KEY,
    name                   TEXT NOT NULL,
    theme_color            TEXT,
    default_llm_profile_id TEXT REFERENCES llm_profile(id) ON DELETE SET NULL,
    created_at             TEXT NOT NULL,
    updated_at             TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS capture (
    id            TEXT PRIMARY KEY,
    source_id     TEXT NOT NULL REFERENCES source(id) ON DELETE CASCADE,
    seq           INTEGER NOT NULL,
    section_title TEXT,
    text          TEXT NOT NULL,
    speaker       TEXT,
    time_hint     TEXT,
    confidence    REAL NOT NULL DEFAULT 0.5,
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active',
    owner       TEXT,
    summary     TEXT NOT NULL DEFAULT '',
    color       TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    workspace_id TEXT NOT NULL DEFAULT 'ws_default' REFERENCES workspace(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS thread (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    project         TEXT,
    project_id      TEXT REFERENCES project(id) ON DELETE SET NULL,
    owner           TEXT,
    status          TEXT NOT NULL DEFAULT 'active',
    started_at      TEXT NOT NULL,
    last_active_at  TEXT NOT NULL,
    summary         TEXT NOT NULL DEFAULT '',
    pinned          INTEGER NOT NULL DEFAULT 0,
    workspace_id    TEXT NOT NULL DEFAULT 'ws_default' REFERENCES workspace(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS evidence (
    id           TEXT PRIMARY KEY,
    capture_id   TEXT REFERENCES capture(id) ON DELETE SET NULL,
    thread_id    TEXT REFERENCES thread(id) ON DELETE SET NULL,
    text         TEXT NOT NULL,
    event_date   TEXT,
    owners_json  TEXT NOT NULL DEFAULT '[]',
    tags_json    TEXT NOT NULL DEFAULT '[]',
    category     TEXT NOT NULL DEFAULT 'progress',
    status       TEXT NOT NULL DEFAULT 'ongoing',
    importance   REAL NOT NULL DEFAULT 0.5,
    created_at   TEXT NOT NULL,
    workspace_id  TEXT NOT NULL DEFAULT 'ws_default' REFERENCES workspace(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS todo (
    id         TEXT PRIMARY KEY,
    thread_id  TEXT REFERENCES thread(id) ON DELETE SET NULL,
    text       TEXT NOT NULL,
    due_date   TEXT,
    done       INTEGER NOT NULL DEFAULT 0,
    done_at    TEXT,
    created_at TEXT NOT NULL,
    workspace_id TEXT NOT NULL DEFAULT 'ws_default' REFERENCES workspace(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS note (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    body_md         TEXT NOT NULL DEFAULT '',
    day             TEXT NOT NULL,
    project_id      TEXT REFERENCES project(id) ON DELETE SET NULL,
    thread_ids_json TEXT NOT NULL DEFAULT '[]',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    workspace_id    TEXT NOT NULL DEFAULT 'ws_default' REFERENCES workspace(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS report (
    id                   TEXT PRIMARY KEY,
    period_label         TEXT NOT NULL,
    period_start         TEXT NOT NULL,
    period_end           TEXT NOT NULL,
    audience             TEXT NOT NULL DEFAULT 'boss',
    project_id           TEXT REFERENCES project(id) ON DELETE SET NULL,
    thread_ids_json      TEXT NOT NULL DEFAULT '[]',
    title                TEXT NOT NULL,
    body_md              TEXT NOT NULL DEFAULT '',
    outline_json         TEXT NOT NULL DEFAULT '[]',
    cited_evidence_json  TEXT NOT NULL DEFAULT '[]',
    status               TEXT NOT NULL DEFAULT 'draft',
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL,
    workspace_id         TEXT NOT NULL DEFAULT 'ws_default' REFERENCES workspace(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attachment (
    id             TEXT PRIMARY KEY,
    workspace_id   TEXT NOT NULL DEFAULT 'ws_default' REFERENCES workspace(id) ON DELETE CASCADE,
    owner_type     TEXT NOT NULL,
    owner_id       TEXT NOT NULL,
    file_path      TEXT NOT NULL,
    display_name   TEXT NOT NULL,
    file_kind      TEXT,
    file_size      INTEGER,
    mtime          TEXT,
    created_at     TEXT NOT NULL,
    last_opened_at TEXT,
    metadata_json  TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS llm_profile (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    provider    TEXT NOT NULL DEFAULT 'custom',
    protocol    TEXT NOT NULL DEFAULT 'openai-compat',
    base_url    TEXT NOT NULL,
    api_key     TEXT NOT NULL DEFAULT '',
    model       TEXT NOT NULL,
    temperature REAL NOT NULL DEFAULT 0.3,
    max_tokens  INTEGER NOT NULL DEFAULT 2048,
    is_default  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_source_hash ON source(hash);
CREATE INDEX IF NOT EXISTS idx_source_workspace ON source(workspace_id, imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_capture_source ON capture(source_id, seq);
CREATE INDEX IF NOT EXISTS idx_evidence_thread ON evidence(thread_id, event_date);
CREATE INDEX IF NOT EXISTS idx_thread_last_active ON thread(last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_thread_workspace_last_active ON thread(workspace_id, last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_thread_project_id ON thread(project_id, last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_period ON report(period_label, audience, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_project_id ON report(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_workspace ON report(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_attachment_owner ON attachment(workspace_id, owner_type, owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_todo_thread ON todo(thread_id, done);
CREATE INDEX IF NOT EXISTS idx_note_day ON note(day DESC);
CREATE INDEX IF NOT EXISTS idx_note_project_id ON note(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_note_workspace ON note(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_status ON project(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_updated ON project(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_workspace ON project(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_todo_workspace ON todo(workspace_id, done, due_date);
CREATE INDEX IF NOT EXISTS idx_evidence_workspace ON evidence(workspace_id, event_date);
