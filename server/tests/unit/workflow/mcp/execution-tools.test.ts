/**
 * Unit tests for Execution MCP Tools
 *
 * Tests execute_issue, execution_status, and execution_cancel tool handlers.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import {
  WORKFLOWS_TABLE,
  ISSUES_TABLE,
  EXECUTIONS_TABLE,
} from "@sudocode-ai/types/schema";
import type { WorkflowMCPContext } from "../../../../src/workflow/mcp/types.js";
import type { ExecutionService } from "../../../../src/services/execution-service.js";
import {
  handleExecuteIssue,
  handleExecutionStatus,
  handleExecutionCancel,
} from "../../../../src/workflow/mcp/tools/execution.js";

// =============================================================================
// Test Setup
// =============================================================================

describe("Execution MCP Tools", () => {
  let db: Database.Database;
  let context: WorkflowMCPContext;
  let mockExecutionService: ExecutionService;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(":memory:");

    // Set up schema (disable foreign keys for unit tests)
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec(WORKFLOWS_TABLE);
    db.exec(ISSUES_TABLE);
    db.exec(EXECUTIONS_TABLE);

    // Mock execution service
    mockExecutionService = {
      createExecution: vi.fn().mockResolvedValue({
        id: "exec-new",
        status: "pending",
        worktree_path: "/test/worktree",
        branch_name: "sudocode/exec-new",
      }),
      cancelExecution: vi.fn().mockResolvedValue(undefined),
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
  });

  // ===========================================================================
  // Test Data Helpers
  // ===========================================================================

  function insertTestWorkflow(overrides: Record<string, unknown> = {}) {
    const defaults = {
      id: "wf-test1",
      title: "Test Workflow",
      source: JSON.stringify({ type: "issues", issueIds: ["i-1", "i-2"] }),
      status: "running",
      steps: JSON.stringify([
        {
          id: "step-1",
          issueId: "i-1",
          index: 0,
          dependencies: [],
          status: "pending",
        },
        {
          id: "step-2",
          issueId: "i-2",
          index: 1,
          dependencies: ["step-1"],
          status: "pending",
        },
      ]),
      base_branch: "main",
      current_step_index: 0,
      config: JSON.stringify({
        parallelism: "sequential",
        onFailure: "pause",
        defaultAgentType: "claude-code",
      }),
    };

    const data = { ...defaults, ...overrides };
    db.prepare(`
      INSERT INTO workflows (
        id, title, source, status, steps, base_branch,
        current_step_index, config
      ) VALUES (
        @id, @title, @source, @status, @steps, @base_branch,
        @current_step_index, @config
      )
    `).run(data);
  }

  function insertTestIssue(id: string, title: string, content?: string) {
    db.prepare(`
      INSERT INTO issues (id, uuid, title, status, content, priority)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, `uuid-${id}`, title, "open", content || `Content for ${title}`, 1);
  }

  function insertTestExecution(
    id: string,
    status: string,
    extras: Record<string, unknown> = {}
  ) {
    const defaults = {
      id,
      agent_type: "claude-code",
      target_branch: "main",
      branch_name: `branch-${id}`,
      status,
      worktree_path: `/test/worktree/${id}`,
      started_at: new Date().toISOString(),
      exit_code: null,
      error_message: null,
      summary: null,
      files_changed: null,
      completed_at: null,
    };

    const data = { ...defaults, ...extras };
    db.prepare(`
      INSERT INTO executions (
        id, agent_type, target_branch, branch_name, status,
        worktree_path, started_at, exit_code, error_message,
        summary, files_changed, completed_at
      )
      VALUES (
        @id, @agent_type, @target_branch, @branch_name, @status,
        @worktree_path, @started_at, @exit_code, @error_message,
        @summary, @files_changed, @completed_at
      )
    `).run(data);
  }

  // ===========================================================================
  // execute_issue Tests
  // ===========================================================================

  describe("handleExecuteIssue", () => {
    it("should create execution for valid issue", async () => {
      insertTestWorkflow();
      insertTestIssue("i-1", "Issue 1", "Implement feature X");

      const result = await handleExecuteIssue(context, {
        issue_id: "i-1",
        worktree_mode: "create_root",
      });

      expect(result.success).toBe(true);
      expect(result.execution_id).toBe("exec-new");
      expect(mockExecutionService.createExecution).toHaveBeenCalledWith(
        "i-1",
        expect.objectContaining({ mode: "worktree" }),
        "Implement feature X",
        "claude-code"
      );
    });

    it("should reject issue not in workflow", async () => {
      insertTestWorkflow();
      insertTestIssue("i-other", "Other Issue");

      await expect(
        handleExecuteIssue(context, {
          issue_id: "i-other",
          worktree_mode: "create_root",
        })
      ).rejects.toThrow("not part of workflow");
    });

    it("should reject when workflow not running", async () => {
      insertTestWorkflow({ status: "paused" });
      insertTestIssue("i-1", "Issue 1");

      await expect(
        handleExecuteIssue(context, {
          issue_id: "i-1",
          worktree_mode: "create_root",
        })
      ).rejects.toThrow("workflow is paused");
    });

    it("should reject when step already running", async () => {
      insertTestWorkflow({
        steps: JSON.stringify([
          {
            id: "step-1",
            issueId: "i-1",
            index: 0,
            dependencies: [],
            status: "running",
          },
        ]),
      });
      insertTestIssue("i-1", "Issue 1");

      await expect(
        handleExecuteIssue(context, {
          issue_id: "i-1",
          worktree_mode: "create_root",
        })
      ).rejects.toThrow("status is running");
    });

    it("should require worktree_id for use_root mode", async () => {
      insertTestWorkflow();
      insertTestIssue("i-1", "Issue 1");

      await expect(
        handleExecuteIssue(context, {
          issue_id: "i-1",
          worktree_mode: "use_root",
        })
      ).rejects.toThrow("worktree_id is required");
    });

    it("should require worktree_id for use_branch mode", async () => {
      insertTestWorkflow();
      insertTestIssue("i-1", "Issue 1");

      await expect(
        handleExecuteIssue(context, {
          issue_id: "i-1",
          worktree_mode: "use_branch",
        })
      ).rejects.toThrow("worktree_id is required");
    });

    it("should pass reuseWorktreeId for use_root mode", async () => {
      insertTestWorkflow();
      insertTestIssue("i-1", "Issue 1");

      await handleExecuteIssue(context, {
        issue_id: "i-1",
        worktree_mode: "use_root",
        worktree_id: "exec-previous",
      });

      expect(mockExecutionService.createExecution).toHaveBeenCalledWith(
        "i-1",
        expect.objectContaining({ reuseWorktreeId: "exec-previous" }),
        expect.any(String),
        expect.any(String)
      );
    });

    it("should update step status after execution created", async () => {
      insertTestWorkflow();
      insertTestIssue("i-1", "Issue 1");

      await handleExecuteIssue(context, {
        issue_id: "i-1",
        worktree_mode: "create_root",
      });

      const workflow = db
        .prepare("SELECT steps FROM workflows WHERE id = ?")
        .get("wf-test1") as { steps: string };
      const steps = JSON.parse(workflow.steps);
      expect(steps[0].status).toBe("running");
      expect(steps[0].executionId).toBe("exec-new");
    });

    it("should respect custom agent_type", async () => {
      insertTestWorkflow();
      insertTestIssue("i-1", "Issue 1");

      await handleExecuteIssue(context, {
        issue_id: "i-1",
        agent_type: "codex",
        worktree_mode: "create_root",
      });

      expect(mockExecutionService.createExecution).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.any(String),
        "codex"
      );
    });
  });

  // ===========================================================================
  // execution_status Tests
  // ===========================================================================

  describe("handleExecutionStatus", () => {
    it("should return execution data", async () => {
      insertTestExecution("exec-1", "running");

      const result = await handleExecutionStatus(context, {
        execution_id: "exec-1",
      });

      expect(result.id).toBe("exec-1");
      expect(result.status).toBe("running");
    });

    it("should include exit_code when present", async () => {
      insertTestExecution("exec-1", "completed", { exit_code: 0 });

      const result = await handleExecutionStatus(context, {
        execution_id: "exec-1",
      });

      expect(result.exit_code).toBe(0);
    });

    it("should include error when present", async () => {
      insertTestExecution("exec-1", "failed", {
        error_message: "Something failed",
      });

      const result = await handleExecutionStatus(context, {
        execution_id: "exec-1",
      });

      expect(result.error).toBe("Something failed");
    });

    it("should include summary when present", async () => {
      insertTestExecution("exec-1", "completed", {
        summary: "Implemented feature X",
      });

      const result = await handleExecutionStatus(context, {
        execution_id: "exec-1",
      });

      expect(result.summary).toBe("Implemented feature X");
    });

    it("should parse files_changed JSON", async () => {
      insertTestExecution("exec-1", "completed", {
        files_changed: JSON.stringify(["file1.ts", "file2.ts"]),
      });

      const result = await handleExecutionStatus(context, {
        execution_id: "exec-1",
      });

      expect(result.files_changed).toEqual(["file1.ts", "file2.ts"]);
    });

    it("should throw error for non-existent execution", async () => {
      await expect(
        handleExecutionStatus(context, { execution_id: "exec-nonexistent" })
      ).rejects.toThrow("Execution not found");
    });
  });

  // ===========================================================================
  // execution_cancel Tests
  // ===========================================================================

  describe("handleExecutionCancel", () => {
    it("should call ExecutionService.cancelExecution", async () => {
      insertTestExecution("exec-1", "running");

      await handleExecutionCancel(context, { execution_id: "exec-1" });

      expect(mockExecutionService.cancelExecution).toHaveBeenCalledWith(
        "exec-1"
      );
    });

    it("should return success with final status", async () => {
      insertTestExecution("exec-1", "running");

      // Mock returns, then we update the status in DB
      (mockExecutionService.cancelExecution as ReturnType<typeof vi.fn>)
        .mockImplementation(() => {
          db.prepare("UPDATE executions SET status = ? WHERE id = ?").run(
            "cancelled",
            "exec-1"
          );
          return Promise.resolve();
        });

      const result = await handleExecutionCancel(context, {
        execution_id: "exec-1",
      });

      expect(result.success).toBe(true);
      expect(result.final_status).toBe("cancelled");
    });

    it("should include reason in response", async () => {
      insertTestExecution("exec-1", "running");

      const result = await handleExecutionCancel(context, {
        execution_id: "exec-1",
        reason: "User requested cancellation",
      });

      expect(result.message).toBe("User requested cancellation");
    });

    it("should throw error for non-existent execution", async () => {
      await expect(
        handleExecutionCancel(context, { execution_id: "exec-nonexistent" })
      ).rejects.toThrow("Execution not found");
    });

    it("should throw error for completed execution", async () => {
      insertTestExecution("exec-1", "completed");

      await expect(
        handleExecutionCancel(context, { execution_id: "exec-1" })
      ).rejects.toThrow("Cannot cancel execution");
    });

    it("should allow cancelling pending execution", async () => {
      insertTestExecution("exec-1", "pending");

      const result = await handleExecutionCancel(context, {
        execution_id: "exec-1",
      });

      expect(result.success).toBe(true);
    });
  });
});
