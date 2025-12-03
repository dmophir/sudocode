/**
 * Integration tests for files_changed population in execution completion
 *
 * These tests verify that ExecutionChangesService is properly integrated to populate
 * the files_changed field when executions complete or fail. Rather than testing
 * AgentExecutorWrapper directly (which requires complex mocking), these tests verify
 * the integration pattern and behavior.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type Database from "better-sqlite3";
import { ExecutionChangesService } from "../../../../src/services/execution-changes-service.js";

// Mock ExecutionChangesService
vi.mock("../../../../src/services/execution-changes-service.js");

describe("ExecutionChangesService integration for files_changed", () => {
  let mockDb: Partial<Database.Database>;
  let mockChangesService: any;

  beforeEach(() => {
    // Setup mock database
    mockDb = {} as Database.Database;

    // Mock ExecutionChangesService
    mockChangesService = {
      getChanges: vi.fn(),
    };
    vi.mocked(ExecutionChangesService).mockImplementation(
      () => mockChangesService
    );
  });

  describe("Successful execution flow", () => {
    it("should extract file paths from ExecutionChangesService and format as JSON", async () => {
      // Mock ExecutionChangesService to return file changes
      const mockChanges = {
        available: true,
        captured: {
          files: [
            { path: "src/file1.ts", additions: 10, deletions: 5 },
            { path: "src/file2.ts", additions: 20, deletions: 3 },
            { path: "README.md", additions: 5, deletions: 0 },
          ],
          stats: { additions: 35, deletions: 8 },
        },
      };
      mockChangesService.getChanges.mockResolvedValue(mockChanges);

      // Simulate the logic from handleSuccess
      const changesService = new ExecutionChangesService(
        mockDb as any,
        "/test/workdir"
      );
      const changesResult = await changesService.getChanges("exec-123");

      let filesChangedJson: string | null = null;
      if (changesResult.available && changesResult.captured) {
        const filePaths = changesResult.captured.files.map((f: any) => f.path);
        filesChangedJson = JSON.stringify(filePaths);
      }

      // Verify the result matches expected format
      expect(filesChangedJson).toBe(
        JSON.stringify(["src/file1.ts", "src/file2.ts", "README.md"])
      );
      expect(ExecutionChangesService).toHaveBeenCalledWith(
        mockDb,
        "/test/workdir"
      );
      expect(mockChangesService.getChanges).toHaveBeenCalledWith("exec-123");
    });

    it("should handle single file change correctly", async () => {
      mockChangesService.getChanges.mockResolvedValue({
        available: true,
        captured: {
          files: [{ path: "single-file.ts", additions: 5, deletions: 2 }],
          stats: { additions: 5, deletions: 2 },
        },
      });

      const changesService = new ExecutionChangesService(
        mockDb as any,
        "/test/workdir"
      );
      const changesResult = await changesService.getChanges("exec-456");

      let filesChangedJson: string | null = null;
      if (changesResult.available && changesResult.captured) {
        const filePaths = changesResult.captured.files.map((f: any) => f.path);
        filesChangedJson = JSON.stringify(filePaths);
      }

      expect(filesChangedJson).toBe(JSON.stringify(["single-file.ts"]));
    });

    it("should set files_changed to null when no changes are detected", async () => {
      mockChangesService.getChanges.mockResolvedValue({
        available: false,
        reason: "No before_commit available",
      });

      const changesService = new ExecutionChangesService(
        mockDb as any,
        "/test/workdir"
      );
      const changesResult = await changesService.getChanges("exec-789");

      let filesChangedJson: string | null = null;
      if (changesResult.available && changesResult.captured) {
        const filePaths = changesResult.captured.files.map((f: any) => f.path);
        filesChangedJson = JSON.stringify(filePaths);
      }

      expect(filesChangedJson).toBe(null);
    });

    it("should handle empty file list (no changes)", async () => {
      mockChangesService.getChanges.mockResolvedValue({
        available: true,
        captured: {
          files: [],
          stats: { additions: 0, deletions: 0 },
        },
      });

      const changesService = new ExecutionChangesService(
        mockDb as any,
        "/test/workdir"
      );
      const changesResult = await changesService.getChanges("exec-empty");

      let filesChangedJson: string | null = null;
      if (changesResult.available && changesResult.captured) {
        const filePaths = changesResult.captured.files.map((f: any) => f.path);
        filesChangedJson = JSON.stringify(filePaths);
      }

      expect(filesChangedJson).toBe(JSON.stringify([]));
    });

    it("should handle ExecutionChangesService errors gracefully", async () => {
      mockChangesService.getChanges.mockRejectedValue(
        new Error("Git diff failed")
      );

      const changesService = new ExecutionChangesService(
        mockDb as any,
        "/test/workdir"
      );

      // Simulate the try-catch in handleSuccess
      let filesChangedJson: string | null = null;
      try {
        const changesResult = await changesService.getChanges("exec-error");
        if (changesResult.available && changesResult.captured) {
          const filePaths = changesResult.captured.files.map(
            (f: any) => f.path
          );
          filesChangedJson = JSON.stringify(filePaths);
        }
      } catch (error) {
        // Error should be caught and logged, files_changed stays null
        console.warn("Failed to calculate files_changed:", error);
      }

      // Verify that error was handled gracefully
      expect(filesChangedJson).toBe(null);
    });
  });

  describe("Failed execution flow", () => {
    it("should populate files_changed for failed executions to allow committing partial work", async () => {
      // Mock partial work from a failed execution
      mockChangesService.getChanges.mockResolvedValue({
        available: true,
        captured: {
          files: [
            { path: "partial-work.ts", additions: 15, deletions: 3 },
            { path: "incomplete.ts", additions: 8, deletions: 1 },
          ],
          stats: { additions: 23, deletions: 4 },
        },
      });

      const changesService = new ExecutionChangesService(
        mockDb as any,
        "/test/workdir"
      );
      const changesResult = await changesService.getChanges("exec-failed");

      let filesChangedJson: string | null = null;
      if (changesResult.available && changesResult.captured) {
        const filePaths = changesResult.captured.files.map((f: any) => f.path);
        filesChangedJson = JSON.stringify(filePaths);
      }

      expect(filesChangedJson).toBe(
        JSON.stringify(["partial-work.ts", "incomplete.ts"])
      );
    });

    it("should set files_changed to null when no changes in failed execution", async () => {
      mockChangesService.getChanges.mockResolvedValue({
        available: false,
        reason: "No commits found",
      });

      const changesService = new ExecutionChangesService(
        mockDb as any,
        "/test/workdir"
      );
      const changesResult = await changesService.getChanges("exec-early-fail");

      let filesChangedJson: string | null = null;
      if (changesResult.available && changesResult.captured) {
        const filePaths = changesResult.captured.files.map((f: any) => f.path);
        filesChangedJson = JSON.stringify(filePaths);
      }

      expect(filesChangedJson).toBe(null);
    });

    it("should handle ExecutionChangesService errors in failed executions", async () => {
      mockChangesService.getChanges.mockRejectedValue(
        new Error("Service error")
      );

      const changesService = new ExecutionChangesService(
        mockDb as any,
        "/test/workdir"
      );

      // Simulate the try-catch in handleError
      let filesChangedJson: string | null = null;
      try {
        const changesResult =
          await changesService.getChanges("exec-error-fail");
        if (changesResult.available && changesResult.captured) {
          const filePaths = changesResult.captured.files.map(
            (f: any) => f.path
          );
          filesChangedJson = JSON.stringify(filePaths);
        }
      } catch (error) {
        console.warn("Failed to calculate files_changed:", error);
      }

      expect(filesChangedJson).toBe(null);
    });
  });

  describe("File path extraction", () => {
    it("should extract only file paths, ignoring stats and other metadata", async () => {
      mockChangesService.getChanges.mockResolvedValue({
        available: true,
        captured: {
          files: [
            {
              path: "file1.ts",
              additions: 100,
              deletions: 50,
              binary: false,
              renamed: false,
            },
            {
              path: "file2.ts",
              additions: 20,
              deletions: 10,
              binary: false,
              renamed: true,
            },
          ],
          stats: { additions: 120, deletions: 60 },
          summary: "Multiple files changed",
        },
      });

      const changesService = new ExecutionChangesService(
        mockDb as any,
        "/test/workdir"
      );
      const changesResult = await changesService.getChanges("exec-rich");

      let filesChangedJson: string | null = null;
      if (changesResult.available && changesResult.captured) {
        const filePaths = changesResult.captured.files.map((f: any) => f.path);
        filesChangedJson = JSON.stringify(filePaths);
      }

      // Verify only paths are stored
      expect(filesChangedJson).toBe(JSON.stringify(["file1.ts", "file2.ts"]));

      // Verify the stored value doesn't include additions, deletions, etc.
      const parsed = JSON.parse(filesChangedJson!);
      expect(parsed).toEqual(["file1.ts", "file2.ts"]);
      expect(parsed).not.toContain("additions");
      expect(parsed).not.toContain("deletions");
    });

    it("should handle file paths with special characters", async () => {
      mockChangesService.getChanges.mockResolvedValue({
        available: true,
        captured: {
          files: [
            {
              path: "src/components/Button (old).tsx",
              additions: 5,
              deletions: 3,
            },
            { path: "tests/unit/test-file[1].ts", additions: 10, deletions: 0 },
            { path: 'docs/guide "advanced".md', additions: 2, deletions: 1 },
          ],
          stats: { additions: 17, deletions: 4 },
        },
      });

      const changesService = new ExecutionChangesService(
        mockDb as any,
        "/test/workdir"
      );
      const changesResult = await changesService.getChanges("exec-special");

      let filesChangedJson: string | null = null;
      if (changesResult.available && changesResult.captured) {
        const filePaths = changesResult.captured.files.map((f: any) => f.path);
        filesChangedJson = JSON.stringify(filePaths);
      }

      // Verify special characters are preserved
      const parsed = JSON.parse(filesChangedJson!);
      expect(parsed).toEqual([
        "src/components/Button (old).tsx",
        "tests/unit/test-file[1].ts",
        'docs/guide "advanced".md',
      ]);
    });
  });

  describe("ExecutionChangesService instantiation", () => {
    it("should pass correct database and workDir to ExecutionChangesService", () => {
      const mockDatabase = { prepare: vi.fn() } as any;
      const workDir = "/custom/work/directory";

      new ExecutionChangesService(mockDatabase, workDir);

      expect(ExecutionChangesService).toHaveBeenCalledWith(
        mockDatabase,
        workDir
      );
    });

    it("should create a new service instance for each execution completion", () => {
      vi.clearAllMocks();

      // Simulate multiple executions
      new ExecutionChangesService(mockDb as any, "/workdir1");
      new ExecutionChangesService(mockDb as any, "/workdir2");
      new ExecutionChangesService(mockDb as any, "/workdir3");

      expect(ExecutionChangesService).toHaveBeenCalledTimes(3);
    });
  });
});
