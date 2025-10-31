/**
 * Database service for sudocode server
 * Extends CLI schema with server-specific tables
 */

import Database from "better-sqlite3";
import * as path from "path";
import * as fs from "fs";

/**
 * Server-specific table schemas
 */

export const EXECUTIONS_TABLE = `
CREATE TABLE IF NOT EXISTS executions (
    id TEXT PRIMARY KEY,
    issue_id TEXT NOT NULL,

    -- Execution mode and configuration (SPEC-011 fields - nullable for legacy)
    mode TEXT CHECK(mode IN ('worktree', 'local')),
    prompt TEXT,
    config TEXT,

    -- Process information (legacy + new)
    agent_type TEXT CHECK(agent_type IN ('claude-code', 'codex')),
    session_id TEXT,
    workflow_execution_id TEXT,

    -- Git/branch information
    target_branch TEXT NOT NULL,
    branch_name TEXT NOT NULL,
    before_commit TEXT,
    after_commit TEXT,
    worktree_path TEXT,

    -- Status (unified - supports both old and new statuses)
    status TEXT NOT NULL CHECK(status IN (
        'preparing', 'pending', 'running', 'paused',
        'completed', 'failed', 'cancelled', 'stopped'
    )),

    -- Timing (Unix timestamps)
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    started_at INTEGER,
    completed_at INTEGER,
    cancelled_at INTEGER,

    -- Results and metadata
    exit_code INTEGER,
    error_message TEXT,
    error TEXT,
    model TEXT,
    summary TEXT,
    files_changed TEXT,

    -- Relationships (SPEC-011)
    parent_execution_id TEXT,

    -- Multi-step workflow support (future extension)
    step_type TEXT,
    step_index INTEGER,
    step_config TEXT,

    FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_execution_id) REFERENCES executions(id) ON DELETE SET NULL
);
`;

/**
 * Indexes for server tables
 */
export const SERVER_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_executions_issue_id ON executions(issue_id);
CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_session_id ON executions(session_id);
CREATE INDEX IF NOT EXISTS idx_executions_parent ON executions(parent_execution_id);
CREATE INDEX IF NOT EXISTS idx_executions_created_at ON executions(created_at);
CREATE INDEX IF NOT EXISTS idx_executions_workflow ON executions(workflow_execution_id);
CREATE INDEX IF NOT EXISTS idx_executions_workflow_step ON executions(workflow_execution_id, step_index);
CREATE INDEX IF NOT EXISTS idx_executions_step_type ON executions(step_type);
`;

/**
 * Database configuration
 */
export interface DatabaseConfig {
  path: string;
  readOnly?: boolean;
}

/**
 * Initialize database with CLI schema + server extensions
 */
export function initDatabase(config: DatabaseConfig): Database.Database {
  const { path: dbPath, readOnly = false } = config;

  // Ensure directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Open database
  const db = new Database(dbPath, {
    readonly: readOnly,
    fileMustExist: false,
  });

  // Don't modify schema if read-only
  if (readOnly) {
    return db;
  }

  // Configure database
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
  db.pragma("temp_store = MEMORY");

  // Create server-specific tables
  db.exec(EXECUTIONS_TABLE);

  // Create indexes
  db.exec(SERVER_INDEXES);

  return db;
}

/**
 * Check if database has CLI tables
 */
export function hasCliTables(db: Database.Database): boolean {
  const result = db
    .prepare(
      `
    SELECT COUNT(*) as count
    FROM sqlite_master
    WHERE type='table'
    AND name IN ('specs', 'issues', 'relationships', 'tags')
  `
    )
    .get() as { count: number };

  return result.count === 4;
}

/**
 * Get database info
 */
export function getDatabaseInfo(db: Database.Database) {
  const tables = db
    .prepare(
      `
    SELECT name
    FROM sqlite_master
    WHERE type='table'
    ORDER BY name
  `
    )
    .all() as { name: string }[];

  const version = db.prepare("PRAGMA user_version").get() as {
    user_version: number;
  };

  return {
    tables: tables.map((t) => t.name),
    version: version.user_version,
    hasCliTables: hasCliTables(db),
  };
}

/**
 * Close database connection
 */
export function closeDatabase(db: Database.Database): void {
  db.close();
}
