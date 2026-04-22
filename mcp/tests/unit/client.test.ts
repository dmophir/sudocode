/**
 * Unit tests for SudocodeClient
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { spawn } from "child_process";
import { EventEmitter } from "events";
import { SudocodeClient } from "../../src/client.js";
import { SudocodeError } from "../../src/types.js";

// Mock child_process
vi.mock("child_process");

describe("SudocodeClient", () => {
  let mockSpawn: any;
  let mockProcess: any;

  beforeEach(() => {
    // Create mock process
    mockProcess = new EventEmitter();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockProcess.kill = vi.fn();

    // Mock spawn to return our mock process
    mockSpawn = vi.mocked(spawn);
    mockSpawn.mockReturnValue(mockProcess as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should use default configuration", () => {
      const client = new SudocodeClient();
      expect(client).toBeDefined();
    });

    it("should use provided configuration", () => {
      const config = {
        workingDir: "/custom/path",
        cliPath: "/usr/local/bin/sg",
        dbPath: "/custom/cache.db",
      };
      const client = new SudocodeClient(config);
      expect(client).toBeDefined();
    });

    it("should accept projectId in configuration", () => {
      const client = new SudocodeClient({
        projectId: "my-project-abc12345",
        workingDir: "/project/path",
        sudocodeDir: "/project/path/.sudocode",
      });
      expect(client).toBeDefined();
    });
  });

  describe("exec", () => {
    it("should spawn CLI with correct arguments", async () => {
      const client = new SudocodeClient();

      // Mock version check
      const versionProcess = new EventEmitter() as any;
      versionProcess.stdout = new EventEmitter();
      versionProcess.stderr = new EventEmitter();
      mockSpawn.mockReturnValueOnce(versionProcess);

      // Emit version response
      setImmediate(() => {
        versionProcess.stdout.emit("data", "0.1.0\n");
        versionProcess.emit("close", 0);
      });

      // Mock actual command
      mockSpawn.mockReturnValueOnce(mockProcess);
      setImmediate(() => {
        mockProcess.stdout.emit("data", '{"result": "success"}');
        mockProcess.emit("close", 0);
      });

      const result = await client.exec(["issue", "list"]);

      expect(mockSpawn).toHaveBeenCalledTimes(2); // version + command

      // When CLI is found in node_modules, it uses node binary + cli.js
      // Otherwise it uses "sudocode" command
      const lastCall = mockSpawn.mock.calls[1];
      const [command, args, options] = lastCall;

      // Check that the command includes the correct arguments
      if (command === "sudocode") {
        // CLI found in PATH
        expect(args).toEqual(
          expect.arrayContaining(["issue", "list", "--json"])
        );
      } else {
        // CLI found in node_modules - uses node binary
        expect(command).toBe(process.execPath);
        expect(args).toEqual(
          expect.arrayContaining(["issue", "list", "--json"])
        );
        expect(args[0]).toContain("cli.js");
      }

      expect(options).toEqual(
        expect.objectContaining({
          cwd: expect.any(String),
          env: expect.objectContaining({
            SUDOCODE_DISABLE_UPDATE_CHECK: "true",
          }),
        })
      );
      expect(result).toEqual({ result: "success" });
    });

    it("should automatically add --json flag", async () => {
      const client = new SudocodeClient();

      // Mock version check
      const versionProcess = new EventEmitter() as any;
      versionProcess.stdout = new EventEmitter();
      versionProcess.stderr = new EventEmitter();
      mockSpawn.mockReturnValueOnce(versionProcess);
      setImmediate(() => {
        versionProcess.stdout.emit("data", "0.1.0\n");
        versionProcess.emit("close", 0);
      });

      // Mock actual command
      mockSpawn.mockReturnValueOnce(mockProcess);
      setImmediate(() => {
        mockProcess.stdout.emit("data", "[]");
        mockProcess.emit("close", 0);
      });

      await client.exec(["ready"]);

      const lastCall = mockSpawn.mock.calls[mockSpawn.mock.calls.length - 1];
      expect(lastCall[1]).toContain("--json");
    });

    it("should not duplicate --json flag if already present", async () => {
      const client = new SudocodeClient();

      // Mock version check
      const versionProcess = new EventEmitter() as any;
      versionProcess.stdout = new EventEmitter();
      versionProcess.stderr = new EventEmitter();
      mockSpawn.mockReturnValueOnce(versionProcess);
      setImmediate(() => {
        versionProcess.stdout.emit("data", "0.1.0\n");
        versionProcess.emit("close", 0);
      });

      // Mock actual command
      mockSpawn.mockReturnValueOnce(mockProcess);
      setImmediate(() => {
        mockProcess.stdout.emit("data", "[]");
        mockProcess.emit("close", 0);
      });

      await client.exec(["ready", "--json"]);

      const lastCall = mockSpawn.mock.calls[mockSpawn.mock.calls.length - 1];
      const jsonCount = lastCall[1].filter(
        (arg: string) => arg === "--json"
      ).length;
      expect(jsonCount).toBe(1);
    });

    it("should add --db flag when dbPath is configured", async () => {
      const client = new SudocodeClient({ dbPath: "/custom/cache.db" });

      // Mock version check
      const versionProcess = new EventEmitter() as any;
      versionProcess.stdout = new EventEmitter();
      versionProcess.stderr = new EventEmitter();
      mockSpawn.mockReturnValueOnce(versionProcess);
      setImmediate(() => {
        versionProcess.stdout.emit("data", "0.1.0\n");
        versionProcess.emit("close", 0);
      });

      // Mock actual command
      mockSpawn.mockReturnValueOnce(mockProcess);
      setImmediate(() => {
        mockProcess.stdout.emit("data", "{}");
        mockProcess.emit("close", 0);
      });

      await client.exec(["stats"]);

      const lastCall = mockSpawn.mock.calls[mockSpawn.mock.calls.length - 1];
      expect(lastCall[1]).toContain("--db");
      expect(lastCall[1]).toContain("/custom/cache.db");
    });

    it("should set SUDOCODE_DISABLE_UPDATE_CHECK environment variable", async () => {
      const client = new SudocodeClient();

      // Mock version check
      const versionProcess = new EventEmitter() as any;
      versionProcess.stdout = new EventEmitter();
      versionProcess.stderr = new EventEmitter();
      mockSpawn.mockReturnValueOnce(versionProcess);
      setImmediate(() => {
        versionProcess.stdout.emit("data", "0.1.0\n");
        versionProcess.emit("close", 0);
      });

      // Mock actual command
      mockSpawn.mockReturnValueOnce(mockProcess);
      setImmediate(() => {
        mockProcess.stdout.emit("data", "{}");
        mockProcess.emit("close", 0);
      });

      await client.exec(["stats"]);

      const lastCall = mockSpawn.mock.calls[mockSpawn.mock.calls.length - 1];
      const [_, __, options] = lastCall;
      expect(options.env.SUDOCODE_DISABLE_UPDATE_CHECK).toBe("true");
    });

    it("should parse JSON output correctly", async () => {
      const client = new SudocodeClient();

      // Mock version check
      const versionProcess = new EventEmitter() as any;
      versionProcess.stdout = new EventEmitter();
      versionProcess.stderr = new EventEmitter();
      mockSpawn.mockReturnValueOnce(versionProcess);
      setImmediate(() => {
        versionProcess.stdout.emit("data", "0.1.0\n");
        versionProcess.emit("close", 0);
      });

      // Mock actual command
      mockSpawn.mockReturnValueOnce(mockProcess);
      const testData = { issues: [{ id: "ISSUE-001", title: "Test" }] };
      setImmediate(() => {
        mockProcess.stdout.emit("data", JSON.stringify(testData));
        mockProcess.emit("close", 0);
      });

      const result = await client.exec(["issue", "list"]);
      expect(result).toEqual(testData);
    });

    it("should handle multi-chunk stdout", async () => {
      const client = new SudocodeClient();

      // Mock version check
      const versionProcess = new EventEmitter() as any;
      versionProcess.stdout = new EventEmitter();
      versionProcess.stderr = new EventEmitter();
      mockSpawn.mockReturnValueOnce(versionProcess);
      setImmediate(() => {
        versionProcess.stdout.emit("data", "0.1.0\n");
        versionProcess.emit("close", 0);
      });

      // Mock actual command with chunked output
      mockSpawn.mockReturnValueOnce(mockProcess);
      setImmediate(() => {
        mockProcess.stdout.emit("data", '{"result":');
        mockProcess.stdout.emit("data", ' "success"}');
        mockProcess.emit("close", 0);
      });

      const result = await client.exec(["stats"]);
      expect(result).toEqual({ result: "success" });
    });

    it("should throw SudocodeError on non-zero exit code", async () => {
      const client = new SudocodeClient();

      // Mock version check
      const versionProcess = new EventEmitter() as any;
      versionProcess.stdout = new EventEmitter();
      versionProcess.stderr = new EventEmitter();
      mockSpawn.mockReturnValueOnce(versionProcess);
      setImmediate(() => {
        versionProcess.stdout.emit("data", "0.1.0\n");
        versionProcess.emit("close", 0);
      });

      // Mock failing command
      mockSpawn.mockReturnValueOnce(mockProcess);
      setImmediate(() => {
        mockProcess.stderr.emit("data", "Error: Issue not found\n");
        mockProcess.emit("close", 1);
      });

      await expect(client.exec(["issue", "show", "ISSUE-999"])).rejects.toThrow(
        SudocodeError
      );
    });

    it("should include stderr in error message", async () => {
      const client = new SudocodeClient();

      // Mock version check
      const versionProcess = new EventEmitter() as any;
      versionProcess.stdout = new EventEmitter();
      versionProcess.stderr = new EventEmitter();
      mockSpawn.mockReturnValueOnce(versionProcess);
      setImmediate(() => {
        versionProcess.stdout.emit("data", "0.1.0\n");
        versionProcess.emit("close", 0);
      });

      // Mock failing command
      mockSpawn.mockReturnValueOnce(mockProcess);
      const errorMessage = "Error: Database not found";
      setImmediate(() => {
        mockProcess.stderr.emit("data", errorMessage);
        mockProcess.emit("close", 1);
      });

      try {
        await client.exec(["stats"]);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(SudocodeError);
        expect((error as SudocodeError).stderr).toBe(errorMessage);
        expect((error as SudocodeError).exitCode).toBe(1);
      }
    });

    it("should throw error on malformed JSON", async () => {
      const client = new SudocodeClient();

      // Mock version check
      const versionProcess = new EventEmitter() as any;
      versionProcess.stdout = new EventEmitter();
      versionProcess.stderr = new EventEmitter();
      mockSpawn.mockReturnValueOnce(versionProcess);
      setImmediate(() => {
        versionProcess.stdout.emit("data", "0.1.0\n");
        versionProcess.emit("close", 0);
      });

      // Mock command with invalid JSON
      mockSpawn.mockReturnValueOnce(mockProcess);
      setImmediate(() => {
        mockProcess.stdout.emit("data", "{invalid json}");
        mockProcess.emit("close", 0);
      });

      await expect(client.exec(["stats"])).rejects.toThrow(SudocodeError);
    });

    it("should timeout after specified duration", async () => {
      const client = new SudocodeClient();

      // Mock version check
      const versionProcess = new EventEmitter() as any;
      versionProcess.stdout = new EventEmitter();
      versionProcess.stderr = new EventEmitter();
      mockSpawn.mockReturnValueOnce(versionProcess);
      setImmediate(() => {
        versionProcess.stdout.emit("data", "0.1.0\n");
        versionProcess.emit("close", 0);
      });

      // Mock command that never completes
      mockSpawn.mockReturnValueOnce(mockProcess);
      // Don't emit close event

      await expect(client.exec(["stats"], { timeout: 100 })).rejects.toThrow(
        "timed out"
      );
      expect(mockProcess.kill).toHaveBeenCalled();
    }, 1000);

    it("should handle spawn errors", async () => {
      const client = new SudocodeClient({ cliPath: "/nonexistent/sg" });

      // Mock version check failure
      const versionProcess = new EventEmitter() as any;
      versionProcess.stdout = new EventEmitter();
      versionProcess.stderr = new EventEmitter();
      mockSpawn.mockReturnValueOnce(versionProcess);
      setImmediate(() => {
        versionProcess.emit("error", new Error("ENOENT"));
      });

      await expect(client.exec(["stats"])).rejects.toThrow(SudocodeError);
    });
  });

  describe("checkVersion", () => {
    it("should successfully check CLI version", async () => {
      const client = new SudocodeClient();

      mockSpawn.mockReturnValueOnce(mockProcess);
      setImmediate(() => {
        mockProcess.stdout.emit("data", "sg version 0.1.0\n");
        mockProcess.emit("close", 0);
      });

      const result = await client.checkVersion();
      expect(result).toEqual({ version: "0.1.0" });
    });

    it("should parse version from numeric output", async () => {
      const client = new SudocodeClient();

      mockSpawn.mockReturnValueOnce(mockProcess);
      setImmediate(() => {
        mockProcess.stdout.emit("data", "1.2.3\n");
        mockProcess.emit("close", 0);
      });

      const result = await client.checkVersion();
      expect(result).toEqual({ version: "1.2.3" });
    });

    it("should throw error when CLI not found", async () => {
      const client = new SudocodeClient({ cliPath: "/nonexistent" });

      mockSpawn.mockReturnValueOnce(mockProcess);

      const promise = client.checkVersion();

      // Emit error immediately
      setImmediate(() => {
        mockProcess.emit("error", new Error("ENOENT"));
      });

      await expect(promise).rejects.toThrow(SudocodeError);
      await expect(promise).rejects.toThrow("CLI not found");
    });

    it("should throw error on non-zero exit code", async () => {
      const client = new SudocodeClient();

      mockSpawn.mockReturnValueOnce(mockProcess);
      setImmediate(() => {
        mockProcess.stderr.emit("data", "Command not found\n");
        mockProcess.emit("close", 127);
      });

      await expect(client.checkVersion()).rejects.toThrow(SudocodeError);
    });

    it("should set SUDOCODE_DISABLE_UPDATE_CHECK when checking version", async () => {
      const client = new SudocodeClient();

      mockSpawn.mockReturnValueOnce(mockProcess);
      setImmediate(() => {
        mockProcess.stdout.emit("data", "0.1.0\n");
        mockProcess.emit("close", 0);
      });

      await client.checkVersion();

      const lastCall = mockSpawn.mock.calls[mockSpawn.mock.calls.length - 1];
      const [_, __, options] = lastCall;
      expect(options.env.SUDOCODE_DISABLE_UPDATE_CHECK).toBe("true");
    });
  });

  describe("getSudocodeDir", () => {
    afterEach(() => {
      delete process.env.SUDOCODE_DIR;
      delete process.env.SUDOCODE_SERVER_URL;
    });

    it("should return explicit override when provided via config", () => {
      const client = new SudocodeClient({ sudocodeDir: "/custom/.sudocode" });
      expect(client.getSudocodeDir()).toBe("/custom/.sudocode");
    });

    it("should fall back to <workingDir>/.sudocode when no sudocodeDir config", () => {
      const client = new SudocodeClient({ workingDir: "/project/path" });
      const result = client.getSudocodeDir();
      expect(result).toBe("/project/path/.sudocode");
    });

    it("should prioritize config override over workingDir fallback", () => {
      const client = new SudocodeClient({
        sudocodeDir: "/config/.sudocode",
        workingDir: "/project/path",
      });
      expect(client.getSudocodeDir()).toBe("/config/.sudocode");
    });

    it("should return static path immediately (no network calls)", () => {
      const client = new SudocodeClient({
        serverUrl: "http://localhost:3002",
        workingDir: "/my/project",
      });

      const result = client.getSudocodeDir();
      expect(result).toBe("/my/project/.sudocode");
    });
  });

  describe("dbPath resolution", () => {
    it("should set dbPath from config sudocodeDir", async () => {
      const client = new SudocodeClient({ sudocodeDir: "/custom/.sudocode" });

      // Mock version check
      const versionProcess = new EventEmitter() as any;
      versionProcess.stdout = new EventEmitter();
      versionProcess.stderr = new EventEmitter();
      mockSpawn.mockReturnValueOnce(versionProcess);
      setImmediate(() => {
        versionProcess.stdout.emit("data", "0.1.0\n");
        versionProcess.emit("close", 0);
      });

      // Mock actual command
      mockSpawn.mockReturnValueOnce(mockProcess);
      setImmediate(() => {
        mockProcess.stdout.emit("data", "{}");
        mockProcess.emit("close", 0);
      });

      await client.exec(["stats"]);

      const lastCall = mockSpawn.mock.calls[mockSpawn.mock.calls.length - 1];
      // dbPath should be derived from sudocodeDir
      expect(lastCall[1]).toContain("--db");
      expect(lastCall[1]).toContain("/custom/.sudocode/cache.db");
    });

    it("should default to <sudocodeDir>/cache.db when config.sudocodeDir is set", async () => {
      const client = new SudocodeClient({ sudocodeDir: "/config/.sudocode" });

      // Mock version check
      const versionProcess = new EventEmitter() as any;
      versionProcess.stdout = new EventEmitter();
      versionProcess.stderr = new EventEmitter();
      mockSpawn.mockReturnValueOnce(versionProcess);
      setImmediate(() => {
        versionProcess.stdout.emit("data", "0.1.0\n");
        versionProcess.emit("close", 0);
      });

      // Mock actual command
      mockSpawn.mockReturnValueOnce(mockProcess);
      setImmediate(() => {
        mockProcess.stdout.emit("data", "{}");
        mockProcess.emit("close", 0);
      });

      await client.exec(["stats"]);

      const lastCall = mockSpawn.mock.calls[mockSpawn.mock.calls.length - 1];
      expect(lastCall[1]).toContain("--db");
      expect(lastCall[1]).toContain("/config/.sudocode/cache.db");
    });

    it("should prioritize explicit dbPath over sudocodeDir", async () => {
      const client = new SudocodeClient({ dbPath: "/explicit/cache.db", sudocodeDir: "/config/.sudocode" });

      // Mock version check
      const versionProcess = new EventEmitter() as any;
      versionProcess.stdout = new EventEmitter();
      versionProcess.stderr = new EventEmitter();
      mockSpawn.mockReturnValueOnce(versionProcess);
      setImmediate(() => {
        versionProcess.stdout.emit("data", "0.1.0\n");
        versionProcess.emit("close", 0);
      });

      // Mock actual command
      mockSpawn.mockReturnValueOnce(mockProcess);
      setImmediate(() => {
        mockProcess.stdout.emit("data", "{}");
        mockProcess.emit("close", 0);
      });

      await client.exec(["stats"]);

      const lastCall = mockSpawn.mock.calls[mockSpawn.mock.calls.length - 1];
      expect(lastCall[1]).toContain("--db");
      expect(lastCall[1]).toContain("/explicit/cache.db");
    });

    it("should use --project-id when projectId is configured", async () => {
      const client = new SudocodeClient({
        projectId: "my-project-abc12345",
        workingDir: "/project/path",
        sudocodeDir: "/project/path/.sudocode",
      });

      // Mock version check
      const versionProcess = new EventEmitter() as any;
      versionProcess.stdout = new EventEmitter();
      versionProcess.stderr = new EventEmitter();
      mockSpawn.mockReturnValueOnce(versionProcess);
      setImmediate(() => {
        versionProcess.stdout.emit("data", "0.1.0\n");
        versionProcess.emit("close", 0);
      });

      // Mock actual command
      mockSpawn.mockReturnValueOnce(mockProcess);
      setImmediate(() => {
        mockProcess.stdout.emit("data", "{}");
        mockProcess.emit("close", 0);
      });

      await client.exec(["stats"]);

      const lastCall = mockSpawn.mock.calls[mockSpawn.mock.calls.length - 1];
      expect(lastCall[1]).toContain("--project-id");
      expect(lastCall[1]).toContain("my-project-abc12345");
    });

    it("should fall back to <workingDir>/.sudocode/cache.db when no config", async () => {
      const client = new SudocodeClient({ workingDir: "/project" });

      // Mock version check
      const versionProcess = new EventEmitter() as any;
      versionProcess.stdout = new EventEmitter();
      versionProcess.stderr = new EventEmitter();
      mockSpawn.mockReturnValueOnce(versionProcess);
      setImmediate(() => {
        versionProcess.stdout.emit("data", "0.1.0\n");
        versionProcess.emit("close", 0);
      });

      // Mock actual command
      mockSpawn.mockReturnValueOnce(mockProcess);
      setImmediate(() => {
        mockProcess.stdout.emit("data", "{}");
        mockProcess.emit("close", 0);
      });

      await client.exec(["stats"]);

      const lastCall = mockSpawn.mock.calls[mockSpawn.mock.calls.length - 1];
      expect(lastCall[1]).toContain("--db");
      expect(lastCall[1]).toContain("/project/.sudocode/cache.db");
    });
  });
});
