/**
 * Unit tests for request CLI command handlers
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initDatabase } from "../../../src/db.js";
import {
  handleRequestPending,
  handleRequestList,
  handleRequestShow,
  handleRequestApprove,
  handleRequestReject,
} from "../../../src/cli/request-commands.js";
import type Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("Request CLI Commands", () => {
  let db: Database.Database;
  let tempDir: string;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let processExitSpy: any;
  let testRequestId: string;

  beforeEach(() => {
    db = initDatabase({ path: ":memory:" });
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sudocode-test-"));

    // Add a test remote repo
    db.prepare(`
      INSERT INTO remote_repos (
        url, display_name, trust_level, rest_endpoint,
        added_at, added_by, auto_sync, sync_interval_minutes, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "github.com/org/remote",
      "Remote Repo",
      "verified",
      "http://remote.dev/api/v1",
      new Date().toISOString(),
      "test",
      0,
      60,
      "unknown"
    );

    // Add a test request
    testRequestId = "req-test-123";
    db.prepare(`
      INSERT INTO cross_repo_requests (
        request_id, direction, from_repo, to_repo,
        request_type, payload, status,
        requires_approval, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      testRequestId,
      "incoming",
      "github.com/org/remote",
      "local",
      "create_issue",
      JSON.stringify({ title: "Test Issue", priority: 2 }),
      "pending",
      1,
      new Date().toISOString(),
      new Date().toISOString()
    );

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

  describe("handleRequestPending", () => {
    it("should list pending requests", async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: false };

      await handleRequestPending(ctx, {});

      const output = consoleLogSpy.mock.calls.flat().join(" ");
      expect(output).toContain(testRequestId);
      expect(output).toContain("incoming");
    });

    it("should filter by direction", async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: false };

      await handleRequestPending(ctx, { direction: "incoming" });

      const output = consoleLogSpy.mock.calls.flat().join(" ");
      expect(output).toContain(testRequestId);
    });

    it("should output JSON when jsonOutput is true", async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: true };

      await handleRequestPending(ctx, {});

      const jsonOutput = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(jsonOutput);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
    });

    it("should handle no pending requests", async () => {
      // Update all requests to approved
      db.prepare("UPDATE cross_repo_requests SET status = ?").run("approved");
      consoleLogSpy.mockClear();

      const ctx = { db, outputDir: tempDir, jsonOutput: false };

      await handleRequestPending(ctx, {});

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("No pending requests")
      );
    });
  });

  describe("handleRequestList", () => {
    beforeEach(() => {
      // Add another request
      db.prepare(`
        INSERT INTO cross_repo_requests (
          request_id, direction, from_repo, to_repo,
          request_type, payload, status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "req-test-456",
        "outgoing",
        "local",
        "github.com/org/remote",
        "create_spec",
        JSON.stringify({ title: "Test Spec" }),
        "approved",
        new Date().toISOString(),
        new Date().toISOString()
      );
    });

    it("should list all requests", async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: false };

      await handleRequestList(ctx, {});

      const output = consoleLogSpy.mock.calls.flat().join(" ");
      expect(output).toContain(testRequestId);
      expect(output).toContain("req-test-456");
    });

    it("should filter by status", async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: false };

      await handleRequestList(ctx, { status: "pending" });

      const output = consoleLogSpy.mock.calls.flat().join(" ");
      expect(output).toContain(testRequestId);
      expect(output).not.toContain("req-test-456");
    });

    it("should filter by direction", async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: false };

      await handleRequestList(ctx, { direction: "incoming" });

      const output = consoleLogSpy.mock.calls.flat().join(" ");
      expect(output).toContain(testRequestId);
      expect(output).not.toContain("req-test-456");
    });

    it("should limit results", async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: true };

      await handleRequestList(ctx, { limit: "1" });

      const jsonOutput = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(jsonOutput);
      expect(parsed.length).toBe(1);
    });
  });

  describe("handleRequestShow", () => {
    it("should show request details", async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: false };

      await handleRequestShow(ctx, testRequestId);

      const output = consoleLogSpy.mock.calls.flat().join(" ");
      expect(output).toContain(testRequestId);
      expect(output).toContain("pending");
      expect(output).toContain("create_issue");
      expect(output).toContain("github.com/org/remote");
    });

    it("should output JSON when jsonOutput is true", async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: true };

      await handleRequestShow(ctx, testRequestId);

      const jsonOutput = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(jsonOutput);
      expect(parsed.request_id).toBe(testRequestId);
      expect(parsed.status).toBe("pending");
    });

    it("should handle non-existent request", async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: false };

      await handleRequestShow(ctx, "req-nonexistent");

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("✗ Request not found")
      );
    });
  });

  describe("handleRequestApprove", () => {
    beforeEach(() => {
      // Create config file for ID generation
      const config = {
        version: "1.0.0",
        id_prefix: {
          spec: "s",
          issue: "i",
        },
      };
      fs.writeFileSync(
        path.join(tempDir, "config.json"),
        JSON.stringify(config, null, 2)
      );
    });

    it("should approve pending request", async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: false };

      await handleRequestApprove(ctx, testRequestId, { approver: "test-user" });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("✓ Request approved and executed")
      );

      // Verify request was approved
      const request = db
        .prepare("SELECT * FROM cross_repo_requests WHERE request_id = ?")
        .get(testRequestId) as any;
      expect(request.status).toBe("completed");
      expect(request.approved_by).toBe("test-user");
    });

    it("should create the requested issue", async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: false };

      await handleRequestApprove(ctx, testRequestId, { approver: "test-user" });

      // Verify issue was created
      const issues = db.prepare("SELECT * FROM issues").all();
      expect(issues.length).toBe(1);
    });

    it("should handle non-existent request", async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: false };

      await handleRequestApprove(ctx, "req-nonexistent", {
        approver: "test-user",
      });

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("✗ Failed to approve request")
      );
    });

    it("should reject outgoing requests", async () => {
      // Create outgoing request
      const outgoingId = "req-outgoing";
      db.prepare(`
        INSERT INTO cross_repo_requests (
          request_id, direction, from_repo, to_repo,
          request_type, payload, status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        outgoingId,
        "outgoing",
        "local",
        "github.com/org/remote",
        "create_issue",
        JSON.stringify({ title: "Test" }),
        "pending",
        new Date().toISOString(),
        new Date().toISOString()
      );

      const ctx = { db, outputDir: tempDir, jsonOutput: false };

      await handleRequestApprove(ctx, outgoingId, { approver: "test-user" });

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Can only approve incoming requests")
      );
    });
  });

  describe("handleRequestReject", () => {
    it("should reject pending request", async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: false };

      await handleRequestReject(ctx, testRequestId, {
        reason: "Out of scope",
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("✓ Request rejected")
      );

      // Verify request was rejected
      const request = db
        .prepare("SELECT * FROM cross_repo_requests WHERE request_id = ?")
        .get(testRequestId) as any;
      expect(request.status).toBe("rejected");
      expect(request.rejection_reason).toBe("Out of scope");
    });

    it("should handle non-existent request", async () => {
      const ctx = { db, outputDir: tempDir, jsonOutput: false };

      await handleRequestReject(ctx, "req-nonexistent", {
        reason: "Test reason",
      });

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("✗ Failed to reject request")
      );
    });
  });
});
