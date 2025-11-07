/**
 * Unit tests for remote CLI command handlers
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initDatabase } from "../../../src/db.js";
import {
  handleRemoteAdd,
  handleRemoteList,
  handleRemoteShow,
  handleRemoteUpdate,
  handleRemoteRemove,
} from "../../../src/cli/remote-commands.js";
import type Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("Remote CLI Commands", () => {
  let db: Database.Database;
  let tempDir: string;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let processExitSpy: any;

  beforeEach(() => {
    db = initDatabase({ path: ":memory:" });
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sudocode-test-"));

    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    processExitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe("handleRemoteAdd", () => {
    it("should add a remote repository with minimal options", async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: false };
      const options = {
        trustLevel: "untrusted",
        addedBy: "test-user",
        autoSync: "false",
        syncInterval: "60",
      };

      await handleRemoteAdd(ctx, "github.com/org/repo", options);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("✓ Added remote repository"),
        expect.stringContaining("github.com/org/repo")
      );
    });

    it("should add a remote with all options", async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: false };
      const options = {
        displayName: "Test Repo",
        trustLevel: "verified",
        restEndpoint: "http://localhost:3000/api/v1",
        wsEndpoint: "ws://localhost:3000",
        gitUrl: "https://github.com/org/repo.git",
        description: "Test repository",
        autoSync: "true",
        syncInterval: "30",
        addedBy: "test-user",
      };

      await handleRemoteAdd(ctx, "github.com/org/repo", options);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("✓ Added remote repository"),
        expect.stringContaining("github.com/org/repo")
      );
    });

    it("should output JSON when jsonOutput is true", async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: true };
      const options = {
        trustLevel: "untrusted",
        addedBy: "test-user",
        autoSync: "false",
        syncInterval: "60",
      };

      await handleRemoteAdd(ctx, "github.com/org/repo", options);

      const jsonOutput = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(jsonOutput);
      expect(parsed.url).toBe("github.com/org/repo");
    });

    it("should reject invalid trust level", async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: false };
      const options = {
        trustLevel: "invalid",
        addedBy: "test-user",
        autoSync: "false",
        syncInterval: "60",
      };

      await handleRemoteAdd(ctx, "github.com/org/repo", options);

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("✗ Failed to add remote repository")
      );
    });
  });

  describe("handleRemoteList", () => {
    beforeEach(async () => {
      // Add some test remotes
      const ctx = { db, outputDir: tempDir, jsonOutput: false };
      await handleRemoteAdd(ctx, "github.com/org/repo1", {
        displayName: "Repo 1",
        trustLevel: "trusted",
        addedBy: "test",
        autoSync: "false",
        syncInterval: "60",
      });
      consoleLogSpy.mockClear();

      await handleRemoteAdd(ctx, "github.com/org/repo2", {
        displayName: "Repo 2",
        trustLevel: "verified",
        addedBy: "test",
        autoSync: "false",
        syncInterval: "60",
      });
      consoleLogSpy.mockClear();
    });

    it("should list all remotes", async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: false };

      await handleRemoteList(ctx, {});

      const output = consoleLogSpy.mock.calls.flat().join(" ");
      expect(output).toContain("github.com/org/repo1");
      expect(output).toContain("github.com/org/repo2");
    });

    it("should filter by trust level", async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: false };

      await handleRemoteList(ctx, { trustLevel: "trusted" });

      const output = consoleLogSpy.mock.calls.flat().join(" ");
      expect(output).toContain("github.com/org/repo1");
      expect(output).not.toContain("github.com/org/repo2");
    });

    it("should output JSON when jsonOutput is true", async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: true };

      await handleRemoteList(ctx, {});

      const jsonOutput = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(jsonOutput);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(2);
    });

    it("should handle empty list", async () => {
      // Clear the database
      db.prepare("DELETE FROM remote_repos").run();
      consoleLogSpy.mockClear();

      const ctx = { db, outputDir: tempDir, jsonOutput: false };

      await handleRemoteList(ctx, {});

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("No remote repositories configured")
      );
    });
  });

  describe("handleRemoteShow", () => {
    beforeEach(async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: false };
      await handleRemoteAdd(ctx, "github.com/org/repo", {
        displayName: "Test Repo",
        trustLevel: "verified",
        description: "A test repository",
        restEndpoint: "http://localhost:3000/api/v1",
        addedBy: "test",
        autoSync: "true",
        syncInterval: "30",
      });
      consoleLogSpy.mockClear();
    });

    it("should show remote details", async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: false };

      await handleRemoteShow(ctx, "github.com/org/repo");

      const output = consoleLogSpy.mock.calls.flat().join(" ");
      expect(output).toContain("github.com/org/repo");
      expect(output).toContain("Test Repo");
      expect(output).toContain("verified");
      expect(output).toContain("http://localhost:3000/api/v1");
    });

    it("should output JSON when jsonOutput is true", async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: true };

      await handleRemoteShow(ctx, "github.com/org/repo");

      const jsonOutput = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(jsonOutput);
      expect(parsed.url).toBe("github.com/org/repo");
      expect(parsed.display_name).toBe("Test Repo");
    });

    it("should handle non-existent remote", async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: false };

      await handleRemoteShow(ctx, "github.com/org/nonexistent");

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("✗ Remote repository not found")
      );
    });
  });

  describe("handleRemoteUpdate", () => {
    beforeEach(async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: false };
      await handleRemoteAdd(ctx, "github.com/org/repo", {
        displayName: "Old Name",
        trustLevel: "untrusted",
        addedBy: "test",
        autoSync: "false",
        syncInterval: "60",
      });
      consoleLogSpy.mockClear();
    });

    it("should update remote display name", async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: false };

      await handleRemoteUpdate(ctx, "github.com/org/repo", {
        displayName: "New Name",
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("✓ Updated remote repository"),
        expect.stringContaining("github.com/org/repo")
      );
    });

    it("should update trust level", async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: false };

      await handleRemoteUpdate(ctx, "github.com/org/repo", {
        trustLevel: "verified",
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("✓ Updated remote repository"),
        expect.stringContaining("github.com/org/repo")
      );
    });

    it("should handle non-existent remote", async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: false };

      await handleRemoteUpdate(ctx, "github.com/org/nonexistent", {
        displayName: "New Name",
      });

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("✗ Failed to update remote repository")
      );
    });
  });

  describe("handleRemoteRemove", () => {
    beforeEach(async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: false };
      await handleRemoteAdd(ctx, "github.com/org/repo", {
        displayName: "Test Repo",
        trustLevel: "untrusted",
        addedBy: "test",
        autoSync: "false",
        syncInterval: "60",
      });
      consoleLogSpy.mockClear();
    });

    it("should remove remote", async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: false };

      await handleRemoteRemove(ctx, "github.com/org/repo");

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("✓ Removed remote repository"),
        expect.stringContaining("github.com/org/repo")
      );
    });

    it("should handle non-existent remote", async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: false };

      await handleRemoteRemove(ctx, "github.com/org/nonexistent");

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("✗ Remote repository not found")
      );
    });
  });
});
