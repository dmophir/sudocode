/**
 * Tests for agent preset integration with execution service
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  loadAgentPreset,
  selectAgentForIssue,
  recordExecutionMetrics,
  validatePreset,
} from "../../../src/services/agent-preset-integration.js";
import Database from "better-sqlite3";
import { initDatabase } from "@sudocode-ai/cli/dist/db.js";
import {
  initializeAgentsDirectory,
  createAgentPreset,
} from "../../../../cli/src/operations/agents.js";
import {
  initializeSelectionConfig,
  addSelectionRule,
} from "../../../../cli/src/operations/agent-selection.js";

describe("Agent Preset Integration", () => {
  let testDir: string;
  let sudocodeDir: string;
  let db: Database.Database;

  beforeEach(() => {
    // Create temporary test directory
    const timestamp = Date.now();
    testDir = path.join("/tmp", `agent-preset-integration-test-${timestamp}`);
    sudocodeDir = path.join(testDir, ".sudocode");
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(sudocodeDir, { recursive: true });

    // Initialize database
    const dbPath = path.join(sudocodeDir, "sudocode.db");
    db = initDatabase({ path: dbPath });

    // Initialize agents directory
    initializeAgentsDirectory(sudocodeDir);

    // Create test preset
    createAgentPreset(sudocodeDir, {
      id: "test-agent",
      name: "Test Agent",
      description: "A test agent",
      agent_type: "claude-code",
      model: "claude-sonnet-4-5",
      system_prompt: "You are a test agent.",
      tools: ["Read", "Write"],
      capabilities: ["testing"],
    });

    // Create test issue
    db.prepare(
      `INSERT INTO issues (id, uuid, title, content, status, priority, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "test-issue-1",
      "uuid-1",
      "Test Issue",
      "Test description",
      "open",
      1,
      new Date().toISOString(),
      new Date().toISOString()
    );

    // Add tag
    db.prepare(
      `INSERT INTO tags (entity_id, entity_uuid, entity_type, tag)
       VALUES (?, ?, ?, ?)`
    ).run("test-issue-1", "uuid-1", "issue", "testing");
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("loadAgentPreset", () => {
    it("should load agent preset successfully", () => {
      const loaded = loadAgentPreset(testDir, "test-agent");

      expect(loaded.preset.id).toBe("test-agent");
      expect(loaded.preset.name).toBe("Test Agent");
      expect(loaded.model).toBe("claude-sonnet-4-5");
      expect(loaded.systemPrompt).toBe("You are a test agent.");
      expect(loaded.tools).toEqual(["Read", "Write"]);
    });

    it("should throw error for non-existent preset", () => {
      expect(() => {
        loadAgentPreset(testDir, "non-existent");
      }).toThrow("Agent preset not found");
    });

    it("should use default model if not specified", () => {
      createAgentPreset(sudocodeDir, {
        id: "no-model-agent",
        name: "No Model Agent",
        description: "Agent without model",
        agent_type: "claude-code",
        system_prompt: "Test",
      });

      const loaded = loadAgentPreset(testDir, "no-model-agent");
      expect(loaded.model).toBe("claude-sonnet-4-5");
    });
  });

  describe("selectAgentForIssue", () => {
    beforeEach(() => {
      // Initialize selection config
      initializeSelectionConfig(sudocodeDir);

      // Add selection rule for testing tag
      addSelectionRule(sudocodeDir, {
        priority: 10,
        conditions: {
          tags: ["testing"],
        },
        agent_id: "test-agent",
        description: "Use test agent for testing issues",
        enabled: true,
      });
    });

    it("should select agent based on issue tags", () => {
      const selection = selectAgentForIssue(testDir, db, "test-issue-1");

      expect(selection.matched).toBe(true);
      expect(selection.agent_id).toBe("test-agent");
      expect(selection.confidence).toBeGreaterThan(0);
    });

    it("should return no match for issue without matching tags", () => {
      // Create issue without testing tag
      db.prepare(
        `INSERT INTO issues (id, uuid, title, content, status, priority, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        "test-issue-2",
        "uuid-2",
        "Another Issue",
        "Description",
        "open",
        1,
        new Date().toISOString(),
        new Date().toISOString()
      );

      const selection = selectAgentForIssue(testDir, db, "test-issue-2");

      expect(selection.matched).toBe(false);
    });

    it("should throw error for non-existent issue", () => {
      expect(() => {
        selectAgentForIssue(testDir, db, "non-existent");
      }).toThrow("Issue non-existent not found");
    });
  });

  describe("recordExecutionMetrics", () => {
    it("should record successful execution metrics", () => {
      const startedAt = new Date().toISOString();
      const completedAt = new Date(Date.now() + 5000).toISOString();

      recordExecutionMetrics(testDir, {
        execution_id: "exec-1",
        agent_id: "test-agent",
        issue_id: "test-issue-1",
        started_at: startedAt,
        completed_at: completedAt,
        duration_ms: 5000,
        status: "success",
      });

      // Read metrics file to verify
      const metricsPath = path.join(sudocodeDir, "agents", "metrics.json");
      expect(fs.existsSync(metricsPath)).toBe(true);

      const metrics = JSON.parse(fs.readFileSync(metricsPath, "utf-8"));
      expect(metrics.agent_metrics["test-agent"]).toBeDefined();
      expect(metrics.agent_metrics["test-agent"].total_executions).toBe(1);
      expect(metrics.agent_metrics["test-agent"].successful_executions).toBe(1);
      expect(metrics.agent_metrics["test-agent"].success_rate).toBe(1);
    });

    it("should record failed execution metrics", () => {
      const startedAt = new Date().toISOString();
      const completedAt = new Date(Date.now() + 3000).toISOString();

      recordExecutionMetrics(testDir, {
        execution_id: "exec-2",
        agent_id: "test-agent",
        issue_id: "test-issue-1",
        started_at: startedAt,
        completed_at: completedAt,
        duration_ms: 3000,
        status: "failure",
        error_message: "Test error",
      });

      const metricsPath = path.join(sudocodeDir, "agents", "metrics.json");
      const metrics = JSON.parse(fs.readFileSync(metricsPath, "utf-8"));

      expect(metrics.agent_metrics["test-agent"].total_executions).toBe(1);
      expect(metrics.agent_metrics["test-agent"].failed_executions).toBe(1);
      expect(metrics.agent_metrics["test-agent"].success_rate).toBe(0);
    });

    it("should aggregate multiple executions", () => {
      // Record multiple executions
      for (let i = 0; i < 5; i++) {
        recordExecutionMetrics(testDir, {
          execution_id: `exec-${i}`,
          agent_id: "test-agent",
          issue_id: "test-issue-1",
          started_at: new Date().toISOString(),
          completed_at: new Date(Date.now() + 1000).toISOString(),
          duration_ms: 1000,
          status: i < 4 ? "success" : "failure", // 4 success, 1 failure
        });
      }

      const metricsPath = path.join(sudocodeDir, "agents", "metrics.json");
      const metrics = JSON.parse(fs.readFileSync(metricsPath, "utf-8"));

      expect(metrics.agent_metrics["test-agent"].total_executions).toBe(5);
      expect(metrics.agent_metrics["test-agent"].successful_executions).toBe(4);
      expect(metrics.agent_metrics["test-agent"].failed_executions).toBe(1);
      expect(metrics.agent_metrics["test-agent"].success_rate).toBe(0.8);
    });
  });

  describe("validatePreset", () => {
    it("should return true for existing preset", () => {
      const valid = validatePreset(testDir, "test-agent");
      expect(valid).toBe(true);
    });

    it("should return false for non-existent preset", () => {
      const valid = validatePreset(testDir, "non-existent");
      expect(valid).toBe(false);
    });
  });
});
