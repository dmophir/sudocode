/**
 * Unit tests for Inspection MCP Tools
 *
 * Tests execution_trajectory and execution_changes tool handlers.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import {
  EXECUTIONS_TABLE,
  EXECUTION_LOGS_TABLE,
} from "@sudocode-ai/types/schema";
import type { WorkflowMCPContext } from "../../../../src/workflow/mcp/types.js";
import type { ExecutionService } from "../../../../src/services/execution-service.js";
import {
  handleExecutionTrajectory,
  handleExecutionChanges,
} from "../../../../src/workflow/mcp/tools/inspection.js";

// Mock the ExecutionChangesService
vi.mock("../../../../src/services/execution-changes-service.js", () => ({
  ExecutionChangesService: vi.fn().mockImplementation(() => ({
    getChanges: vi.fn().mockResolvedValue({
      available: true,
      captured: {
        files: [
          { path: "src/index.ts", additions: 10, deletions: 2, status: "M" },
          { path: "src/new.ts", additions: 50, deletions: 0, status: "A" },
        ],
        summary: {
          totalFiles: 2,
          totalAdditions: 60,
          totalDeletions: 2,
        },
      },
    }),
  })),
}));

// =============================================================================
// Test Setup
// =============================================================================

describe("Inspection MCP Tools", () => {
  let db: Database.Database;
  let context: WorkflowMCPContext;
  let mockExecutionService: ExecutionService;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(":memory:");

    // Set up schema (disable foreign keys for unit tests)
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec(EXECUTIONS_TABLE);
    db.exec(EXECUTION_LOGS_TABLE);

    // Mock execution service
    mockExecutionService = {
      createExecution: vi.fn(),
      cancelExecution: vi.fn(),
    } as unknown as ExecutionService;

    // Create context
    context = {
      workflowId: "wf-test1",
      db,
      executionService: mockExecutionService,
      repoPath: "/test/repo",
    };
  });

  afterEach(() => {
    db.close();
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Test Data Helpers
  // ===========================================================================

  function insertTestExecution(id: string) {
    db.prepare(`
      INSERT INTO executions (id, agent_type, target_branch, branch_name, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, "claude-code", "main", `branch-${id}`, "completed");
  }

  function insertTestLogs(executionId: string, entries: unknown[]) {
    const normalizedEntry = entries
      .map((e) => JSON.stringify(e))
      .join("\n");

    db.prepare(`
      INSERT INTO execution_logs (execution_id, normalized_entry, byte_size, line_count)
      VALUES (?, ?, ?, ?)
    `).run(
      executionId,
      normalizedEntry,
      normalizedEntry.length,
      entries.length
    );
  }

  // ===========================================================================
  // execution_trajectory Tests
  // ===========================================================================

  describe("handleExecutionTrajectory", () => {
    it("should return entries from logs", async () => {
      insertTestExecution("exec-1");
      insertTestLogs("exec-1", [
        {
          type: { kind: "tool_call", toolUse: { name: "Read", input: { path: "/test" } } },
          timestamp: "2025-01-01T00:00:00.000Z",
        },
        {
          type: { kind: "tool_result", toolResult: { toolName: "Read", output: "file contents" } },
          timestamp: "2025-01-01T00:00:01.000Z",
        },
      ]);

      const result = await handleExecutionTrajectory(context, {
        execution_id: "exec-1",
      });

      expect(result.execution_id).toBe("exec-1");
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].type).toBe("tool_call");
      expect(result.entries[0].tool_name).toBe("Read");
      expect(result.entries[1].type).toBe("tool_result");
    });

    it("should respect max_entries limit", async () => {
      insertTestExecution("exec-1");
      const entries = Array.from({ length: 100 }, (_, i) => ({
        type: { kind: "tool_call", toolUse: { name: `Tool${i}`, input: {} } },
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
      }));
      insertTestLogs("exec-1", entries);

      const result = await handleExecutionTrajectory(context, {
        execution_id: "exec-1",
        max_entries: 10,
      });

      expect(result.entries).toHaveLength(10);
      // Should return last 10 entries
      expect(result.entries[0].tool_name).toBe("Tool90");
    });

    it("should compute summary statistics", async () => {
      insertTestExecution("exec-1");
      insertTestLogs("exec-1", [
        {
          type: { kind: "tool_call", toolUse: { name: "Read", input: {} } },
          timestamp: "2025-01-01T00:00:00.000Z",
        },
        {
          type: { kind: "tool_call", toolUse: { name: "Write", input: {} } },
          timestamp: "2025-01-01T00:00:01.000Z",
        },
        {
          type: { kind: "error" },
          timestamp: "2025-01-01T00:00:02.000Z",
          error: "Something went wrong",
        },
      ]);

      const result = await handleExecutionTrajectory(context, {
        execution_id: "exec-1",
      });

      expect(result.summary.total_entries).toBe(3);
      expect(result.summary.tool_calls).toBe(2);
      expect(result.summary.errors).toBe(1);
      expect(result.summary.duration_ms).toBe(2000);
    });

    it("should handle empty logs", async () => {
      insertTestExecution("exec-1");
      // No logs inserted

      const result = await handleExecutionTrajectory(context, {
        execution_id: "exec-1",
      });

      expect(result.entries).toHaveLength(0);
      expect(result.summary.total_entries).toBe(0);
    });

    it("should filter out non-matching entry types", async () => {
      insertTestExecution("exec-1");
      insertTestLogs("exec-1", [
        {
          type: { kind: "tool_call", toolUse: { name: "Read", input: {} } },
          timestamp: "2025-01-01T00:00:00.000Z",
        },
        {
          type: { kind: "unknown_type" },
          timestamp: "2025-01-01T00:00:01.000Z",
        },
      ]);

      const result = await handleExecutionTrajectory(context, {
        execution_id: "exec-1",
      });

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].type).toBe("tool_call");
    });
  });

  // ===========================================================================
  // execution_changes Tests
  // ===========================================================================

  describe("handleExecutionChanges", () => {
    it("should return file list from changes service", async () => {
      insertTestExecution("exec-1");

      const result = await handleExecutionChanges(context, {
        execution_id: "exec-1",
      });

      expect(result.execution_id).toBe("exec-1");
      expect(result.files).toHaveLength(2);
      expect(result.files[0].path).toBe("src/index.ts");
      expect(result.files[0].status).toBe("modified");
      expect(result.files[1].path).toBe("src/new.ts");
      expect(result.files[1].status).toBe("added");
    });

    it("should return summary statistics", async () => {
      insertTestExecution("exec-1");

      const result = await handleExecutionChanges(context, {
        execution_id: "exec-1",
      });

      expect(result.summary.files_changed).toBe(2);
      expect(result.summary.total_additions).toBe(60);
      expect(result.summary.total_deletions).toBe(2);
    });

    it("should map file status codes correctly", async () => {
      insertTestExecution("exec-1");

      const result = await handleExecutionChanges(context, {
        execution_id: "exec-1",
      });

      // 'M' -> 'modified', 'A' -> 'added'
      expect(result.files[0].status).toBe("modified");
      expect(result.files[1].status).toBe("added");
    });
  });
});
