/**
 * Tests for A2A (Agent-to-Agent) protocol support
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  generateAgentCard,
  exportAgentCard,
  exportAllAgentCards,
  createAgentRegistry,
  enableA2ASupport,
  handleA2ARequest,
  type A2AAgentCard,
  type A2ARequest,
} from "../../src/operations/a2a.js";
import {
  initializeAgentsDirectory,
  createAgentPreset,
} from "../../src/operations/agents.js";

describe("A2A Protocol Support", () => {
  let testDir: string;
  let sudocodeDir: string;

  beforeEach(() => {
    // Create temporary test directory
    const timestamp = Date.now();
    testDir = path.join("/tmp", `a2a-test-${timestamp}`);
    sudocodeDir = path.join(testDir, ".sudocode");
    fs.mkdirSync(testDir, { recursive: true });
    initializeAgentsDirectory(sudocodeDir);

    // Create test presets
    createAgentPreset(sudocodeDir, {
      id: "test-reviewer",
      name: "Test Reviewer",
      description: "A test code reviewer agent",
      agent_type: "claude-code",
      model: "claude-sonnet-4-5",
      system_prompt: "You review code.",
      capabilities: ["code-review", "static-analysis"],
      tools: ["Read", "Grep", "Glob"],
    });
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("generateAgentCard", () => {
    it("should generate valid agent card", () => {
      const preset = createAgentPreset(sudocodeDir, {
        id: "test-agent",
        name: "Test Agent",
        description: "A test agent",
        agent_type: "claude-code",
        system_prompt: "Test prompt",
        capabilities: ["testing", "analysis"],
      });

      const card = generateAgentCard(preset, "https://example.com/agents/test-agent");

      expect(card.name).toBe("Test Agent");
      expect(card.description).toBe("A test agent");
      expect(card.serviceEndpoint).toBe("https://example.com/agents/test-agent");
      expect(card.protocolVersion).toBe("0.2.5");
      expect(card.skills.length).toBeGreaterThan(0);
    });

    it("should include capabilities as skills", () => {
      const preset = createAgentPreset(sudocodeDir, {
        id: "multi-skill",
        name: "Multi Skill Agent",
        description: "Agent with multiple skills",
        agent_type: "claude-code",
        system_prompt: "Test",
        capabilities: ["code-review", "testing", "refactoring"],
      });

      const card = generateAgentCard(preset, "https://example.com/agents/multi-skill");

      const skillIds = card.skills.map((s) => s.id);
      expect(skillIds).toContain("code-review");
      expect(skillIds).toContain("testing");
      expect(skillIds).toContain("refactoring");
    });

    it("should include execute-task skill", () => {
      const preset = createAgentPreset(sudocodeDir, {
        id: "executor",
        name: "Executor",
        description: "Executes tasks",
        agent_type: "claude-code",
        system_prompt: "Execute",
      });

      const card = generateAgentCard(preset, "https://example.com/agents/executor");

      const executeSkill = card.skills.find((s) => s.id === "execute-task");
      expect(executeSkill).toBeDefined();
      expect(executeSkill?.inputSchema).toBeDefined();
      expect(executeSkill?.outputSchema).toBeDefined();
    });

    it("should support custom provider", () => {
      const preset = createAgentPreset(sudocodeDir, {
        id: "custom",
        name: "Custom",
        description: "Custom agent",
        agent_type: "custom",
        system_prompt: "Custom",
      });

      const card = generateAgentCard(preset, "https://example.com/agents/custom", {
        provider: {
          name: "Custom Provider",
          url: "https://custom.com",
        },
      });

      expect(card.provider?.name).toBe("Custom Provider");
      expect(card.provider?.url).toBe("https://custom.com");
    });

    it("should support custom authentication", () => {
      const preset = createAgentPreset(sudocodeDir, {
        id: "secure",
        name: "Secure",
        description: "Secure agent",
        agent_type: "claude-code",
        system_prompt: "Secure",
      });

      const card = generateAgentCard(preset, "https://example.com/agents/secure", {
        authentication: {
          scheme: "Bearer",
          tokenUrl: "https://auth.example.com/token",
        },
      });

      expect(card.authentication?.scheme).toBe("Bearer");
      expect(card.authentication?.tokenUrl).toBe("https://auth.example.com/token");
    });
  });

  describe("exportAgentCard", () => {
    it("should export agent card to .well-known", () => {
      const preset = createAgentPreset(sudocodeDir, {
        id: "export-test",
        name: "Export Test",
        description: "Test export",
        agent_type: "claude-code",
        system_prompt: "Test",
      });

      const card = generateAgentCard(preset, "https://example.com/agents/export-test");
      const outputPath = path.join(testDir, ".well-known", "agent-card.json");
      const resultPath = exportAgentCard(card, outputPath);

      expect(fs.existsSync(resultPath)).toBe(true);
      expect(resultPath).toBe(outputPath);

      const exported = JSON.parse(fs.readFileSync(resultPath, "utf-8"));
      expect(exported.name).toBe("Export Test");
    });

    it("should create .well-known directory if needed", () => {
      const preset = createAgentPreset(sudocodeDir, {
        id: "auto-dir",
        name: "Auto Dir",
        description: "Test auto dir creation",
        agent_type: "claude-code",
        system_prompt: "Test",
      });

      const card = generateAgentCard(preset, "https://example.com/agents/auto-dir");
      const outputPath = path.join(testDir, "nested", ".well-known", "agent-card.json");

      exportAgentCard(card, outputPath);

      expect(fs.existsSync(outputPath)).toBe(true);
    });
  });

  describe("exportAllAgentCards", () => {
    beforeEach(() => {
      // Create multiple presets
      createAgentPreset(sudocodeDir, {
        id: "agent-1",
        name: "Agent 1",
        description: "First agent",
        agent_type: "claude-code",
        system_prompt: "Agent 1",
      });

      createAgentPreset(sudocodeDir, {
        id: "agent-2",
        name: "Agent 2",
        description: "Second agent",
        agent_type: "claude-code",
        system_prompt: "Agent 2",
      });
    });

    it("should export all agent cards", () => {
      const outputDir = path.join(testDir, "cards");
      const paths = exportAllAgentCards(sudocodeDir, "https://example.com", outputDir);

      expect(paths.length).toBeGreaterThanOrEqual(3); // test-reviewer + agent-1 + agent-2
      paths.forEach((p) => {
        expect(fs.existsSync(p)).toBe(true);
        expect(p).toContain(".agent-card.json");
      });
    });

    it("should create directory structure for each agent", () => {
      const paths = exportAllAgentCards(sudocodeDir, "https://example.com");

      paths.forEach((p) => {
        const agentId = path.basename(p, ".agent-card.json");
        const card = JSON.parse(fs.readFileSync(p, "utf-8"));
        expect(card.serviceEndpoint).toContain(agentId);
      });
    });
  });

  describe("createAgentRegistry", () => {
    beforeEach(() => {
      createAgentPreset(sudocodeDir, {
        id: "registry-1",
        name: "Registry Agent 1",
        description: "First registry agent",
        agent_type: "claude-code",
        system_prompt: "Registry 1",
        capabilities: ["skill-1", "skill-2"],
      });

      createAgentPreset(sudocodeDir, {
        id: "registry-2",
        name: "Registry Agent 2",
        description: "Second registry agent",
        agent_type: "claude-code",
        system_prompt: "Registry 2",
        capabilities: ["skill-3"],
      });
    });

    it("should create agent registry", () => {
      const outputPath = path.join(testDir, "agent-registry.json");
      const resultPath = createAgentRegistry(
        sudocodeDir,
        "https://example.com",
        outputPath
      );

      expect(fs.existsSync(resultPath)).toBe(true);

      const registry = JSON.parse(fs.readFileSync(resultPath, "utf-8"));
      expect(registry.version).toBe("1.0.0");
      expect(registry.agents).toBeDefined();
      expect(Array.isArray(registry.agents)).toBe(true);
      expect(registry.agents.length).toBeGreaterThanOrEqual(3);
    });

    it("should include agent metadata in registry", () => {
      const outputPath = path.join(testDir, "agent-registry.json");
      createAgentRegistry(sudocodeDir, "https://example.com", outputPath);

      const registry = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
      const agent = registry.agents.find((a: any) => a.id === "registry-1");

      expect(agent).toBeDefined();
      expect(agent.name).toBe("Registry Agent 1");
      expect(agent.description).toBe("First registry agent");
      expect(agent.serviceEndpoint).toContain("registry-1");
      expect(agent.agentCardUrl).toContain("registry-1.agent-card.json");
      expect(agent.capabilities).toContain("skill-1");
      expect(agent.capabilities).toContain("skill-2");
    });
  });

  describe("enableA2ASupport", () => {
    it("should enable A2A support for preset", () => {
      const result = enableA2ASupport(
        sudocodeDir,
        "test-reviewer",
        "https://example.com/agents/test-reviewer"
      );

      expect(result.success).toBe(true);
      expect(result.agentCardPath).toBeDefined();
      expect(fs.existsSync(result.agentCardPath!)).toBe(true);
    });

    it("should fail for non-existent preset", () => {
      const result = enableA2ASupport(
        sudocodeDir,
        "non-existent",
        "https://example.com/agents/non-existent"
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  describe("handleA2ARequest", () => {
    it("should handle agent.info request", async () => {
      const request: A2ARequest = {
        jsonrpc: "2.0",
        method: "agent.info",
        params: { agentId: "test-reviewer" },
        id: 1,
      };

      const response = await handleA2ARequest(request, sudocodeDir);

      expect(response.jsonrpc).toBe("2.0");
      expect(response.id).toBe(1);
      expect(response.result).toBeDefined();
      expect(response.result.id).toBe("test-reviewer");
      expect(response.result.name).toBe("Test Reviewer");
    });

    it("should handle agent.list request", async () => {
      const request: A2ARequest = {
        jsonrpc: "2.0",
        method: "agent.list",
        params: {},
        id: 2,
      };

      const response = await handleA2ARequest(request, sudocodeDir);

      expect(response.jsonrpc).toBe("2.0");
      expect(response.result).toBeDefined();
      expect(response.result.agents).toBeDefined();
      expect(Array.isArray(response.result.agents)).toBe(true);
    });

    it("should handle agent.execute request", async () => {
      const request: A2ARequest = {
        jsonrpc: "2.0",
        method: "agent.execute",
        params: {
          agentId: "test-reviewer",
          task: "Review this code",
          context: { file: "test.ts" },
        },
        id: 3,
      };

      const response = await handleA2ARequest(request, sudocodeDir);

      expect(response.jsonrpc).toBe("2.0");
      expect(response.result).toBeDefined();
      expect(response.result.status).toBe("success");
    });

    it("should return error for unknown method", async () => {
      const request: A2ARequest = {
        jsonrpc: "2.0",
        method: "agent.unknown",
        params: {},
        id: 4,
      };

      const response = await handleA2ARequest(request, sudocodeDir);

      expect(response.jsonrpc).toBe("2.0");
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(-32601);
      expect(response.error?.message).toContain("Method not found");
    });

    it("should handle errors gracefully", async () => {
      const request: A2ARequest = {
        jsonrpc: "2.0",
        method: "agent.info",
        params: { agentId: "non-existent" },
        id: 5,
      };

      const response = await handleA2ARequest(request, sudocodeDir);

      expect(response.jsonrpc).toBe("2.0");
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(-32603);
    });
  });
});
