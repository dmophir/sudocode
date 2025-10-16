/**
 * SQLite schema definition for sudograph
 */

export const SCHEMA_VERSION = '1.0';

/**
 * Database configuration SQL
 */
export const DB_CONFIG = `
-- Enable WAL mode for better concurrency
PRAGMA journal_mode=WAL;

-- Enforce foreign keys
PRAGMA foreign_keys=ON;

-- Optimize for performance
PRAGMA synchronous=NORMAL;
PRAGMA temp_store=MEMORY;
PRAGMA mmap_size=30000000000;
PRAGMA page_size=4096;
PRAGMA cache_size=10000;
`;

/**
 * Core table schemas
 */

export const SPECS_TABLE = `
CREATE TABLE IF NOT EXISTS specs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL CHECK(length(title) <= 500),
    file_path TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'feature',
    status TEXT NOT NULL DEFAULT 'draft',
    priority INTEGER NOT NULL DEFAULT 2 CHECK(priority >= 0 AND priority <= 4),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    parent_id TEXT,
    FOREIGN KEY (parent_id) REFERENCES specs(id) ON DELETE SET NULL
);
`;

export const ISSUES_TABLE = `
CREATE TABLE IF NOT EXISTS issues (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL CHECK(length(title) <= 500),
    description TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    priority INTEGER NOT NULL DEFAULT 2 CHECK(priority >= 0 AND priority <= 4),
    issue_type TEXT NOT NULL DEFAULT 'task',
    assignee TEXT,
    estimated_minutes INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    created_by TEXT NOT NULL,
    parent_id TEXT,
    FOREIGN KEY (parent_id) REFERENCES issues(id) ON DELETE SET NULL
);
`;

export const RELATIONSHIPS_TABLE = `
CREATE TABLE IF NOT EXISTS relationships (
    from_id TEXT NOT NULL,
    from_type TEXT NOT NULL,
    to_id TEXT NOT NULL,
    to_type TEXT NOT NULL,
    relationship_type TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT NOT NULL,
    metadata TEXT,
    PRIMARY KEY (from_id, from_type, to_id, to_type, relationship_type)
);
`;

export const TAGS_TABLE = `
CREATE TABLE IF NOT EXISTS tags (
    entity_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (entity_id, entity_type, tag)
);
`;

export const EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    event_type TEXT NOT NULL,
    actor TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    comment TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    git_commit_sha TEXT,
    source TEXT
);
`;

/**
 * Index definitions
 */

export const SPECS_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_specs_status ON specs(status);
CREATE INDEX IF NOT EXISTS idx_specs_type ON specs(type);
CREATE INDEX IF NOT EXISTS idx_specs_priority ON specs(priority);
CREATE INDEX IF NOT EXISTS idx_specs_parent ON specs(parent_id);
CREATE INDEX IF NOT EXISTS idx_specs_created_at ON specs(created_at);
CREATE INDEX IF NOT EXISTS idx_specs_updated_at ON specs(updated_at);
`;

export const ISSUES_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_priority ON issues(priority);
CREATE INDEX IF NOT EXISTS idx_issues_type ON issues(issue_type);
CREATE INDEX IF NOT EXISTS idx_issues_assignee ON issues(assignee);
CREATE INDEX IF NOT EXISTS idx_issues_parent ON issues(parent_id);
CREATE INDEX IF NOT EXISTS idx_issues_created_at ON issues(created_at);
CREATE INDEX IF NOT EXISTS idx_issues_updated_at ON issues(updated_at);
CREATE INDEX IF NOT EXISTS idx_issues_closed_at ON issues(closed_at);
`;

export const RELATIONSHIPS_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_rel_from ON relationships(from_id, from_type);
CREATE INDEX IF NOT EXISTS idx_rel_to ON relationships(to_id, to_type);
CREATE INDEX IF NOT EXISTS idx_rel_type ON relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_rel_created_at ON relationships(created_at);
`;

export const TAGS_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_tags_entity ON tags(entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);
`;

export const EVENTS_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_events_entity ON events(entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_actor ON events(actor);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_git_commit ON events(git_commit_sha);
`;

/**
 * View definitions
 */

export const READY_SPECS_VIEW = `
CREATE VIEW IF NOT EXISTS ready_specs AS
SELECT s.*
FROM specs s
WHERE s.status IN ('draft', 'review')
  AND NOT EXISTS (
    SELECT 1 FROM relationships r
    JOIN specs blocker ON r.to_id = blocker.id AND r.to_type = 'spec'
    WHERE r.from_id = s.id
      AND r.from_type = 'spec'
      AND r.relationship_type = 'blocks'
      AND blocker.status IN ('draft', 'review')
  );
`;

export const READY_ISSUES_VIEW = `
CREATE VIEW IF NOT EXISTS ready_issues AS
SELECT i.*
FROM issues i
WHERE i.status = 'open'
  AND NOT EXISTS (
    SELECT 1 FROM relationships r
    JOIN issues blocker ON r.to_id = blocker.id AND r.to_type = 'issue'
    WHERE r.from_id = i.id
      AND r.from_type = 'issue'
      AND r.relationship_type = 'blocks'
      AND blocker.status IN ('open', 'in_progress', 'blocked')
  );
`;

export const BLOCKED_ISSUES_VIEW = `
CREATE VIEW IF NOT EXISTS blocked_issues AS
SELECT
    i.*,
    COUNT(r.to_id) as blocked_by_count,
    GROUP_CONCAT(r.to_id) as blocked_by_ids
FROM issues i
JOIN relationships r ON i.id = r.from_id AND r.from_type = 'issue'
JOIN issues blocker ON r.to_id = blocker.id AND r.to_type = 'issue'
WHERE i.status IN ('open', 'in_progress', 'blocked')
  AND r.relationship_type = 'blocks'
  AND blocker.status IN ('open', 'in_progress', 'blocked')
GROUP BY i.id;
`;

/**
 * Combined schema initialization
 */
export const ALL_TABLES = [
  SPECS_TABLE,
  ISSUES_TABLE,
  RELATIONSHIPS_TABLE,
  TAGS_TABLE,
  EVENTS_TABLE,
];

export const ALL_INDEXES = [
  SPECS_INDEXES,
  ISSUES_INDEXES,
  RELATIONSHIPS_INDEXES,
  TAGS_INDEXES,
  EVENTS_INDEXES,
];

export const ALL_VIEWS = [
  READY_SPECS_VIEW,
  READY_ISSUES_VIEW,
  BLOCKED_ISSUES_VIEW,
];
