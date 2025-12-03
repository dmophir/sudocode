/**
 * Unit tests for Workflow MCP Tools
 *
 * Tests workflow_status and workflow_complete tool handlers.
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
  handleWorkflowStatus,
  handleWorkflowComplete,
} from "../../../../src/workflow/mcp/tools/workflow.js";

// =============================================================================
// Test Setup
// =============================================================================

describe("Workflow MCP Tools", () => {
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

    // Create indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_executions_workflow ON executions(workflow_execution_id);
    `);

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
          status: "completed",
          executionId: "exec-1",
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

  function insertTestIssue(id: string, title: string) {
    db.prepare(`
      INSERT INTO issues (id, uuid, title, status, content, priority)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, `uuid-${id}`, title, "open", `Content for ${title}`, 1);
  }

  function insertTestExecution(
    id: string,
    status: string,
    workflowId?: string
  ) {
    db.prepare(`
      INSERT INTO executions (
        id, agent_type, target_branch, branch_name, status,
        workflow_execution_id, started_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      "claude-code",
      "main",
      `branch-${id}`,
      status,
      workflowId || null,
      new Date().toISOString()
    );
  }

  // ===========================================================================
  // workflow_status Tests
  // ===========================================================================

  describe("handleWorkflowStatus", () => {
    it("should return workflow with steps", async () => {
      insertTestWorkflow();
      insertTestIssue("i-1", "Issue 1");
      insertTestIssue("i-2", "Issue 2");

      const result = await handleWorkflowStatus(context);

      expect(result.workflow.id).toBe("wf-test1");
      expect(result.workflow.title).toBe("Test Workflow");
      expect(result.workflow.status).toBe("running");
      expect(result.steps).toHaveLength(2);
    });

    it("should include issue titles in steps", async () => {
      insertTestWorkflow();
      insertTestIssue("i-1", "First Issue");
      insertTestIssue("i-2", "Second Issue");

      const result = await handleWorkflowStatus(context);

      expect(result.steps[0].issueTitle).toBe("First Issue");
      expect(result.steps[1].issueTitle).toBe("Second Issue");
    });

    it("should include active executions", async () => {
      insertTestWorkflow();
      insertTestIssue("i-1", "Issue 1");
      insertTestIssue("i-2", "Issue 2");
      insertTestExecution("exec-1", "running", "wf-test1");

      const result = await handleWorkflowStatus(context);

      expect(result.activeExecutions).toHaveLength(1);
      expect(result.activeExecutions[0].id).toBe("exec-1");
      expect(result.activeExecutions[0].status).toBe("running");
    });

    it("should calculate ready steps correctly", async () => {
      insertTestWorkflow();
      insertTestIssue("i-1", "Issue 1");
      insertTestIssue("i-2", "Issue 2");

      const result = await handleWorkflowStatus(context);

      // step-2 depends on step-1 which is completed, so step-2 should be ready
      expect(result.readySteps).toContain("step-2");
    });

    it("should not include completed steps in ready list", async () => {
      insertTestWorkflow({
        steps: JSON.stringify([
          {
            id: "step-1",
            issueId: "i-1",
            index: 0,
            dependencies: [],
            status: "completed",
          },
        ]),
      });
      insertTestIssue("i-1", "Issue 1");

      const result = await handleWorkflowStatus(context);

      expect(result.readySteps).not.toContain("step-1");
    });

    it("should throw error for non-existent workflow", async () => {
      context.workflowId = "wf-nonexistent";

      await expect(handleWorkflowStatus(context)).rejects.toThrow(
        "Workflow not found"
      );
    });
  });

  // ===========================================================================
  // workflow_complete Tests
  // ===========================================================================

  describe("handleWorkflowComplete", () => {
    it("should update status to completed", async () => {
      insertTestWorkflow();

      const result = await handleWorkflowComplete(context, {
        summary: "All done!",
      });

      expect(result.success).toBe(true);
      expect(result.workflow_status).toBe("completed");
      expect(result.completed_at).toBeDefined();

      // Verify database was updated
      const workflow = db
        .prepare("SELECT status, completed_at FROM workflows WHERE id = ?")
        .get("wf-test1") as { status: string; completed_at: string };
      expect(workflow.status).toBe("completed");
      expect(workflow.completed_at).toBeDefined();
    });

    it("should update status to failed when specified", async () => {
      insertTestWorkflow();

      const result = await handleWorkflowComplete(context, {
        summary: "Something went wrong",
        status: "failed",
      });

      expect(result.workflow_status).toBe("failed");

      const workflow = db
        .prepare("SELECT status FROM workflows WHERE id = ?")
        .get("wf-test1") as { status: string };
      expect(workflow.status).toBe("failed");
    });

    it("should reject already-completed workflow", async () => {
      insertTestWorkflow({ status: "completed" });

      await expect(
        handleWorkflowComplete(context, { summary: "Done again" })
      ).rejects.toThrow("already completed");
    });

    it("should reject already-failed workflow", async () => {
      insertTestWorkflow({ status: "failed" });

      await expect(
        handleWorkflowComplete(context, { summary: "Try again" })
      ).rejects.toThrow("already failed");
    });

    it("should reject cancelled workflow", async () => {
      insertTestWorkflow({ status: "cancelled" });

      await expect(
        handleWorkflowComplete(context, { summary: "Complete anyway" })
      ).rejects.toThrow("cancelled");
    });

    it("should reject completion with active executions", async () => {
      insertTestWorkflow();
      insertTestExecution("exec-active", "running", "wf-test1");

      await expect(
        handleWorkflowComplete(context, { summary: "Complete" })
      ).rejects.toThrow("execution(s) still active");
    });

    it("should allow failed status with active executions", async () => {
      insertTestWorkflow();
      insertTestExecution("exec-active", "running", "wf-test1");

      const result = await handleWorkflowComplete(context, {
        summary: "Giving up",
        status: "failed",
      });

      expect(result.workflow_status).toBe("failed");
    });

    it("should throw error for non-existent workflow", async () => {
      context.workflowId = "wf-nonexistent";

      await expect(
        handleWorkflowComplete(context, { summary: "Done" })
      ).rejects.toThrow("Workflow not found");
    });
  });
});
