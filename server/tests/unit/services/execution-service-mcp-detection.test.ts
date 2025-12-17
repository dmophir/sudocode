/**
 * Unit tests for ExecutionService MCP Detection Methods
 *
 * Tests the MCP detection methods that determine if sudocode-mcp is installed
 * and configured for agent executions. These tests follow TDD red-green-refactor
 * methodology and should initially fail (red state) before implementation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AgentType } from "@sudocode-ai/types";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

/**
 * Mock modules before importing ExecutionService
 */
vi.mock("fs/promises");
vi.mock("child_process", () => ({
  exec: vi.fn(),
}));

describe("ExecutionService - MCP Detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("detectSudocodeMcp", () => {
    it("should return true when sudocode-mcp package is available in PATH", async () => {
      // Mock successful command execution (sudocode-mcp exists in PATH)
      const { exec } = await import("child_process");
      vi.mocked(exec).mockImplementation((cmd, callback: any) => {
        // Simulate successful `which sudocode-mcp` or `where sudocode-mcp` command
        callback(null, { stdout: "/usr/local/bin/sudocode-mcp\n", stderr: "" });
        return {} as any;
      });

      // TODO: Call detectSudocodeMcp() when implemented
      // const result = await service.detectSudocodeMcp();
      // expect(result).toBe(true);

      // For now, test should fail since method doesn't exist
      expect(true).toBe(false); // RED STATE: Force failure until implementation
    });

    it("should return false when sudocode-mcp package is not available", async () => {
      // Mock failed command execution (sudocode-mcp not found)
      const { exec } = await import("child_process");
      vi.mocked(exec).mockImplementation((cmd, callback: any) => {
        // Simulate `which sudocode-mcp` returning non-zero exit code
        const error = new Error("Command failed") as any;
        error.code = 1;
        callback(error, { stdout: "", stderr: "not found" });
        return {} as any;
      });

      // TODO: Call detectSudocodeMcp() when implemented
      // const result = await service.detectSudocodeMcp();
      // expect(result).toBe(false);

      // RED STATE: Force failure until implementation
      expect(true).toBe(false);
    });

    it("should return false on detection errors (logs warning, doesn't throw)", async () => {
      // Mock command execution error (not just "not found", but actual failure)
      const { exec } = await import("child_process");
      vi.mocked(exec).mockImplementation((cmd, callback: any) => {
        callback(new Error("Unexpected error"), null);
        return {} as any;
      });

      // TODO: Call detectSudocodeMcp() when implemented
      // const result = await service.detectSudocodeMcp();
      // expect(result).toBe(false);
      // Verify warning was logged but no error thrown

      // RED STATE: Force failure until implementation
      expect(true).toBe(false);
    });
  });

  describe("detectAgentMcp - claude-code", () => {
    const claudeSettingsPath = path.join(
      os.homedir(),
      ".claude",
      "settings.json"
    );

    it("should return true when settings.json has sudocode plugin enabled", async () => {
      // Mock successful file read with plugin enabled
      const mockSettings = {
        $schema: "https://json.schemastore.org/claude-code-settings.json",
        enabledPlugins: {
          "sudocode@sudocode-marketplace": true,
        },
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockSettings));

      // TODO: Call detectAgentMcp('claude-code') when implemented
      // const result = await service.detectAgentMcp('claude-code');
      // expect(result).toBe(true);
      // expect(fs.readFile).toHaveBeenCalledWith(claudeSettingsPath, 'utf-8');

      // RED STATE: Force failure until implementation
      expect(true).toBe(false);
    });

    it("should return false when settings.json exists but plugin is not enabled", async () => {
      // Mock file read with plugin disabled or missing
      const mockSettings = {
        $schema: "https://json.schemastore.org/claude-code-settings.json",
        enabledPlugins: {
          "other-plugin@marketplace": true,
        },
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockSettings));

      // TODO: Call detectAgentMcp('claude-code') when implemented
      // const result = await service.detectAgentMcp('claude-code');
      // expect(result).toBe(false);

      // RED STATE: Force failure until implementation
      expect(true).toBe(false);
    });

    it("should return false when settings.json doesn't exist", async () => {
      // Mock file read error (ENOENT - file not found)
      const error = new Error("ENOENT: no such file or directory") as any;
      error.code = "ENOENT";
      vi.mocked(fs.readFile).mockRejectedValue(error);

      // TODO: Call detectAgentMcp('claude-code') when implemented
      // const result = await service.detectAgentMcp('claude-code');
      // expect(result).toBe(false);

      // RED STATE: Force failure until implementation
      expect(true).toBe(false);
    });

    it("should return false when settings.json is malformed JSON (logs error)", async () => {
      // Mock file read with invalid JSON
      vi.mocked(fs.readFile).mockResolvedValue("{ invalid json }");

      // TODO: Call detectAgentMcp('claude-code') when implemented
      // const result = await service.detectAgentMcp('claude-code');
      // expect(result).toBe(false);
      // Verify error was logged but no exception thrown

      // RED STATE: Force failure until implementation
      expect(true).toBe(false);
    });

    it("should return false when enabledPlugins['sudocode@sudocode-marketplace'] is false", async () => {
      // Mock file read with plugin explicitly disabled
      const mockSettings = {
        $schema: "https://json.schemastore.org/claude-code-settings.json",
        enabledPlugins: {
          "sudocode@sudocode-marketplace": false,
        },
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockSettings));

      // TODO: Call detectAgentMcp('claude-code') when implemented
      // const result = await service.detectAgentMcp('claude-code');
      // expect(result).toBe(false);

      // RED STATE: Force failure until implementation
      expect(true).toBe(false);
    });

    it("should return false when enabledPlugins['sudocode@sudocode-marketplace'] is missing", async () => {
      // Mock file read with no sudocode plugin in enabledPlugins
      const mockSettings = {
        $schema: "https://json.schemastore.org/claude-code-settings.json",
        enabledPlugins: {},
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockSettings));

      // TODO: Call detectAgentMcp('claude-code') when implemented
      // const result = await service.detectAgentMcp('claude-code');
      // expect(result).toBe(false);

      // RED STATE: Force failure until implementation
      expect(true).toBe(false);
    });

    it("should handle file read errors gracefully (returns false, logs warning)", async () => {
      // Mock file read error (permission denied or other error)
      const error = new Error("EACCES: permission denied") as any;
      error.code = "EACCES";
      vi.mocked(fs.readFile).mockRejectedValue(error);

      // TODO: Call detectAgentMcp('claude-code') when implemented
      // const result = await service.detectAgentMcp('claude-code');
      // expect(result).toBe(false);
      // Verify warning was logged

      // RED STATE: Force failure until implementation
      expect(true).toBe(false);
    });
  });

  describe("detectAgentMcp - other agents", () => {
    it("should return true for copilot agent (unsupported, defaults to safe behavior)", async () => {
      // TODO: Call detectAgentMcp('copilot') when implemented
      // const result = await service.detectAgentMcp('copilot');
      // expect(result).toBe(true);

      // RED STATE: Force failure until implementation
      expect(true).toBe(false);
    });

    it("should return true for cursor agent (unsupported, defaults to safe behavior)", async () => {
      // TODO: Call detectAgentMcp('cursor') when implemented
      // const result = await service.detectAgentMcp('cursor');
      // expect(result).toBe(true);

      // RED STATE: Force failure until implementation
      expect(true).toBe(false);
    });

    it("should return true for codex agent (unsupported, defaults to safe behavior)", async () => {
      // TODO: Call detectAgentMcp('codex') when implemented
      // const result = await service.detectAgentMcp('codex');
      // expect(result).toBe(true);

      // RED STATE: Force failure until implementation
      expect(true).toBe(false);
    });
  });

  describe("Integration - buildExecutionConfig", () => {
    it("should throw error when detectSudocodeMcp() returns false", async () => {
      // Mock sudocode-mcp not installed
      const { exec } = await import("child_process");
      vi.mocked(exec).mockImplementation((cmd, callback: any) => {
        const error = new Error("Command failed") as any;
        error.code = 1;
        callback(error, { stdout: "", stderr: "not found" });
        return {} as any;
      });

      // TODO: Call buildExecutionConfig() when implemented
      // await expect(
      //   service.buildExecutionConfig('claude-code', {})
      // ).rejects.toThrow(/sudocode-mcp not installed/);

      // RED STATE: Force failure until implementation
      expect(true).toBe(false);
    });

    it("should add sudocode-mcp to mcpServers when detectAgentMcp() returns false", async () => {
      // Mock sudocode-mcp installed but not configured for agent
      const { exec } = await import("child_process");
      vi.mocked(exec).mockImplementation((cmd, callback: any) => {
        callback(null, { stdout: "/usr/local/bin/sudocode-mcp\n", stderr: "" });
        return {} as any;
      });

      // Mock agent MCP detection as false (not configured)
      const mockSettings = {
        enabledPlugins: {},
      };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockSettings));

      // TODO: Call buildExecutionConfig() when implemented
      // const result = await service.buildExecutionConfig('claude-code', {});
      // expect(result.mcpServers).toBeDefined();
      // expect(result.mcpServers['sudocode-mcp']).toEqual({
      //   command: 'sudocode-mcp',
      //   args: [],
      // });

      // RED STATE: Force failure until implementation
      expect(true).toBe(false);
    });

    it("should skip injection when detectAgentMcp() returns true (plugin already configured)", async () => {
      // Mock sudocode-mcp installed AND configured
      const { exec } = await import("child_process");
      vi.mocked(exec).mockImplementation((cmd, callback: any) => {
        callback(null, { stdout: "/usr/local/bin/sudocode-mcp\n", stderr: "" });
        return {} as any;
      });

      const mockSettings = {
        enabledPlugins: {
          "sudocode@sudocode-marketplace": true,
        },
      };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockSettings));

      // TODO: Call buildExecutionConfig() when implemented
      // const result = await service.buildExecutionConfig('claude-code', {});
      // expect(result.mcpServers?.['sudocode-mcp']).toBeUndefined();

      // RED STATE: Force failure until implementation
      expect(true).toBe(false);
    });

    it("should preserve user-provided MCP servers when auto-injecting", async () => {
      // Mock sudocode-mcp installed but not configured
      const { exec } = await import("child_process");
      vi.mocked(exec).mockImplementation((cmd, callback: any) => {
        callback(null, { stdout: "/usr/local/bin/sudocode-mcp\n", stderr: "" });
        return {} as any;
      });

      const mockSettings = { enabledPlugins: {} };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockSettings));

      const userConfig = {
        mcpServers: {
          "custom-mcp": {
            command: "custom-mcp",
            args: ["--verbose"],
          },
        },
      };

      // TODO: Call buildExecutionConfig() when implemented
      // const result = await service.buildExecutionConfig('claude-code', userConfig);
      // expect(result.mcpServers['custom-mcp']).toEqual(userConfig.mcpServers['custom-mcp']);
      // expect(result.mcpServers['sudocode-mcp']).toBeDefined();

      // RED STATE: Force failure until implementation
      expect(true).toBe(false);
    });

    it("should not duplicate sudocode-mcp if user already provided it", async () => {
      // Mock sudocode-mcp installed
      const { exec } = await import("child_process");
      vi.mocked(exec).mockImplementation((cmd, callback: any) => {
        callback(null, { stdout: "/usr/local/bin/sudocode-mcp\n", stderr: "" });
        return {} as any;
      });

      const mockSettings = { enabledPlugins: {} };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockSettings));

      const userConfig = {
        mcpServers: {
          "sudocode-mcp": {
            command: "sudocode-mcp",
            args: ["--custom-flag"],
          },
        },
      };

      // TODO: Call buildExecutionConfig() when implemented
      // const result = await service.buildExecutionConfig('claude-code', userConfig);
      // expect(result.mcpServers['sudocode-mcp']).toEqual(userConfig.mcpServers['sudocode-mcp']);
      // Should preserve user's custom config, not overwrite with default

      // RED STATE: Force failure until implementation
      expect(true).toBe(false);
    });
  });
});
