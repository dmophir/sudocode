/**
 * Integration Tests for Multi-Agent Support - Phase 1
 *
 * Tests the complete execution stack with the new agent registry pattern:
 * - Agent registry initialization and lookup
 * - Executor factory and wrapper creation
 * - ExecutionService with multi-agent support
 * - End-to-end execution flow with mocked agent executors
 *
 * Note: This test suite mocks the ClaudeExecutorWrapper to prevent actual
 * Claude process spawning. Real end-to-end tests with actual Claude execution
 * should be in separate E2E test files that are run explicitly.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterEach,
  afterAll,
  vi,
} from "vitest";
import Database from "better-sqlite3";
import { initDatabase as initCliDatabase } from "@sudocode-ai/cli/dist/db.js";
import {
  EXECUTIONS_TABLE,
  EXECUTIONS_INDEXES,
  PROMPT_TEMPLATES_TABLE,
  PROMPT_TEMPLATES_INDEXES,
} from "@sudocode-ai/types/schema";
import { runMigrations } from "@sudocode-ai/types/migrations";
import { initializeDefaultTemplates } from "../../src/services/prompt-templates.js";
import {
  generateIssueId,
  generateSpecId,
} from "@sudocode-ai/cli/dist/id-generator.js";
import {
  createIssue,
  createSpec,
  addRelationship,
} from "@sudocode-ai/cli/dist/operations/index.js";
import { agentRegistryService } from "../../src/services/agent-registry.js";
import {
  createExecutorForAgent,
  validateAgentConfig,
} from "../../src/execution/executors/executor-factory.js";
import { ExecutionService } from "../../src/services/execution-service.js";
import { ExecutionLifecycleService } from "../../src/services/execution-lifecycle.js";
import type { IWorktreeManager } from "../../src/execution/worktree/manager.js";
import type {
  WorktreeCreateParams,
  WorktreeInfo,
} from "../../src/execution/worktree/types.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Mock WebSocket module
vi.mock("../../src/services/websocket.js", () => ({
  broadcastExecutionUpdate: vi.fn(),
}));

// Mock ClaudeExecutorWrapper to prevent actual Claude process spawning
vi.mock("../../src/execution/executors/claude-executor-wrapper.js", () => {
  return {
    ClaudeExecutorWrapper: class ClaudeExecutorWrapper {
      private config: any;

      constructor(config: any) {
        // Store config for inspection if needed
        this.config = config;
      }

      async executeWithLifecycle(
        executionId: string,
        task: any,
        workDir: string
      ): Promise<void> {
        // Don't actually spawn Claude - just resolve immediately
        // The ExecutionService already created the execution with status 'running'
        // We simulate successful execution by just resolving
        return Promise.resolve();
      }

      async resumeWithLifecycle(
        executionId: string,
        sessionId: string,
        task: any,
        workDir: string
      ): Promise<void> {
        // Don't actually spawn Claude - just resolve immediately
        // Simulates resuming an existing session
        return Promise.resolve();
      }

      async cancelExecution(executionId: string): Promise<void> {
        // Mock cancel - do nothing
        return Promise.resolve();
      }

      destroy(): void {
        // Mock destroy - do nothing
      }
    },
  };
});

describe("Multi-Agent Support - Phase 1 Integration", () => {
  let db: Database.Database;
  let testDbPath: string;
  let testDir: string;
  let testIssueId: string;
  let testSpecId: string;
  let executionService: ExecutionService;

  beforeAll(() => {
    // Create temporary directory
    testDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "sudocode-multi-agent-test-")
    );
    testDbPath = path.join(testDir, "cache.db");
    process.env.SUDOCODE_DIR = testDir;

    // Create config for ID generation
    const configPath = path.join(testDir, "config.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        version: "1.0.0",
        id_prefix: { spec: "SPEC", issue: "ISSUE" },
      })
    );

    // Initialize database with schema and migrations
    db = initCliDatabase({ path: testDbPath });
    db.exec(EXECUTIONS_TABLE);
    db.exec(EXECUTIONS_INDEXES);
    db.exec(PROMPT_TEMPLATES_TABLE);
    db.exec(PROMPT_TEMPLATES_INDEXES);
    runMigrations(db);
    initializeDefaultTemplates(db);

    // Create test issue and spec
    const { id: issueId, uuid: issueUuid } = generateIssueId(db, testDir);
    testIssueId = issueId;
    createIssue(db, {
      id: issueId,
      uuid: issueUuid,
      title: "Test multi-agent execution",
      content: "Integration test for multi-agent support",
    });

    const { id: specId, uuid: specUuid } = generateSpecId(db, testDir);
    testSpecId = specId;
    createSpec(db, {
      id: specId,
      uuid: specUuid,
      title: "Multi-agent spec",
      content: "Test specification",
      file_path: path.join(testDir, "specs", "test.md"),
    });

    addRelationship(db, {
      from_id: testIssueId,
      from_type: "issue",
      to_id: testSpecId,
      to_type: "spec",
      relationship_type: "implements",
    });

    // Create mock worktree manager
    const mockWorktreeManager = createMockWorktreeManager();
    const lifecycleService = new ExecutionLifecycleService(
      db,
      testDir,
      mockWorktreeManager
    );

    // Create execution service
    executionService = new ExecutionService(
      db,
      "test-project",
      testDir,
      lifecycleService
    );
  });

  afterEach(() => {
    // Cleanup: cancel any running executions to prevent conflicts between tests
    const runningExecutions = db
      .prepare("SELECT id FROM executions WHERE status = ?")
      .all("running") as Array<{ id: string }>;

    for (const execution of runningExecutions) {
      try {
        executionService.cancelExecution(execution.id);
      } catch (error) {
        // Ignore errors during cleanup
      }
    }

    // Also update any remaining running executions to cancelled state
    db.prepare(
      "UPDATE executions SET status = ?, updated_at = ? WHERE status = ?"
    ).run("cancelled", new Date().toISOString(), "running");
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    delete process.env.SUDOCODE_DIR;
  });

  describe("Agent Registry", () => {
    it("should initialize with all 4 agents registered", () => {
      const claudeAdapter = agentRegistryService.getAdapter("claude-code");
      expect(claudeAdapter).toBeDefined();
      expect(claudeAdapter.metadata.name).toBe("claude-code");

      const codexAdapter = agentRegistryService.getAdapter("codex");
      expect(codexAdapter).toBeDefined();
      expect(codexAdapter.metadata.name).toBe("codex");

      const copilotAdapter = agentRegistryService.getAdapter("copilot");
      expect(copilotAdapter).toBeDefined();
      expect(copilotAdapter.metadata.name).toBe("copilot");

      const cursorAdapter = agentRegistryService.getAdapter("cursor");
      expect(cursorAdapter).toBeDefined();
      expect(cursorAdapter.metadata.name).toBe("cursor");
    });

    it("should provide metadata for all agents", () => {
      const agents = agentRegistryService.getAvailableAgents();
      expect(agents).toHaveLength(4);

      const agentNames = agents.map((a) => a.name);
      expect(agentNames).toContain("claude-code");
      expect(agentNames).toContain("codex");
      expect(agentNames).toContain("copilot");
      expect(agentNames).toContain("cursor");
    });

    it("should identify Claude Code as implemented", () => {
      expect(agentRegistryService.isAgentImplemented("claude-code")).toBe(true);
    });

    it("should identify stub agents as not implemented", () => {
      expect(agentRegistryService.isAgentImplemented("codex")).toBe(false);
      expect(agentRegistryService.isAgentImplemented("copilot")).toBe(false);
      expect(agentRegistryService.isAgentImplemented("cursor")).toBe(false);
    });

    it("should throw for unknown agent types", () => {
      expect(() => {
        agentRegistryService.getAdapter("unknown-agent" as any);
      }).toThrow(/Agent 'unknown-agent' not found/);
    });
  });

  describe("Executor Factory", () => {
    it("should create ClaudeExecutorWrapper for claude-code", () => {
      const wrapper = createExecutorForAgent(
        "claude-code",
        { workDir: testDir },
        {
          workDir: testDir,
          lifecycleService: executionService["lifecycleService"],
          logsStore: executionService["logsStore"],
          projectId: "test-project",
          db,
        }
      );

      expect(wrapper).toBeDefined();
      expect(wrapper.constructor.name).toBe("ClaudeExecutorWrapper");
    });

    it("should create AgentExecutorWrapper for other agents", () => {
      // For stub agents, factory should create wrapper but throw when executing
      expect(() => {
        createExecutorForAgent(
          "codex",
          { workDir: testDir },
          {
            workDir: testDir,
            lifecycleService: executionService["lifecycleService"],
            logsStore: executionService["logsStore"],
            projectId: "test-project",
            db,
          }
        );
      }).toThrow(/Agent 'codex' is not yet implemented/);
    });

    it("should validate agent configuration", () => {
      // Valid config
      const validErrors = validateAgentConfig("claude-code", {
        workDir: testDir,
        print: true,
        outputFormat: "stream-json",
      });
      expect(validErrors).toEqual([]);

      // Invalid config
      const invalidErrors = validateAgentConfig("claude-code", {
        workDir: "",
        print: false,
        outputFormat: "stream-json",
      });
      expect(invalidErrors.length).toBeGreaterThan(0);
      expect(invalidErrors).toContain("workDir is required");
    });

    it("should throw for invalid configuration", () => {
      expect(() => {
        createExecutorForAgent(
          "claude-code",
          { workDir: "" },
          {
            workDir: testDir,
            lifecycleService: executionService["lifecycleService"],
            logsStore: executionService["logsStore"],
            projectId: "test-project",
            db,
          }
        );
      }).toThrow(/configuration validation failed/);
    });
  });

  describe("ExecutionService Multi-Agent Integration", () => {
    it("should create execution with default claude-code agent", async () => {
      const prepareResult =
        await executionService.prepareExecution(testIssueId);

      // Create without specifying agentType
      const execution = await executionService.createExecution(
        testIssueId,
        prepareResult.defaultConfig,
        prepareResult.renderedPrompt
      );

      expect(execution).toBeDefined();
      expect(execution.agent_type).toBe("claude-code");
      expect(execution.issue_id).toBe(testIssueId);
    });

    it("should create execution with explicit agent type", async () => {
      const prepareResult =
        await executionService.prepareExecution(testIssueId);

      const execution = await executionService.createExecution(
        testIssueId,
        prepareResult.defaultConfig,
        prepareResult.renderedPrompt,
        "claude-code"
      );

      expect(execution).toBeDefined();
      expect(execution.agent_type).toBe("claude-code");
    });

    it("should fail gracefully for unimplemented agents", async () => {
      const prepareResult =
        await executionService.prepareExecution(testIssueId);

      await expect(
        executionService.createExecution(
          testIssueId,
          prepareResult.defaultConfig,
          prepareResult.renderedPrompt,
          "codex"
        )
      ).rejects.toThrow(/Agent 'codex' is not yet implemented/);
    });

    it("should persist agent_type to database", async () => {
      const prepareResult =
        await executionService.prepareExecution(testIssueId);

      const execution = await executionService.createExecution(
        testIssueId,
        prepareResult.defaultConfig,
        prepareResult.renderedPrompt,
        "claude-code"
      );

      // Query database directly
      const dbExecution = db
        .prepare("SELECT agent_type FROM executions WHERE id = ?")
        .get(execution.id) as { agent_type: string };

      expect(dbExecution.agent_type).toBe("claude-code");
    });

    it("should handle NULL agent_type in database gracefully", async () => {
      const prepareResult =
        await executionService.prepareExecution(testIssueId);

      // Create execution
      const execution = await executionService.createExecution(
        testIssueId,
        prepareResult.defaultConfig,
        prepareResult.renderedPrompt
      );

      // Manually set agent_type to NULL in database
      db.prepare("UPDATE executions SET agent_type = NULL WHERE id = ?").run(
        execution.id
      );

      // createFollowUp should handle NULL by defaulting to claude-code
      const followUp = await executionService.createFollowUp(
        execution.id,
        "Test follow-up"
      );

      expect(followUp.agent_type).toBe("claude-code");
    });
  });

  describe("Database Migration Integration", () => {
    it("should have applied migration v3 successfully", () => {
      const migrations = db
        .prepare("SELECT * FROM migrations ORDER BY version")
        .all() as Array<{ version: number; name: string }>;

      expect(migrations.length).toBeGreaterThanOrEqual(3);

      const migration3 = migrations.find((m) => m.version === 3);
      expect(migration3).toBeDefined();
      expect(migration3?.name).toBe("remove-agent-type-constraints");
    });

    it("should allow any agent_type value in database", () => {
      // Should be able to insert custom agent types
      expect(() => {
        db.exec("PRAGMA foreign_keys = OFF");
        db.prepare(
          `
          INSERT INTO executions (
            id, target_branch, branch_name, status, agent_type
          ) VALUES (?, ?, ?, ?, ?)
        `
        ).run(
          "test-exec-1",
          "main",
          "test-branch",
          "completed",
          "custom-agent"
        );
        db.exec("PRAGMA foreign_keys = ON");
      }).not.toThrow();

      const execution = db
        .prepare("SELECT agent_type FROM executions WHERE id = ?")
        .get("test-exec-1") as { agent_type: string };

      expect(execution.agent_type).toBe("custom-agent");
    });

    it("should allow NULL agent_type in database", () => {
      expect(() => {
        db.exec("PRAGMA foreign_keys = OFF");
        db.prepare(
          `
          INSERT INTO executions (
            id, target_branch, branch_name, status, agent_type
          ) VALUES (?, ?, ?, ?, ?)
        `
        ).run("test-exec-2", "main", "test-branch", "completed", null);
        db.exec("PRAGMA foreign_keys = ON");
      }).not.toThrow();

      const execution = db
        .prepare("SELECT agent_type FROM executions WHERE id = ?")
        .get("test-exec-2") as { agent_type: string | null };

      expect(execution.agent_type).toBeNull();
    });
  });

  describe("Regression Testing - Claude Code Functionality", () => {
    it("should create Claude Code execution without breaking changes", async () => {
      const prepareResult =
        await executionService.prepareExecution(testIssueId);

      const execution = await executionService.createExecution(
        testIssueId,
        prepareResult.defaultConfig,
        prepareResult.renderedPrompt
      );

      expect(execution).toBeDefined();
      expect(execution.id).toBeTruthy();
      expect(execution.issue_id).toBe(testIssueId);
      expect(execution.agent_type).toBe("claude-code");
      expect(execution.status).toBe("running");
      expect(execution.worktree_path).toBeTruthy();
      expect(execution.branch_name).toBeTruthy();
    });

    it("should list executions correctly", async () => {
      // Create an execution to ensure we have data
      const prepareResult =
        await executionService.prepareExecution(testIssueId);
      const newExecution = await executionService.createExecution(
        testIssueId,
        prepareResult.defaultConfig,
        prepareResult.renderedPrompt
      );

      const executions = executionService.listExecutions(testIssueId);
      expect(executions.length).toBeGreaterThan(0);

      // All executions should have agent_type
      // Check the execution we just created specifically
      const createdExec = executions.find((e) => e.id === newExecution.id);
      expect(createdExec).toBeDefined();
      expect(createdExec!.agent_type).toBeTruthy();
      expect(createdExec!.agent_type).toBe("claude-code");
    });

    it("should prepare execution with template rendering", async () => {
      const result = await executionService.prepareExecution(testIssueId);

      expect(result.renderedPrompt).toBeTruthy();
      expect(result.issue).toBeDefined();
      expect(result.issue.id).toBe(testIssueId);
      expect(result.relatedSpecs).toHaveLength(1);
      expect(result.relatedSpecs[0].id).toBe(testSpecId);
      expect(result.defaultConfig).toBeDefined();
      expect(result.defaultConfig.mode).toBe("worktree");
    });
  });
});

/**
 * Create mock worktree manager for testing
 */
function createMockWorktreeManager(): IWorktreeManager {
  return {
    getConfig: () => ({
      worktreeStoragePath: ".worktrees",
      branchPrefix: "worktree",
      autoCreateBranches: true,
      autoDeleteBranches: false,
      enableSparseCheckout: false,
      cleanupOrphanedWorktreesOnStartup: false,
    }),

    createWorktree: async (_params: WorktreeCreateParams): Promise<void> => {
      return Promise.resolve();
    },

    cleanupWorktree: async (
      _worktreePath: string,
      _repoPath: string
    ): Promise<void> => {
      return Promise.resolve();
    },

    listWorktrees: async (_repoPath: string): Promise<WorktreeInfo[]> => {
      return Promise.resolve([]);
    },

    isValidRepo: async (_repoPath: string): Promise<boolean> => {
      return Promise.resolve(true);
    },

    listBranches: async (_repoPath: string): Promise<string[]> => {
      return Promise.resolve(["main", "develop"]);
    },

    ensureWorktreeExists: async (
      _repoPath: string,
      _branchName: string,
      _worktreePath: string
    ): Promise<void> => {
      return Promise.resolve();
    },

    isWorktreeValid: async (
      _repoPath: string,
      _worktreePath: string
    ): Promise<boolean> => {
      return Promise.resolve(true);
    },
  };
}
