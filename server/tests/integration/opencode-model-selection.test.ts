/**
 * Integration Tests for OpenCode Model Selection
 *
 * Tests the integration between opencodeHandler and executor factory:
 * - processConfig sets OPENCODE_CONFIG_CONTENT correctly for explicit models
 * - processConfig skips OPENCODE_CONFIG_CONTENT for undefined/"default" models
 * - Executor factory passes OPENCODE_CONFIG_CONTENT through to acpConfig.env
 * - Backward compatibility for existing opencode executions
 *
 * @module tests/integration/opencode-model-selection
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import {
  opencodeHandler,
  processAgentConfig,
  type RawAgentConfig,
  type AgentConfigContext,
} from "../../src/execution/executors/agent-config-handlers.js";
import {
  createExecutorForAgent,
  type ExecutorFactoryConfig,
} from "../../src/execution/executors/executor-factory.js";
import { AcpExecutorWrapper } from "../../src/execution/executors/acp-executor-wrapper.js";
import { ExecutionLifecycleService } from "../../src/services/execution-lifecycle.js";
import { ExecutionLogsStore } from "../../src/services/execution-logs-store.js";
import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Mock AgentFactory to avoid side effects while preserving listAgents
vi.mock("acp-factory", async () => {
  const actual = await vi.importActual("acp-factory");
  const RealAgentFactory = (actual as any).AgentFactory;
  return {
    ...actual,
    AgentFactory: {
      register: vi.fn(),
      listAgents: (...args: any[]) => RealAgentFactory.listAgents(...args),
      spawn: vi.fn(),
    },
  };
});

describe("OpenCode Model Selection Integration", () => {
  const defaultContext: AgentConfigContext = {
    isResume: false,
    workDir: "/test/workdir",
  };

  let testDir: string;
  let db: Database.Database;
  let factoryConfig: ExecutorFactoryConfig;

  beforeAll(() => {
    testDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "sudocode-test-opencode-")
    );
    const dbPath = path.join(testDir, "test.db");
    db = new Database(dbPath);

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

    const lifecycleService = new ExecutionLifecycleService(db, testDir);
    const logsStore = new ExecutionLogsStore(db);

    factoryConfig = {
      workDir: testDir,
      lifecycleService,
      logsStore,
      projectId: "test-project",
      db,
    };
  });

  afterAll(() => {
    db.close();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // processConfig tests
  // ===========================================================================
  describe("opencodeHandler.processConfig", () => {
    it("should set OPENCODE_CONFIG_CONTENT when explicit model is selected", () => {
      const rawConfig: RawAgentConfig = {
        model: "opencode-7b",
      };

      const result = opencodeHandler.processConfig(rawConfig, defaultContext);

      expect(result.env).toBeDefined();
      expect(result.env?.OPENCODE_CONFIG_CONTENT).toBeDefined();
      
      // Verify JSON structure
      const configContent = JSON.parse(result.env!.OPENCODE_CONFIG_CONTENT!);
      expect(configContent).toEqual({ model: "opencode-7b" });
    });

    it("should NOT set OPENCODE_CONFIG_CONTENT when model is undefined", () => {
      const rawConfig: RawAgentConfig = {};

      const result = opencodeHandler.processConfig(rawConfig, defaultContext);

      expect(result.env).toBeUndefined();
    });

    it("should NOT set OPENCODE_CONFIG_CONTENT when model is 'default'", () => {
      const rawConfig: RawAgentConfig = {
        model: "default",
      };

      const result = opencodeHandler.processConfig(rawConfig, defaultContext);

      expect(result.env).toBeUndefined();
    });

    it("should NOT set OPENCODE_CONFIG_CONTENT when model is empty string", () => {
      const rawConfig: RawAgentConfig = {
        model: "",
      };

      const result = opencodeHandler.processConfig(rawConfig, defaultContext);

      expect(result.env).toBeUndefined();
    });

    it("should NOT set OPENCODE_CONFIG_CONTENT when nested agentConfig.model is undefined", () => {
      const rawConfig: RawAgentConfig = {
        agentConfig: {},
      };

      const result = opencodeHandler.processConfig(rawConfig, defaultContext);

      expect(result.env).toBeUndefined();
    });

    it("should NOT set OPENCODE_CONFIG_CONTENT when nested agentConfig.model is 'default'", () => {
      const rawConfig: RawAgentConfig = {
        agentConfig: {
          model: "default",
        },
      };

      const result = opencodeHandler.processConfig(rawConfig, defaultContext);

      expect(result.env).toBeUndefined();
    });

    it("should set OPENCODE_CONFIG_CONTENT from nested agentConfig.model when explicit", () => {
      const rawConfig: RawAgentConfig = {
        agentConfig: {
          model: "opencode-14b",
        },
      };

      const result = opencodeHandler.processConfig(rawConfig, defaultContext);

      expect(result.env).toBeDefined();
      expect(result.env?.OPENCODE_CONFIG_CONTENT).toBeDefined();
      
      const configContent = JSON.parse(result.env!.OPENCODE_CONFIG_CONTENT!);
      expect(configContent).toEqual({ model: "opencode-14b" });
    });

    it("should prefer top-level model over nested agentConfig.model", () => {
      const rawConfig: RawAgentConfig = {
        model: "opencode-7b",
        agentConfig: {
          model: "opencode-14b",
        },
      };

      const result = opencodeHandler.processConfig(rawConfig, defaultContext);

      expect(result.env?.OPENCODE_CONFIG_CONTENT).toBeDefined();
      
      const configContent = JSON.parse(result.env!.OPENCODE_CONFIG_CONTENT!);
      expect(configContent).toEqual({ model: "opencode-7b" });
    });

    it("should merge OPENCODE_CONFIG_CONTENT with existing env vars", () => {
      const rawConfig: RawAgentConfig = {
        model: "opencode-7b",
        env: {
          CUSTOM_VAR: "custom-value",
          ANOTHER_VAR: "another-value",
        },
      };

      const result = opencodeHandler.processConfig(rawConfig, defaultContext);

      expect(result.env).toBeDefined();
      expect(result.env?.OPENCODE_CONFIG_CONTENT).toBeDefined();
      expect(result.env?.CUSTOM_VAR).toBe("custom-value");
      expect(result.env?.ANOTHER_VAR).toBe("another-value");
      
      const configContent = JSON.parse(result.env!.OPENCODE_CONFIG_CONTENT!);
      expect(configContent).toEqual({ model: "opencode-7b" });
    });

    it("should merge OPENCODE_CONFIG_CONTENT with nested agentConfig.env", () => {
      const rawConfig: RawAgentConfig = {
        model: "opencode-7b",
        agentConfig: {
          env: {
            NESTED_VAR: "nested-value",
          },
        },
      };

      const result = opencodeHandler.processConfig(rawConfig, defaultContext);

      expect(result.env).toBeDefined();
      expect(result.env?.OPENCODE_CONFIG_CONTENT).toBeDefined();
      expect(result.env?.NESTED_VAR).toBe("nested-value");
    });

    it("should prefer top-level env over nested agentConfig.env", () => {
      const rawConfig: RawAgentConfig = {
        model: "opencode-7b",
        env: {
          TOP_LEVEL_VAR: "top-value",
        },
        agentConfig: {
          env: {
            NESTED_VAR: "nested-value",
          },
        },
      };

      const result = opencodeHandler.processConfig(rawConfig, defaultContext);

      expect(result.env).toBeDefined();
      expect(result.env?.OPENCODE_CONFIG_CONTENT).toBeDefined();
      expect(result.env?.TOP_LEVEL_VAR).toBe("top-value");
      // Current behavior: top-level env takes precedence, nested is ignored
      expect(result.env?.NESTED_VAR).toBeUndefined();
    });

    it("should handle dangerouslySkipPermissions flag", () => {
      const rawConfig: RawAgentConfig = {
        model: "opencode-7b",
        dangerouslySkipPermissions: true,
      };

      const result = opencodeHandler.processConfig(rawConfig, defaultContext);

      expect(result.env?.OPENCODE_CONFIG_CONTENT).toBeDefined();
      expect(result.acpPermissionMode).toBe("auto-approve");
      expect(result.skipPermissions).toBe(true);
    });

    it("should handle session mode", () => {
      const rawConfig: RawAgentConfig = {
        model: "opencode-7b",
        mode: "plan",
      };

      const result = opencodeHandler.processConfig(rawConfig, defaultContext);

      expect(result.env?.OPENCODE_CONFIG_CONTENT).toBeDefined();
      expect(result.sessionMode).toBe("plan");
    });
  });

  // ===========================================================================
  // Executor Factory Integration tests
  // ===========================================================================
  describe("Executor Factory Integration", () => {
    it("should pass OPENCODE_CONFIG_CONTENT to acpConfig.env for explicit model", () => {
      const executor = createExecutorForAgent(
        "opencode",
        { workDir: testDir, model: "opencode-7b" } as any,
        factoryConfig
      );

      expect(executor).toBeInstanceOf(AcpExecutorWrapper);
      const acpConfig = (executor as any).acpConfig;

      expect(acpConfig.env).toBeDefined();
      expect(acpConfig.env.OPENCODE_CONFIG_CONTENT).toBeDefined();
      
      const configContent = JSON.parse(acpConfig.env.OPENCODE_CONFIG_CONTENT);
      expect(configContent).toEqual({ model: "opencode-7b" });
    });

    it("should NOT set OPENCODE_CONFIG_CONTENT in acpConfig.env for undefined model", () => {
      const executor = createExecutorForAgent(
        "opencode",
        { workDir: testDir },
        factoryConfig
      );

      expect(executor).toBeInstanceOf(AcpExecutorWrapper);
      const acpConfig = (executor as any).acpConfig;

      // env should be undefined when no model is specified
      expect(acpConfig.env).toBeUndefined();
    });

    it("should NOT set OPENCODE_CONFIG_CONTENT in acpConfig.env for 'default' model", () => {
      const executor = createExecutorForAgent(
        "opencode",
        { workDir: testDir, model: "default" },
        factoryConfig
      );

      expect(executor).toBeInstanceOf(AcpExecutorWrapper);
      const acpConfig = (executor as any).acpConfig;

      // env should be undefined when model is "default"
      expect(acpConfig.env).toBeUndefined();
    });

    it("should verify correct JSON structure of OPENCODE_CONFIG_CONTENT", () => {
      const executor = createExecutorForAgent(
        "opencode",
        { workDir: testDir, model: "opencode-32b" },
        factoryConfig
      );

      const acpConfig = (executor as any).acpConfig;
      const configContent = JSON.parse(acpConfig.env.OPENCODE_CONFIG_CONTENT);

      // Verify structure has exactly the model property
      expect(Object.keys(configContent)).toEqual(["model"]);
      expect(configContent.model).toBe("opencode-32b");
      
      // Verify it's a valid JSON string
      expect(typeof acpConfig.env.OPENCODE_CONFIG_CONTENT).toBe("string");
    });

    it("should pass OPENCODE_CONFIG_CONTENT alongside other env vars", () => {
      const executor = createExecutorForAgent(
        "opencode",
        { 
          workDir: testDir, 
          model: "opencode-7b",
          env: {
            CUSTOM_ENV_VAR: "custom-value",
          }
        },
        factoryConfig
      );

      const acpConfig = (executor as any).acpConfig;

      expect(acpConfig.env).toBeDefined();
      expect(acpConfig.env.OPENCODE_CONFIG_CONTENT).toBeDefined();
      expect(acpConfig.env.CUSTOM_ENV_VAR).toBe("custom-value");
    });
  });

  // ===========================================================================
  // Backward Compatibility tests
  // ===========================================================================
  describe("Backward Compatibility", () => {
    it("should handle existing opencode executions without model selection", () => {
      // Simulate an existing execution that doesn't specify a model
      const rawConfig: RawAgentConfig = {
        // No model specified - old behavior
      };

      const result = opencodeHandler.processConfig(rawConfig, defaultContext);

      // Should work without errors and not set OPENCODE_CONFIG_CONTENT
      expect(result.acpPermissionMode).toBe("interactive");
      expect(result.env).toBeUndefined();
    });

    it("should handle opencode executions with only env vars (no model)", () => {
      const rawConfig: RawAgentConfig = {
        env: {
          EXISTING_CONFIG: "value",
        },
      };

      const result = opencodeHandler.processConfig(rawConfig, defaultContext);

      // Should preserve existing env vars without adding OPENCODE_CONFIG_CONTENT
      expect(result.env).toBeDefined();
      expect(result.env?.EXISTING_CONFIG).toBe("value");
      expect(result.env?.OPENCODE_CONFIG_CONTENT).toBeUndefined();
    });

    it("should handle nested agentConfig without model", () => {
      const rawConfig: RawAgentConfig = {
        agentConfig: {
          mode: "plan",
          dangerouslySkipPermissions: true,
        },
      };

      const result = opencodeHandler.processConfig(rawConfig, defaultContext);

      expect(result.sessionMode).toBe("plan");
      expect(result.skipPermissions).toBe(true);
      expect(result.env).toBeUndefined();
    });

    it("should handle empty string model (legacy behavior)", () => {
      const rawConfig: RawAgentConfig = {
        model: "",
      };

      const result = opencodeHandler.processConfig(rawConfig, defaultContext);

      // Empty string should be treated like undefined
      expect(result.env).toBeUndefined();
    });

    it("should work with processAgentConfig convenience function", () => {
      const rawConfig: RawAgentConfig = {
        model: "opencode-7b",
      };

      const result = processAgentConfig("opencode", rawConfig, defaultContext);

      expect(result.env?.OPENCODE_CONFIG_CONTENT).toBeDefined();
      const configContent = JSON.parse(result.env!.OPENCODE_CONFIG_CONTENT!);
      expect(configContent).toEqual({ model: "opencode-7b" });
    });

    it("should handle model selection in follow-up executions", () => {
      // Simulate a follow-up execution where model is inherited from parent
      const parentConfig = { model: "default" };
      
      const rawConfig: RawAgentConfig = {
        model: parentConfig.model, // "default" from parent
      };

      const result = opencodeHandler.processConfig(rawConfig, defaultContext);

      // "default" should not set OPENCODE_CONFIG_CONTENT
      expect(result.env).toBeUndefined();
    });

    it("should handle model selection with permissions in follow-up", () => {
      const rawConfig: RawAgentConfig = {
        model: "default",
        dangerouslySkipPermissions: true,
      };

      const result = opencodeHandler.processConfig(rawConfig, defaultContext);

      // Should preserve permissions setting without setting OPENCODE_CONFIG_CONTENT
      expect(result.skipPermissions).toBe(true);
      expect(result.acpPermissionMode).toBe("auto-approve");
      expect(result.env).toBeUndefined();
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================
  describe("Edge Cases", () => {
    it("should handle special characters in model name", () => {
      const rawConfig: RawAgentConfig = {
        model: "opencode/7b-v1.0",
      };

      const result = opencodeHandler.processConfig(rawConfig, defaultContext);

      expect(result.env?.OPENCODE_CONFIG_CONTENT).toBeDefined();
      const configContent = JSON.parse(result.env!.OPENCODE_CONFIG_CONTENT!);
      expect(configContent).toEqual({ model: "opencode/7b-v1.0" });
    });

    it("should handle very long model names", () => {
      const longModelName = "opencode-" + "a".repeat(100);
      const rawConfig: RawAgentConfig = {
        model: longModelName,
      };

      const result = opencodeHandler.processConfig(rawConfig, defaultContext);

      expect(result.env?.OPENCODE_CONFIG_CONTENT).toBeDefined();
      const configContent = JSON.parse(result.env!.OPENCODE_CONFIG_CONTENT!);
      expect(configContent).toEqual({ model: longModelName });
    });

    it("should handle multiple consecutive executions with different models", () => {
      const models = ["opencode-7b", "opencode-14b", "opencode-32b"];
      
      for (const model of models) {
        const rawConfig: RawAgentConfig = { model };
        const result = opencodeHandler.processConfig(rawConfig, defaultContext);
        
        expect(result.env?.OPENCODE_CONFIG_CONTENT).toBeDefined();
        const configContent = JSON.parse(result.env!.OPENCODE_CONFIG_CONTENT!);
        expect(configContent).toEqual({ model });
      }
    });

    it("should handle switching from explicit model to default", () => {
      // First execution with explicit model
      const explicitConfig: RawAgentConfig = { model: "opencode-7b" };
      const explicitResult = opencodeHandler.processConfig(explicitConfig, defaultContext);
      expect(explicitResult.env?.OPENCODE_CONFIG_CONTENT).toBeDefined();

      // Follow-up with default model
      const defaultConfig: RawAgentConfig = { model: "default" };
      const defaultResult = opencodeHandler.processConfig(defaultConfig, defaultContext);
      expect(defaultResult.env).toBeUndefined();
    });
  });
});
