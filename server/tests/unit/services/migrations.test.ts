/**
 * Tests for database migrations
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import {
  runMigrations,
  getCurrentMigrationVersion,
} from "@sudocode-ai/types/migrations";
import { EXECUTIONS_TABLE, ISSUES_TABLE } from "@sudocode-ai/types/schema";

describe("Database Migrations", () => {
  let db: Database.Database;

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(":memory:");

    // Create base schema (migrations table will be created by getCurrentMigrationVersion)
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec(ISSUES_TABLE); // Required for migration 1
    db.exec(EXECUTIONS_TABLE);
  });

  afterEach(() => {
    db.close();
  });

  describe("Migration v2: add-normalized-logs-table", () => {
    it("should create execution_normalized_logs table", () => {
      // Run migrations
      runMigrations(db);

      // Verify table exists
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='execution_normalized_logs'"
        )
        .all() as Array<{ name: string }>;

      expect(tables).toHaveLength(1);
      expect(tables[0].name).toBe("execution_normalized_logs");
    });

    it("should create required indexes", () => {
      // Run migrations
      runMigrations(db);

      // Verify indexes exist
      const indexes = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='execution_normalized_logs'"
        )
        .all() as Array<{ name: string }>;

      const indexNames = indexes.map((idx) => idx.name);

      expect(indexNames).toContain("idx_normalized_logs_execution");
      expect(indexNames).toContain("idx_normalized_logs_kind");
      expect(indexNames).toContain("idx_normalized_logs_timestamp");
    });

    it("should have correct table schema", () => {
      // Run migrations
      runMigrations(db);

      // Verify columns
      const columns = db.pragma(
        "table_info(execution_normalized_logs)"
      ) as Array<{
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }>;

      const columnNames = columns.map((col) => col.name);

      expect(columnNames).toContain("id");
      expect(columnNames).toContain("execution_id");
      expect(columnNames).toContain("entry_index");
      expect(columnNames).toContain("entry_kind");
      expect(columnNames).toContain("entry_data");
      expect(columnNames).toContain("timestamp");
      expect(columnNames).toContain("created_at");

      // Verify primary key
      const pkColumn = columns.find((col) => col.pk === 1);
      expect(pkColumn?.name).toBe("id");

      // Verify NOT NULL constraints
      const notNullColumns = columns
        .filter((col) => col.notnull === 1)
        .map((col) => col.name);
      expect(notNullColumns).toContain("execution_id");
      expect(notNullColumns).toContain("entry_index");
      expect(notNullColumns).toContain("entry_kind");
      expect(notNullColumns).toContain("entry_data");
      expect(notNullColumns).toContain("timestamp");
    });

    it("should be idempotent (safe to run multiple times)", () => {
      // Run migrations twice
      runMigrations(db);
      runMigrations(db);

      // Should still have one table
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='execution_normalized_logs'"
        )
        .all() as Array<{ name: string }>;

      expect(tables).toHaveLength(1);
    });

    it("should record migration version", () => {
      // Run migrations
      runMigrations(db);

      // Check version
      const version = getCurrentMigrationVersion(db);
      expect(version).toBeGreaterThanOrEqual(2);

      // Verify migration record
      const migration = db
        .prepare("SELECT * FROM migrations WHERE version = ?")
        .get(2) as { version: number; name: string } | undefined;

      expect(migration).toBeDefined();
      expect(migration?.name).toBe("add-normalized-logs-table");
    });

    it("should allow inserting normalized log entries", () => {
      // Run migrations
      runMigrations(db);

      // Create test execution
      db.prepare(
        "INSERT INTO executions (id, agent_type, target_branch, branch_name, status) VALUES (?, ?, ?, ?, ?)"
      ).run("exec-1", "claude-code", "main", "test", "running");

      // Insert test normalized log
      const entry = {
        index: 0,
        type: { kind: "assistant_message" },
        content: "Test message",
        timestamp: new Date("2025-01-21T10:00:00Z"),
      };

      db.prepare(`
        INSERT INTO execution_normalized_logs (id, execution_id, entry_index, entry_kind, entry_data, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        "log-1",
        "exec-1",
        entry.index,
        entry.type.kind,
        JSON.stringify(entry),
        entry.timestamp.getTime()
      );

      // Verify insertion
      const logs = db
        .prepare(
          "SELECT * FROM execution_normalized_logs WHERE execution_id = ?"
        )
        .all("exec-1") as Array<{ entry_data: string }>;

      expect(logs).toHaveLength(1);

      const retrieved = JSON.parse(logs[0].entry_data);
      expect(retrieved.content).toBe("Test message");
    });

    it("should enforce foreign key constraint to executions table", () => {
      // Run migrations
      runMigrations(db);

      // Enable foreign keys
      db.exec("PRAGMA foreign_keys = ON");

      // Try to insert log for non-existent execution
      expect(() => {
        db.prepare(`
          INSERT INTO execution_normalized_logs (id, execution_id, entry_index, entry_kind, entry_data, timestamp)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          "log-1",
          "nonexistent-exec",
          0,
          "assistant_message",
          "{}",
          Date.now()
        );
      }).toThrow();
    });

    it("should cascade delete logs when execution is deleted", () => {
      // Run migrations
      runMigrations(db);

      // Enable foreign keys
      db.exec("PRAGMA foreign_keys = ON");

      // Create execution and logs
      db.prepare(
        "INSERT INTO executions (id, agent_type, target_branch, branch_name, status) VALUES (?, ?, ?, ?, ?)"
      ).run("exec-1", "claude-code", "main", "test", "running");

      db.prepare(`
        INSERT INTO execution_normalized_logs (id, execution_id, entry_index, entry_kind, entry_data, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run("log-1", "exec-1", 0, "assistant_message", "{}", Date.now());

      // Delete execution
      db.prepare("DELETE FROM executions WHERE id = ?").run("exec-1");

      // Verify logs were cascade deleted
      const logs = db
        .prepare(
          "SELECT * FROM execution_normalized_logs WHERE execution_id = ?"
        )
        .all("exec-1");

      expect(logs).toHaveLength(0);
    });
  });
});
