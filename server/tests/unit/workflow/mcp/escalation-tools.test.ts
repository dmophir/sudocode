/**
 * Unit tests for Escalation MCP Tools
 *
 * Tests escalate_to_user and notify_user tool handlers.
 * Escalations are stored as workflow events, not as workflow fields.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import {
  WORKFLOWS_TABLE,
  WORKFLOW_EVENTS_TABLE,
} from "@sudocode-ai/types/schema";
import type { WorkflowMCPContext } from "../../../../src/workflow/mcp/types.js";
import type { ExecutionService } from "../../../../src/services/execution-service.js";
import {
  handleEscalateToUser,
  handleNotifyUser,
} from "../../../../src/workflow/mcp/tools/escalation.js";

// =============================================================================
// Test Setup
// =============================================================================

describe("Escalation MCP Tools", () => {
  let db: Database.Database;
  let context: WorkflowMCPContext;
  let mockExecutionService: ExecutionService;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(":memory:");

    // Set up schema (disable foreign keys for unit tests)
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec(WORKFLOWS_TABLE);
    db.exec(WORKFLOW_EVENTS_TABLE);

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
      source: JSON.stringify({ type: "issues", issueIds: ["i-1"] }),
      status: "running",
      steps: JSON.stringify([]),
      base_branch: "main",
      current_step_index: 0,
      config: JSON.stringify({
        parallelism: "sequential",
        onFailure: "pause",
        defaultAgentType: "claude-code",
        autonomyLevel: "human_in_loop",
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

  function insertEscalationRequestedEvent(
    workflowId: string,
    escalationId: string,
    message: string
  ) {
    db.prepare(`
      INSERT INTO workflow_events (id, workflow_id, type, payload, created_at)
      VALUES (?, ?, 'escalation_requested', ?, ?)
    `).run(
      `event-${escalationId}`,
      workflowId,
      JSON.stringify({
        escalation_id: escalationId,
        message,
      }),
      new Date().toISOString()
    );
  }

  function insertEscalationResolvedEvent(
    workflowId: string,
    escalationId: string
  ) {
    db.prepare(`
      INSERT INTO workflow_events (id, workflow_id, type, payload, created_at)
      VALUES (?, ?, 'escalation_resolved', ?, ?)
    `).run(
      `resolved-${escalationId}`,
      workflowId,
      JSON.stringify({
        escalation_id: escalationId,
        action: "approve",
      }),
      new Date().toISOString()
    );
  }

  function getEscalationEvents(workflowId: string) {
    return db
      .prepare(
        `SELECT type, payload FROM workflow_events
         WHERE workflow_id = ? AND type LIKE 'escalation%'
         ORDER BY created_at ASC`
      )
      .all(workflowId) as Array<{ type: string; payload: string }>;
  }

  function getNotificationEvents(workflowId: string) {
    return db
      .prepare(
        `SELECT type, payload FROM workflow_events
         WHERE workflow_id = ? AND type = 'user_notification'
         ORDER BY created_at ASC`
      )
      .all(workflowId) as Array<{ type: string; payload: string }>;
  }

  // ===========================================================================
  // escalate_to_user Tests
  // ===========================================================================

  describe("handleEscalateToUser", () => {
    it("should create a pending escalation event", async () => {
      insertTestWorkflow();

      const result = await handleEscalateToUser(context, {
        message: "Should we proceed with the refactoring?",
      });

      expect(result.status).toBe("pending");
      expect(result.escalation_id).toBeDefined();
      expect(result.message).toContain("Escalation request created");
    });

    it("should record escalation_requested event with all data", async () => {
      insertTestWorkflow();

      const result = await handleEscalateToUser(context, {
        message: "Need your input",
        options: ["Yes", "No", "Maybe"],
        context: { key: "value" },
      });

      const events = getEscalationEvents("wf-test1");
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("escalation_requested");

      const payload = JSON.parse(events[0].payload);
      expect(payload.escalation_id).toBe(result.escalation_id);
      expect(payload.message).toBe("Need your input");
      expect(payload.options).toEqual(["Yes", "No", "Maybe"]);
      expect(payload.context).toEqual({ key: "value" });
    });

    it("should auto-approve in full_auto mode", async () => {
      insertTestWorkflow({
        config: JSON.stringify({
          parallelism: "sequential",
          onFailure: "pause",
          defaultAgentType: "claude-code",
          autonomyLevel: "full_auto",
        }),
      });

      const result = await handleEscalateToUser(context, {
        message: "Should we continue?",
      });

      expect(result.status).toBe("auto_approved");
      expect(result.escalation_id).toBeUndefined();
      expect(result.message).toContain("auto-approved");

      // Should NOT record any event in full_auto mode
      const events = getEscalationEvents("wf-test1");
      expect(events).toHaveLength(0);
    });

    it("should reject if escalation already pending (unresolved event)", async () => {
      insertTestWorkflow();
      // Insert an unresolved escalation_requested event
      insertEscalationRequestedEvent("wf-test1", "existing-id", "First escalation");

      await expect(
        handleEscalateToUser(context, {
          message: "Second escalation",
        })
      ).rejects.toThrow("already has a pending escalation");
    });

    it("should allow new escalation after previous one is resolved", async () => {
      insertTestWorkflow();
      // Insert a resolved escalation
      insertEscalationRequestedEvent("wf-test1", "old-id", "Old escalation");
      insertEscalationResolvedEvent("wf-test1", "old-id");

      // Should succeed - previous escalation is resolved
      const result = await handleEscalateToUser(context, {
        message: "New escalation",
      });

      expect(result.status).toBe("pending");
      expect(result.escalation_id).toBeDefined();
      expect(result.escalation_id).not.toBe("old-id");
    });

    it("should throw error for non-existent workflow", async () => {
      context.workflowId = "wf-nonexistent";

      await expect(
        handleEscalateToUser(context, {
          message: "Hello?",
        })
      ).rejects.toThrow("Workflow not found");
    });

    it("should generate unique escalation IDs", async () => {
      insertTestWorkflow();

      const result1 = await handleEscalateToUser(context, {
        message: "First question",
      });

      // Resolve the first escalation by inserting resolved event
      insertEscalationResolvedEvent("wf-test1", result1.escalation_id!);

      const result2 = await handleEscalateToUser(context, {
        message: "Second question",
      });

      expect(result1.escalation_id).toBeDefined();
      expect(result2.escalation_id).toBeDefined();
      expect(result1.escalation_id).not.toBe(result2.escalation_id);
    });
  });

  // ===========================================================================
  // notify_user Tests
  // ===========================================================================

  describe("handleNotifyUser", () => {
    it("should return success for notification", async () => {
      insertTestWorkflow();

      const result = await handleNotifyUser(context, {
        message: "Progress: 50% complete",
      });

      expect(result.success).toBe(true);
      expect(result.delivered).toBe(false); // We don't know if user received it
    });

    it("should accept different notification levels", async () => {
      insertTestWorkflow();

      const infoResult = await handleNotifyUser(context, {
        message: "Info message",
        level: "info",
      });
      expect(infoResult.success).toBe(true);

      const warningResult = await handleNotifyUser(context, {
        message: "Warning message",
        level: "warning",
      });
      expect(warningResult.success).toBe(true);

      const errorResult = await handleNotifyUser(context, {
        message: "Error message",
        level: "error",
      });
      expect(errorResult.success).toBe(true);
    });

    it("should default to info level", async () => {
      insertTestWorkflow();

      // This should not throw even without level specified
      const result = await handleNotifyUser(context, {
        message: "Default level message",
      });

      expect(result.success).toBe(true);
    });

    it("should record user_notification event for audit trail", async () => {
      insertTestWorkflow();

      await handleNotifyUser(context, {
        message: "Test notification",
        level: "warning",
      });

      const events = getNotificationEvents("wf-test1");
      expect(events).toHaveLength(1);

      const payload = JSON.parse(events[0].payload);
      expect(payload.level).toBe("warning");
      expect(payload.message).toBe("Test notification");
    });
  });
});
