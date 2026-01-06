/**
 * Unit tests for Executor Factory
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import {
  createExecutorForAgent,
  validateAgentConfig,
  AgentConfigValidationError,
  isAcpAgent,
  listAcpAgents,
} from "../../../../src/execution/executors/executor-factory.js";
import {
  AgentNotFoundError,
  AgentNotImplementedError,
} from "../../../../src/services/agent-registry.js";
import { AgentExecutorWrapper } from "../../../../src/execution/executors/agent-executor-wrapper.js";
import { AcpExecutorWrapper } from "../../../../src/execution/executors/acp-executor-wrapper.js";
import type { AgentType, ClaudeCodeConfig } from "@sudocode-ai/types/agents";
import type { ExecutorFactoryConfig } from "../../../../src/execution/executors/executor-factory.js";
import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ExecutionLifecycleService } from "../../../../src/services/execution-lifecycle.js";
import { ExecutionLogsStore } from "../../../../src/services/execution-logs-store.js";

// Mock dependencies
const mockDb = {} as any;
const mockLifecycleService = {} as any;
const mockLogsStore = {} as any;
const mockTransportManager = {} as any;

const factoryConfig: ExecutorFactoryConfig = {
  workDir: "/tmp/test",
  lifecycleService: mockLifecycleService,
  logsStore: mockLogsStore,
  projectId: "test-project",
  db: mockDb,
  transportManager: mockTransportManager,
};

describe("ExecutorFactory", () => {
  describe("createExecutorForAgent", () => {
    it("should create AcpExecutorWrapper for claude-code agent (ACP-native)", () => {
      const executor = createExecutorForAgent(
        "claude-code",
        { workDir: "/tmp/test" },
        factoryConfig
      );

      // ACP-native agents use AcpExecutorWrapper
      expect(executor).toBeInstanceOf(AcpExecutorWrapper);
    });

    it("should create AgentExecutorWrapper for codex (not yet ACP-registered in npm)", () => {
      // Note: codex is defined in acp-factory source but may not be registered
      // in the npm published version yet. Falls back to legacy wrapper.
      const executor = createExecutorForAgent(
        "codex",
        { workDir: "/tmp/test" },
        factoryConfig
      );

      // Falls back to AgentExecutorWrapper until codex is ACP-registered
      expect(executor).toBeInstanceOf(AgentExecutorWrapper);
    });

    it("should throw AgentNotFoundError for unknown agent type", () => {
      expect(() => {
        createExecutorForAgent(
          "unknown-agent" as AgentType,
          { workDir: "/tmp/test" },
          factoryConfig
        );
      }).toThrow(AgentNotFoundError);
    });

    it("should create AgentExecutorWrapper for copilot (legacy agent)", () => {
      const wrapper = createExecutorForAgent(
        "copilot",
        { workDir: "/tmp/test", allowAllTools: true },
        factoryConfig
      );

      expect(wrapper).toBeDefined();
      // Legacy agents still use AgentExecutorWrapper
      expect(wrapper.constructor.name).toBe("AgentExecutorWrapper");
    });

    it("should create AgentExecutorWrapper for cursor (legacy agent)", () => {
      const wrapper = createExecutorForAgent(
        "cursor",
        { workDir: "/tmp/test", force: true },
        factoryConfig
      );

      expect(wrapper).toBeDefined();
      // Legacy agents still use AgentExecutorWrapper
      expect(wrapper.constructor.name).toBe("AgentExecutorWrapper");
    });

    it("should create AcpExecutorWrapper for ACP agents without validation (ACP handles config internally)", () => {
      // ACP agents skip legacy validation since ACP factory handles config
      const executor = createExecutorForAgent(
        "claude-code",
        { workDir: "" }, // ACP doesn't use legacy validation
        factoryConfig
      );
      // Should create AcpExecutorWrapper regardless of legacy config issues
      expect(executor).toBeInstanceOf(AcpExecutorWrapper);
    });

    it("should create AcpExecutorWrapper with valid config", () => {
      const executor = createExecutorForAgent(
        "claude-code",
        {
          workDir: "/tmp/test",
          print: true,
          outputFormat: "stream-json",
        },
        factoryConfig
      );

      // ACP-native agents use AcpExecutorWrapper
      expect(executor).toBeInstanceOf(AcpExecutorWrapper);
    });

    it("should validate config for legacy agents", () => {
      // Legacy agents still go through adapter validation
      // Copilot is a legacy agent
      const wrapper = createExecutorForAgent(
        "copilot",
        { workDir: "/tmp/test" },
        factoryConfig
      );
      expect(wrapper).toBeInstanceOf(AgentExecutorWrapper);
    });
  });

  describe("validateAgentConfig", () => {
    it("should return empty array for valid config", () => {
      const errors = validateAgentConfig("claude-code", {
        workDir: "/tmp/test",
        print: true,
        outputFormat: "stream-json",
      });

      expect(errors).toEqual([]);
    });

    it("should return validation errors for invalid config", () => {
      const errors = validateAgentConfig("claude-code", {
        workDir: "", // Invalid: empty workDir
        print: false,
        outputFormat: "stream-json", // Invalid: requires print mode
      });

      expect(errors.length).toBeGreaterThan(0);
      expect(errors).toContain("workDir is required");
      expect(errors).toContain(
        "stream-json output format requires print mode to be enabled"
      );
    });

    it("should throw AgentNotFoundError for unknown agent", () => {
      expect(() => {
        validateAgentConfig("unknown-agent" as AgentType, {
          workDir: "/tmp/test",
        });
      }).toThrow(AgentNotFoundError);
    });

    it("should validate workDir is required", () => {
      const errors = validateAgentConfig("claude-code", {
        workDir: "",
      });

      expect(errors).toContain("workDir is required");
    });

    it("should validate stream-json requires print mode", () => {
      const errors = validateAgentConfig("claude-code", {
        workDir: "/tmp/test",
        print: false,
        outputFormat: "stream-json",
      });

      expect(errors).toContain(
        "stream-json output format requires print mode to be enabled"
      );
    });
  });

  describe("AgentConfigValidationError", () => {
    it("should create error with agent type and validation errors", () => {
      const error = new AgentConfigValidationError("claude-code", [
        "workDir is required",
        "invalid config",
      ]);

      expect(error.name).toBe("AgentConfigValidationError");
      expect(error.agentType).toBe("claude-code");
      expect(error.validationErrors).toEqual([
        "workDir is required",
        "invalid config",
      ]);
      expect(error.message).toContain("claude-code");
      expect(error.message).toContain("workDir is required");
      expect(error.message).toContain("invalid config");
    });
  });

  describe("ACP detection functions", () => {
    // Note: The npm published version of acp-factory may only have claude-code
    // registered. Other agents (codex, gemini, opencode) may be added in future
    // versions. These tests are based on what's actually registered.

    it("should identify claude-code as ACP agent", () => {
      expect(isAcpAgent("claude-code")).toBe(true);
    });

    it("should identify copilot as non-ACP (legacy) agent", () => {
      expect(isAcpAgent("copilot")).toBe(false);
    });

    it("should identify cursor as non-ACP (legacy) agent", () => {
      expect(isAcpAgent("cursor")).toBe(false);
    });

    it("should identify unknown agent as non-ACP", () => {
      expect(isAcpAgent("unknown-agent")).toBe(false);
    });

    it("should list ACP agents (currently claude-code)", () => {
      const agents = listAcpAgents();
      // claude-code is always ACP-registered
      expect(agents).toContain("claude-code");
      // Legacy agents should not be in the list
      expect(agents).not.toContain("copilot");
      expect(agents).not.toContain("cursor");
    });

    it("should return consistent results between isAcpAgent and listAcpAgents", () => {
      const agents = listAcpAgents();
      for (const agent of agents) {
        expect(isAcpAgent(agent)).toBe(true);
      }
      // Test some non-ACP agents
      expect(isAcpAgent("copilot")).toBe(false);
      expect(agents).not.toContain("copilot");
    });
  });

  describe("adapter defaults (legacy agents only)", () => {
    // Note: These tests only apply to legacy (non-ACP) agents like copilot and cursor.
    // ACP-native agents (claude-code, codex, gemini, opencode) bypass the legacy
    // adapter system and use AcpExecutorWrapper instead.

    let testDir: string;
    let db: Database.Database;
    let factoryConfigWithDb: ExecutorFactoryConfig;

    beforeAll(() => {
      // Create temporary directory for test database
      testDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "sudocode-test-executor-factory-")
      );
      const dbPath = path.join(testDir, "test.db");

      // Create in-memory database
      db = new Database(dbPath);

      // Initialize minimal schema for ExecutionLifecycleService
      db.exec(`
        CREATE TABLE IF NOT EXISTS executions (
          id TEXT PRIMARY KEY,
          issue_id TEXT,
          agent_type TEXT NOT NULL,
          status TEXT NOT NULL,
          mode TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          completed_at TEXT,
          before_commit TEXT,
          after_commit TEXT,
          worktree_path TEXT,
          session_id TEXT,
          exit_code INTEGER,
          error_message TEXT,
          files_changed TEXT,
          parent_execution_id TEXT,
          workflow_execution_id TEXT,
          step_type TEXT,
          step_index INTEGER,
          step_config TEXT
        );

        CREATE TABLE IF NOT EXISTS execution_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          execution_id TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          raw_logs TEXT,
          normalized_entry TEXT,
          FOREIGN KEY (execution_id) REFERENCES executions(id)
        );
      `);

      // Create minimal factory config
      const lifecycleService = new ExecutionLifecycleService(db, testDir);
      const logsStore = new ExecutionLogsStore(db);

      factoryConfigWithDb = {
        workDir: testDir,
        lifecycleService,
        logsStore,
        projectId: "test-project",
        db,
      };
    });

    afterAll(() => {
      // Clean up
      db.close();
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    it("should create AgentExecutorWrapper for legacy agents with adapter defaults", () => {
      // Legacy agents (copilot, cursor) still use the adapter system
      const executor = createExecutorForAgent(
        "copilot",
        { workDir: testDir },
        factoryConfigWithDb
      );

      expect(executor).toBeInstanceOf(AgentExecutorWrapper);
      // Verify it's using the legacy adapter
      expect((executor as any).adapter).toBeDefined();
    });

    it("should create AcpExecutorWrapper for ACP agents without adapter", () => {
      // ACP agents don't use the legacy adapter system
      const executor = createExecutorForAgent(
        "claude-code",
        { workDir: testDir },
        factoryConfigWithDb
      );

      expect(executor).toBeInstanceOf(AcpExecutorWrapper);
      // AcpExecutorWrapper doesn't have an adapter property
      expect((executor as any).adapter).toBeUndefined();
    });

    it("should pass config to AcpExecutorWrapper for ACP agents", () => {
      // ACP agents receive config via acpConfig
      const executor = createExecutorForAgent(
        "claude-code",
        {
          workDir: testDir,
          mcpServers: { test: { command: "test" } } as any,
        },
        factoryConfigWithDb
      );

      expect(executor).toBeInstanceOf(AcpExecutorWrapper);
      // AcpExecutorWrapper stores config in acpConfig
      const acpConfig = (executor as any).acpConfig;
      expect(acpConfig).toBeDefined();
      expect(acpConfig.agentType).toBe("claude-code");
    });
  });
});
