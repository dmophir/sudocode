import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { Express } from "express";
import request from "supertest";
import { createExecutionsRouter } from "../../../src/routes/executions.js";
import type { ExecutionService } from "../../../src/services/execution-service.js";
import type { ExecutionLogsStore } from "../../../src/services/execution-logs-store.js";
import type { Execution } from "@sudocode-ai/types";

// Mock agent registry service
vi.mock("../../../src/services/agent-registry.js", () => {
  const implementedAgents = new Set(["claude-code"]);
  const registeredAgents = new Set(["claude-code", "codex", "copilot", "cursor"]);

  return {
    agentRegistryService: {
      hasAgent: (agentType: string) => {
        return registeredAgents.has(agentType);
      },
      isAgentImplemented: (agentType: string) => {
        return implementedAgents.has(agentType);
      },
      getAvailableAgents: () => [
        { name: "claude-code", displayName: "Claude Code", implemented: true },
        { name: "codex", displayName: "OpenAI Codex", implemented: false },
        { name: "copilot", displayName: "GitHub Copilot", implemented: false },
        { name: "cursor", displayName: "Cursor", implemented: false },
      ],
    },
  };
});

describe("Executions API Routes - Agent Type Validation", () => {
  let app: Express;
  let mockExecutionService: Partial<ExecutionService>;
  let mockLogsStore: Partial<ExecutionLogsStore>;

  beforeEach(() => {
    // Setup mock execution service
    mockExecutionService = {
      createExecution: vi.fn().mockResolvedValue({
        id: "exec-123",
        issue_id: "i-abc",
        agent_type: "claude-code",
        status: "running",
        mode: "worktree",
        prompt: "Test prompt",
        config: "{}",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as Execution),
      getExecution: vi.fn(),
      listExecutions: vi.fn().mockReturnValue([]),
    };

    mockLogsStore = {
      getNormalizedEntries: vi.fn().mockReturnValue([]),
      getLogMetadata: vi.fn().mockReturnValue(null),
    };

    // Setup Express app with executions router
    app = express();
    app.use(express.json());

    // Mock the project middleware by injecting project object
    app.use((req, _res, next) => {
      (req as any).project = {
        executionService: mockExecutionService,
        logsStore: mockLogsStore,
      };
      next();
    });

    app.use("/api", createExecutionsRouter());
  });

  describe("POST /api/issues/:issueId/executions - agentType parameter", () => {
    it("should create execution with agentType='claude-code'", async () => {
      const response = await request(app)
        .post("/api/issues/i-abc/executions")
        .send({
          prompt: "Test prompt",
          agentType: "claude-code",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(mockExecutionService.createExecution).toHaveBeenCalledWith(
        "i-abc",
        {},
        "Test prompt",
        "claude-code"
      );
    });

    it("should create execution without agentType (defaults to claude-code)", async () => {
      const response = await request(app)
        .post("/api/issues/i-abc/executions")
        .send({
          prompt: "Test prompt",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(mockExecutionService.createExecution).toHaveBeenCalledWith(
        "i-abc",
        {},
        "Test prompt",
        undefined // No agentType provided, service will default to 'claude-code'
      );
    });

    it("should return 501 when agentType is not implemented (stub agent)", async () => {
      const response = await request(app)
        .post("/api/issues/i-abc/executions")
        .send({
          prompt: "Test prompt",
          agentType: "codex",
        });

      expect(response.status).toBe(501);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Agent 'codex' is not yet implemented");
      expect(response.body.code).toBe("AGENT_NOT_IMPLEMENTED");
      expect(response.body.details).toBeDefined();
      expect(response.body.details.agentType).toBe("codex");
      expect(response.body.details.message).toContain("not yet fully implemented");
      expect(mockExecutionService.createExecution).not.toHaveBeenCalled();
    });

    it("should return 501 for copilot (another stub agent)", async () => {
      const response = await request(app)
        .post("/api/issues/i-abc/executions")
        .send({
          prompt: "Test prompt",
          agentType: "copilot",
        });

      expect(response.status).toBe(501);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe(
        "Agent 'copilot' is not yet implemented"
      );
      expect(response.body.code).toBe("AGENT_NOT_IMPLEMENTED");
      expect(response.body.details).toBeDefined();
      expect(response.body.details.agentType).toBe("copilot");
      expect(mockExecutionService.createExecution).not.toHaveBeenCalled();
    });

    it("should return 400 when agentType is invalid/not found", async () => {
      const response = await request(app)
        .post("/api/issues/i-abc/executions")
        .send({
          prompt: "Test prompt",
          agentType: "unknown-agent",
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe(
        "Agent 'unknown-agent' not found in registry"
      );
      expect(response.body.code).toBe("AGENT_NOT_FOUND");
      expect(response.body.details).toBeDefined();
      expect(response.body.details.agentType).toBe("unknown-agent");
      expect(response.body.details.availableAgents).toBeDefined();
      expect(Array.isArray(response.body.details.availableAgents)).toBe(true);
      expect(mockExecutionService.createExecution).not.toHaveBeenCalled();
    });

    it("should return 400 when prompt is missing", async () => {
      const response = await request(app)
        .post("/api/issues/i-abc/executions")
        .send({
          agentType: "claude-code",
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Prompt is required");
      expect(mockExecutionService.createExecution).not.toHaveBeenCalled();
    });

    it("should pass config to execution service when provided", async () => {
      const response = await request(app)
        .post("/api/issues/i-abc/executions")
        .send({
          prompt: "Test prompt",
          agentType: "claude-code",
          config: {
            mode: "worktree",
            baseBranch: "develop",
          },
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(mockExecutionService.createExecution).toHaveBeenCalledWith(
        "i-abc",
        {
          mode: "worktree",
          baseBranch: "develop",
        },
        "Test prompt",
        "claude-code"
      );
    });

    it("should be backwards compatible - works without agentType", async () => {
      // This simulates existing API clients that don't know about agentType
      const response = await request(app)
        .post("/api/issues/i-abc/executions")
        .send({
          prompt: "Test prompt",
          config: { mode: "local" },
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      // agentType is undefined, will default to 'claude-code' in service
      expect(mockExecutionService.createExecution).toHaveBeenCalledWith(
        "i-abc",
        { mode: "local" },
        "Test prompt",
        undefined
      );
    });
  });

  describe("GET /api/executions/:executionId", () => {
    it("should return execution by ID", async () => {
      const mockExecution = {
        id: "exec-123",
        issue_id: "i-abc",
        agent_type: "claude-code",
        status: "completed",
      } as Execution;

      mockExecutionService.getExecution = vi.fn().mockReturnValue(mockExecution);

      const response = await request(app).get("/api/executions/exec-123");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockExecution);
    });

    it("should return 404 when execution not found", async () => {
      mockExecutionService.getExecution = vi.fn().mockReturnValue(null);

      const response = await request(app).get("/api/executions/exec-999");

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain("Execution not found");
    });
  });

  describe("Enhanced error responses", () => {
    it("should include helpful error details for AgentNotFoundError", async () => {
      const response = await request(app)
        .post("/api/issues/i-abc/executions")
        .send({
          prompt: "Test prompt",
          agentType: "invalid-agent",
        });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        data: null,
        error: "Agent 'invalid-agent' not found in registry",
        code: "AGENT_NOT_FOUND",
        details: {
          agentType: "invalid-agent",
          availableAgents: expect.any(Array),
        },
      });
    });

    it("should include helpful error details for AgentNotImplementedError", async () => {
      const response = await request(app)
        .post("/api/issues/i-abc/executions")
        .send({
          prompt: "Test prompt",
          agentType: "codex",
        });

      expect(response.status).toBe(501);
      expect(response.body).toMatchObject({
        success: false,
        data: null,
        error: "Agent 'codex' is not yet implemented",
        code: "AGENT_NOT_IMPLEMENTED",
        details: {
          agentType: "codex",
          message: expect.stringContaining("not yet fully implemented"),
        },
      });
    });

    it("should maintain backwards compatibility for non-agent errors", async () => {
      // Simulate a generic error from ExecutionService
      mockExecutionService.createExecution = vi
        .fn()
        .mockRejectedValue(new Error("Database connection failed"));

      const response = await request(app)
        .post("/api/issues/i-abc/executions")
        .send({
          prompt: "Test prompt",
          agentType: "claude-code",
        });

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        success: false,
        data: null,
        error_data: "Database connection failed",
        message: "Failed to create execution",
      });
    });
  });

  describe("GET /api/issues/:issueId/executions", () => {
    it("should list all executions for an issue", async () => {
      const mockExecutions = [
        {
          id: "exec-1",
          issue_id: "i-abc",
          agent_type: "claude-code",
          status: "completed",
        },
        {
          id: "exec-2",
          issue_id: "i-abc",
          agent_type: "claude-code",
          status: "running",
        },
      ] as Execution[];

      mockExecutionService.listExecutions = vi.fn().mockReturnValue(mockExecutions);

      const response = await request(app).get("/api/issues/i-abc/executions");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockExecutions);
      expect(mockExecutionService.listExecutions).toHaveBeenCalledWith("i-abc");
    });
  });
});
