/**
 * Tests for platform detection and configuration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  detectPlatform,
  getPlatformConfig,
  autoConfigurePlatform,
  supportsMCP,
  getMCPConfigPath,
  type PlatformType,
} from "../../src/operations/platform.js";
import { initializeAgentsDirectory } from "../../src/operations/agents.js";

describe("Platform Detection", () => {
  let testDir: string;
  let sudocodeDir: string;
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original state
    originalCwd = process.cwd();
    originalEnv = { ...process.env };

    // Create temporary test directory
    const timestamp = Date.now();
    testDir = path.join("/tmp", `platform-test-${timestamp}`);
    sudocodeDir = path.join(testDir, ".sudocode");
    fs.mkdirSync(testDir, { recursive: true });
    initializeAgentsDirectory(sudocodeDir);

    // Change to test directory
    process.chdir(testDir);
  });

  afterEach(() => {
    // Restore original state
    process.chdir(originalCwd);
    process.env = originalEnv;

    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("detectPlatform", () => {
    it("should detect Claude Code from environment variable", () => {
      process.env.CLAUDE_CODE = "1";
      const platform = detectPlatform();

      expect(platform.type).toBe("claude-code");
      expect(platform.detected_by).toContain("CLAUDE_CODE env var");
    });

    it("should detect Cursor from environment variable", () => {
      process.env.CURSOR_IDE = "1";
      const platform = detectPlatform();

      expect(platform.type).toBe("cursor");
      expect(platform.detected_by).toContain("CURSOR_IDE env var");
    });

    it("should detect Claude Code from .claude directory", () => {
      fs.mkdirSync(path.join(testDir, ".claude"));
      const platform = detectPlatform();

      expect(platform.detected_by).toContain(".claude directory exists");
    });

    it("should detect Cursor from .cursor directory", () => {
      fs.mkdirSync(path.join(testDir, ".cursor"));
      const platform = detectPlatform();

      expect(platform.detected_by).toContain(".cursor directory exists");
    });

    it("should detect VS Code from environment", () => {
      process.env.TERM_PROGRAM = "vscode";
      const platform = detectPlatform();

      expect(platform.type).toBe("vscode");
      expect(platform.detected_by).toContain("VSCODE_PID or TERM_PROGRAM env var");
    });

    it("should detect terminal when running in TTY", () => {
      // In test environment, likely detects as terminal or unknown
      const platform = detectPlatform();

      expect(platform.type).toMatch(/terminal|unknown/);
    });

    it("should include config paths when detected", () => {
      fs.mkdirSync(path.join(testDir, ".claude"));
      const platform = detectPlatform();

      expect(platform.config_paths).toBeDefined();
      expect(platform.config_paths?.agent_config).toContain(".claude/agents");
    });
  });

  describe("getPlatformConfig", () => {
    it("should return Claude Code config", () => {
      const config = getPlatformConfig("claude-code");

      expect(config.export_format).toBe("claude-code");
      expect(config.agent_directory).toBe(".claude/agents");
      expect(config.auto_export).toBe(true);
      expect(config.mcp_integration).toBe(true);
    });

    it("should return Cursor config", () => {
      const config = getPlatformConfig("cursor");

      expect(config.export_format).toBe("cursor");
      expect(config.agent_directory).toBe(".cursor/rules");
      expect(config.auto_export).toBe(true);
      expect(config.mcp_integration).toBe(false);
    });

    it("should return Gemini CLI config", () => {
      const config = getPlatformConfig("gemini-cli");

      expect(config.export_format).toBe("gemini-cli");
      expect(config.agent_directory).toBe(".gemini/agents");
      expect(config.auto_export).toBe(true);
    });

    it("should return VS Code config", () => {
      const config = getPlatformConfig("vscode");

      expect(config.export_format).toBe("claude-code");
      expect(config.mcp_integration).toBe(true);
    });
  });

  describe("autoConfigurePlatform", () => {
    it("should configure for detected platform", () => {
      process.env.CLAUDE_CODE = "1";
      const result = autoConfigurePlatform(sudocodeDir);

      expect(result.success).toBe(true);
      expect(result.platform.type).toBe("claude-code");
      expect(result.actions.length).toBeGreaterThan(0);
    });

    it("should update agents config.json", () => {
      const result = autoConfigurePlatform(sudocodeDir);

      expect(result.success).toBe(true);

      // Check that config was updated
      const configPath = path.join(sudocodeDir, "agents", "config.json");
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

      expect(config.interoperability).toBeDefined();
      expect(config.interoperability.detected_platform).toBeDefined();
    });

    it("should create platform directory if needed", () => {
      process.env.CURSOR_IDE = "1";
      const result = autoConfigurePlatform(sudocodeDir);

      expect(result.success).toBe(true);
      expect(result.actions.some((a) => a.includes("Created platform directory"))).toBe(true);
    });
  });

  describe("supportsMCP", () => {
    it("should return true for Claude Code", () => {
      expect(supportsMCP("claude-code")).toBe(true);
    });

    it("should return true for VS Code", () => {
      expect(supportsMCP("vscode")).toBe(true);
    });

    it("should return false for Cursor", () => {
      expect(supportsMCP("cursor")).toBe(false);
    });

    it("should return false for terminal", () => {
      expect(supportsMCP("terminal")).toBe(false);
    });
  });

  describe("getMCPConfigPath", () => {
    it("should return Claude Code MCP config path", () => {
      const mcpPath = getMCPConfigPath("claude-code");

      expect(mcpPath).toBeDefined();
      expect(mcpPath).toContain("Claude");
      expect(mcpPath).toContain("claude_desktop_config.json");
    });

    it("should return VS Code MCP config path", () => {
      const mcpPath = getMCPConfigPath("vscode");

      expect(mcpPath).toBeDefined();
      expect(mcpPath).toContain("Code");
    });

    it("should return null for unsupported platforms", () => {
      expect(getMCPConfigPath("cursor")).toBeNull();
      expect(getMCPConfigPath("gemini-cli")).toBeNull();
      expect(getMCPConfigPath("terminal")).toBeNull();
    });
  });
});
