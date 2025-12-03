import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { Express } from "express";
import request from "supertest";
import { createWorkflowsRouter } from "../../../src/routes/workflows.js";
import type { Workflow, WorkflowStep } from "@sudocode-ai/types";
import type { IWorkflowEngine } from "../../../src/workflow/workflow-engine.js";
import {
  WorkflowNotFoundError,
  WorkflowStepNotFoundError,
  WorkflowStateError,
  WorkflowCycleError,
} from "../../../src/workflow/workflow-engine.js";

// Mock the websocket module
vi.mock("../../../src/services/websocket.js", () => ({
  broadcastWorkflowUpdate: vi.fn(),
  broadcastWorkflowStepUpdate: vi.fn(),
}));

describe("Workflow Routes", () => {
  let app: Express;
  let mockEngine: Partial<IWorkflowEngine>;
  let mockDb: any;

  const mockWorkflow: Workflow = {
    id: "wf-123",
    title: "Test Workflow",
    source: { type: "issues", issueIds: ["i-1", "i-2"] },
    status: "pending",
    steps: [
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
    ],
    baseBranch: "main",
    currentStepIndex: 0,
    config: {
      parallelism: "sequential",
      onFailure: "pause",
      autoCommitAfterStep: true,
      defaultAgentType: "claude-code",
      autonomyLevel: "human_in_the_loop",
    },
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock workflow engine
    mockEngine = {
      createWorkflow: vi.fn().mockResolvedValue(mockWorkflow),
      startWorkflow: vi.fn().mockResolvedValue(undefined),
      pauseWorkflow: vi.fn().mockResolvedValue(undefined),
      resumeWorkflow: vi.fn().mockResolvedValue(undefined),
      cancelWorkflow: vi.fn().mockResolvedValue(undefined),
      retryStep: vi.fn().mockResolvedValue(undefined),
      skipStep: vi.fn().mockResolvedValue(undefined),
      getWorkflow: vi.fn().mockResolvedValue(mockWorkflow),
      getReadySteps: vi.fn().mockResolvedValue([]),
      onWorkflowEvent: vi.fn().mockReturnValue(() => {}),
    };

    // Setup mock database
    mockDb = {
      prepare: vi.fn().mockReturnValue({
        all: vi.fn().mockReturnValue([]),
        run: vi.fn(),
      }),
    };

    // Setup Express app
    app = express();
    app.use(express.json());

    // Mock project middleware
    app.use((req, _res, next) => {
      (req as any).project = {
        id: "project-123",
        workflowEngine: mockEngine,
        db: mockDb,
      };
      next();
    });

    app.use("/api/workflows", createWorkflowsRouter());
  });

  describe("GET /api/workflows", () => {
    it("should list workflows with default pagination", async () => {
      const workflowRow = {
        id: "wf-123",
        title: "Test Workflow",
        source: JSON.stringify({ type: "issues", issueIds: ["i-1"] }),
        status: "pending",
        steps: JSON.stringify([]),
        worktree_path: null,
        branch_name: null,
        base_branch: "main",
        current_step_index: 0,
        config: JSON.stringify(mockWorkflow.config),
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      mockDb.prepare.mockReturnValue({
        all: vi.fn().mockReturnValue([workflowRow]),
      });

      const response = await request(app).get("/api/workflows");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });

    it("should filter by status", async () => {
      mockDb.prepare.mockReturnValue({
        all: vi.fn().mockReturnValue([]),
      });

      await request(app).get("/api/workflows?status=running");

      expect(mockDb.prepare).toHaveBeenCalled();
      const prepareCall = mockDb.prepare.mock.calls[0][0];
      expect(prepareCall).toContain("status IN");
    });

    it("should return 503 when engine not available", async () => {
      app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        (req as any).project = {
          id: "project-123",
          workflowEngine: undefined,
          db: mockDb,
        };
        next();
      });
      app.use("/api/workflows", createWorkflowsRouter());

      const response = await request(app).get("/api/workflows");

      expect(response.status).toBe(503);
      expect(response.body.success).toBe(false);
    });
  });

  describe("POST /api/workflows", () => {
    it("should create workflow from issues source", async () => {
      const response = await request(app)
        .post("/api/workflows")
        .send({
          source: { type: "issues", issueIds: ["i-1", "i-2"] },
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe("wf-123");
      expect(mockEngine.createWorkflow).toHaveBeenCalledWith(
        { type: "issues", issueIds: ["i-1", "i-2"] },
        undefined
      );
    });

    it("should create workflow from spec source", async () => {
      const response = await request(app)
        .post("/api/workflows")
        .send({
          source: { type: "spec", specId: "s-abc" },
        });

      expect(response.status).toBe(201);
      expect(mockEngine.createWorkflow).toHaveBeenCalledWith(
        { type: "spec", specId: "s-abc" },
        undefined
      );
    });

    it("should return 400 for missing source", async () => {
      const response = await request(app)
        .post("/api/workflows")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain("source is required");
    });

    it("should return 400 for invalid source type", async () => {
      const response = await request(app)
        .post("/api/workflows")
        .send({
          source: { type: "invalid" },
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain("Invalid source type");
    });

    it("should return 400 for cycle detection", async () => {
      (mockEngine.createWorkflow as any).mockRejectedValue(
        new WorkflowCycleError([["i-1", "i-2", "i-1"]])
      );

      const response = await request(app)
        .post("/api/workflows")
        .send({
          source: { type: "issues", issueIds: ["i-1", "i-2"] },
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.cycles).toBeDefined();
    });
  });

  describe("GET /api/workflows/:id", () => {
    it("should return workflow by id", async () => {
      const response = await request(app).get("/api/workflows/wf-123");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe("wf-123");
    });

    it("should return 404 for non-existent workflow", async () => {
      (mockEngine.getWorkflow as any).mockResolvedValue(null);

      const response = await request(app).get("/api/workflows/wf-unknown");

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe("DELETE /api/workflows/:id", () => {
    it("should delete workflow", async () => {
      const response = await request(app).delete("/api/workflows/wf-123");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.deleted).toBe(true);
    });

    it("should return 404 for non-existent workflow", async () => {
      (mockEngine.getWorkflow as any).mockResolvedValue(null);

      const response = await request(app).delete("/api/workflows/wf-unknown");

      expect(response.status).toBe(404);
    });
  });

  describe("POST /api/workflows/:id/start", () => {
    it("should start pending workflow", async () => {
      const response = await request(app).post("/api/workflows/wf-123/start");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockEngine.startWorkflow).toHaveBeenCalledWith("wf-123");
    });

    it("should return 400 for non-pending workflow", async () => {
      (mockEngine.startWorkflow as any).mockRejectedValue(
        new WorkflowStateError("wf-123", "running", "start")
      );

      const response = await request(app).post("/api/workflows/wf-123/start");

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it("should return 404 for non-existent workflow", async () => {
      (mockEngine.startWorkflow as any).mockRejectedValue(
        new WorkflowNotFoundError("wf-unknown")
      );

      const response = await request(app).post("/api/workflows/wf-unknown/start");

      expect(response.status).toBe(404);
    });
  });

  describe("POST /api/workflows/:id/pause", () => {
    it("should pause running workflow", async () => {
      const response = await request(app).post("/api/workflows/wf-123/pause");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockEngine.pauseWorkflow).toHaveBeenCalledWith("wf-123");
    });

    it("should return 400 for non-running workflow", async () => {
      (mockEngine.pauseWorkflow as any).mockRejectedValue(
        new WorkflowStateError("wf-123", "pending", "pause")
      );

      const response = await request(app).post("/api/workflows/wf-123/pause");

      expect(response.status).toBe(400);
    });
  });

  describe("POST /api/workflows/:id/resume", () => {
    it("should resume paused workflow", async () => {
      const response = await request(app).post("/api/workflows/wf-123/resume");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockEngine.resumeWorkflow).toHaveBeenCalledWith("wf-123");
    });

    it("should return 400 for non-paused workflow", async () => {
      (mockEngine.resumeWorkflow as any).mockRejectedValue(
        new WorkflowStateError("wf-123", "running", "resume")
      );

      const response = await request(app).post("/api/workflows/wf-123/resume");

      expect(response.status).toBe(400);
    });
  });

  describe("POST /api/workflows/:id/cancel", () => {
    it("should cancel workflow", async () => {
      const response = await request(app).post("/api/workflows/wf-123/cancel");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockEngine.cancelWorkflow).toHaveBeenCalledWith("wf-123");
    });

    it("should return 400 for terminal state workflow", async () => {
      (mockEngine.cancelWorkflow as any).mockRejectedValue(
        new WorkflowStateError("wf-123", "completed", "cancel")
      );

      const response = await request(app).post("/api/workflows/wf-123/cancel");

      expect(response.status).toBe(400);
    });
  });

  describe("POST /api/workflows/:id/steps/:stepId/retry", () => {
    it("should retry failed step", async () => {
      const response = await request(app).post(
        "/api/workflows/wf-123/steps/step-1/retry"
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockEngine.retryStep).toHaveBeenCalledWith("wf-123", "step-1");
    });

    it("should return 404 for non-existent step", async () => {
      (mockEngine.retryStep as any).mockRejectedValue(
        new WorkflowStepNotFoundError("wf-123", "step-unknown")
      );

      const response = await request(app).post(
        "/api/workflows/wf-123/steps/step-unknown/retry"
      );

      expect(response.status).toBe(404);
    });
  });

  describe("POST /api/workflows/:id/steps/:stepId/skip", () => {
    it("should skip step with reason", async () => {
      const response = await request(app)
        .post("/api/workflows/wf-123/steps/step-1/skip")
        .send({ reason: "Not needed" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockEngine.skipStep).toHaveBeenCalledWith(
        "wf-123",
        "step-1",
        "Not needed"
      );
    });

    it("should skip step without reason", async () => {
      const response = await request(app).post(
        "/api/workflows/wf-123/steps/step-1/skip"
      );

      expect(response.status).toBe(200);
      expect(mockEngine.skipStep).toHaveBeenCalledWith(
        "wf-123",
        "step-1",
        undefined
      );
    });
  });

  describe("GET /api/workflows/:id/events", () => {
    it("should return workflow events", async () => {
      const eventRow = {
        id: "evt-1",
        workflow_id: "wf-123",
        type: "workflow_started",
        step_id: null,
        execution_id: null,
        payload: JSON.stringify({}),
        created_at: "2024-01-01T00:00:00Z",
        processed_at: null,
      };

      mockDb.prepare.mockReturnValue({
        all: vi.fn().mockReturnValue([eventRow]),
      });

      const response = await request(app).get("/api/workflows/wf-123/events");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].type).toBe("workflow_started");
    });

    it("should return 404 for non-existent workflow", async () => {
      (mockEngine.getWorkflow as any).mockResolvedValue(null);

      const response = await request(app).get("/api/workflows/wf-unknown/events");

      expect(response.status).toBe(404);
    });
  });
});
