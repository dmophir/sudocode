/**
 * Unit tests for Request Approval Service
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type Database from "better-sqlite3";
import { initDatabase } from "../../../src/services/db.js";
import {
  getRequest,
  listPendingRequests,
  listRequests,
  approveRequest,
  rejectRequest,
  completeRequest,
  failRequest,
} from "../../../src/services/requestApproval.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("RequestApproval Service", () => {
  let db: Database.Database;
  let testDbPath: string;
  let testDir: string;
  let testRequestId: string;

  beforeAll(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "sudocode-test-request-"));
    testDbPath = path.join(testDir, "cache.db");
    db = initDatabase({ path: testDbPath });

    // Create test request
    testRequestId = "req-test-123";
    db.prepare(
      `
      INSERT INTO cross_repo_requests (
        request_id, direction, from_repo, to_repo,
        request_type, payload, status,
        requires_approval, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      testRequestId,
      "incoming",
      "github.com/org/remote",
      "github.com/org/local",
      "create_issue",
      JSON.stringify({ title: "Test Issue", priority: 2 }),
      "pending",
      1,
      new Date().toISOString(),
      new Date().toISOString()
    );
  });

  afterAll(() => {
    db.close();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe("getRequest", () => {
    it("should get existing request", () => {
      const request = getRequest(db, testRequestId);
      expect(request).toBeDefined();
      expect(request!.request_id).toBe(testRequestId);
      expect(request!.status).toBe("pending");
      expect(request!.requires_approval).toBe(true);
    });

    it("should return undefined for non-existent request", () => {
      const request = getRequest(db, "req-nonexistent");
      expect(request).toBeUndefined();
    });
  });

  describe("listPendingRequests", () => {
    it("should list pending requests", () => {
      const requests = listPendingRequests(db);
      expect(requests.length).toBeGreaterThan(0);
      expect(requests.every((r) => r.status === "pending")).toBe(true);
    });

    it("should filter by direction", () => {
      const requests = listPendingRequests(db, "incoming");
      expect(requests.every((r) => r.direction === "incoming")).toBe(true);
    });
  });

  describe("listRequests", () => {
    it("should list all requests", () => {
      const requests = listRequests(db);
      expect(requests.length).toBeGreaterThan(0);
    });

    it("should filter by status", () => {
      const requests = listRequests(db, { status: "pending" });
      expect(requests.every((r) => r.status === "pending")).toBe(true);
    });

    it("should filter by direction", () => {
      const requests = listRequests(db, { direction: "incoming" });
      expect(requests.every((r) => r.direction === "incoming")).toBe(true);
    });

    it("should filter by from_repo", () => {
      const requests = listRequests(db, { from_repo: "github.com/org/remote" });
      expect(requests.every((r) => r.from_repo === "github.com/org/remote")).toBe(true);
    });

    it("should limit results", () => {
      const requests = listRequests(db, { limit: 1 });
      expect(requests.length).toBeLessThanOrEqual(1);
    });
  });

  describe("approveRequest", () => {
    it("should approve pending request", () => {
      const request = approveRequest(db, testRequestId, "test-approver");
      expect(request.status).toBe("approved");
      expect(request.approved_by).toBe("test-approver");
      expect(request.approved_at).toBeDefined();
    });

    it("should throw for non-existent request", () => {
      expect(() =>
        approveRequest(db, "req-nonexistent", "test-approver")
      ).toThrow("not found");
    });

    it("should throw for non-pending request", () => {
      // Request is already approved from previous test
      expect(() =>
        approveRequest(db, testRequestId, "test-approver")
      ).toThrow("not pending");
    });
  });

  describe("rejectRequest", () => {
    let rejectTestId: string;

    beforeAll(() => {
      // Create another test request for rejection
      rejectTestId = "req-test-reject";
      db.prepare(
        `
        INSERT INTO cross_repo_requests (
          request_id, direction, from_repo, to_repo,
          request_type, payload, status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        rejectTestId,
        "incoming",
        "github.com/org/remote",
        "github.com/org/local",
        "create_issue",
        JSON.stringify({ title: "Test Issue" }),
        "pending",
        new Date().toISOString(),
        new Date().toISOString()
      );
    });

    it("should reject pending request", () => {
      const request = rejectRequest(db, rejectTestId, "Out of scope");
      expect(request.status).toBe("rejected");
      expect(request.rejection_reason).toBe("Out of scope");
      expect(request.completed_at).toBeDefined();
    });

    it("should throw for non-existent request", () => {
      expect(() =>
        rejectRequest(db, "req-nonexistent", "reason")
      ).toThrow("not found");
    });

    it("should throw for non-pending request", () => {
      expect(() =>
        rejectRequest(db, rejectTestId, "reason")
      ).toThrow("not pending");
    });
  });

  describe("completeRequest", () => {
    let completeTestId: string;

    beforeAll(() => {
      // Create and approve a request
      completeTestId = "req-test-complete";
      db.prepare(
        `
        INSERT INTO cross_repo_requests (
          request_id, direction, from_repo, to_repo,
          request_type, payload, status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        completeTestId,
        "incoming",
        "github.com/org/remote",
        "github.com/org/local",
        "create_issue",
        JSON.stringify({ title: "Test Issue" }),
        "approved",
        new Date().toISOString(),
        new Date().toISOString()
      );
    });

    it("should complete request with result", () => {
      const result = { id: "issue-123", uuid: "uuid-123" };
      const request = completeRequest(db, completeTestId, result);
      expect(request.status).toBe("completed");
      expect(request.result).toBeDefined();
      expect(JSON.parse(request.result!)).toEqual(result);
      expect(request.completed_at).toBeDefined();
    });
  });

  describe("failRequest", () => {
    let failTestId: string;

    beforeAll(() => {
      failTestId = "req-test-fail";
      db.prepare(
        `
        INSERT INTO cross_repo_requests (
          request_id, direction, from_repo, to_repo,
          request_type, payload, status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        failTestId,
        "outgoing",
        "github.com/org/local",
        "github.com/org/remote",
        "create_issue",
        JSON.stringify({ title: "Test Issue" }),
        "pending",
        new Date().toISOString(),
        new Date().toISOString()
      );
    });

    it("should fail request with error", () => {
      const request = failRequest(db, failTestId, "Network error");
      expect(request.status).toBe("failed");
      expect(request.result).toBeDefined();
      expect(JSON.parse(request.result!)).toEqual({ error: "Network error" });
      expect(request.completed_at).toBeDefined();
    });
  });
});
