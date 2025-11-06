/**
 * Tests for JSONL Diff Parser
 */

import { describe, it, beforeEach, afterEach, expect } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { JSONLDiffParser } from "../../../../src/execution/worktree/jsonl-diff-parser.js";
import type { Issue, Spec } from "@sudocode-ai/types";

describe("JSONLDiffParser", () => {
  let parser: JSONLDiffParser;
  let tempDir: string;

  beforeEach(() => {
    parser = new JSONLDiffParser();
    // Create a temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jsonl-diff-parser-test-"));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("parseJSONL", () => {
    it("should parse valid JSONL file", () => {
      const filePath = path.join(tempDir, "test.jsonl");
      const issue1: Issue = {
        id: "ISSUE-001",
        uuid: "uuid-001",
        title: "Test Issue 1",
        content: "Content 1",
        status: "open",
        priority: 2,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };
      const issue2: Issue = {
        id: "ISSUE-002",
        uuid: "uuid-002",
        title: "Test Issue 2",
        content: "Content 2",
        status: "closed",
        priority: 1,
        created_at: "2025-01-02T00:00:00Z",
        updated_at: "2025-01-02T00:00:00Z",
      };

      fs.writeFileSync(
        filePath,
        JSON.stringify(issue1) + "\n" + JSON.stringify(issue2) + "\n"
      );

      const entities = parser.parseJSONL(filePath);

      expect(entities.size).toBe(2);
      expect(entities.get("ISSUE-001")).toEqual(issue1);
      expect(entities.get("ISSUE-002")).toEqual(issue2);
    });

    it("should handle empty file", () => {
      const filePath = path.join(tempDir, "empty.jsonl");
      fs.writeFileSync(filePath, "");

      const entities = parser.parseJSONL(filePath);

      expect(entities.size).toBe(0);
    });

    it("should handle non-existent file", () => {
      const filePath = path.join(tempDir, "non-existent.jsonl");

      const entities = parser.parseJSONL(filePath);

      expect(entities.size).toBe(0);
    });

    it("should skip invalid JSON lines", () => {
      const filePath = path.join(tempDir, "invalid.jsonl");
      const validIssue: Issue = {
        id: "ISSUE-001",
        uuid: "uuid-001",
        title: "Valid Issue",
        content: "Content",
        status: "open",
        priority: 2,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };

      fs.writeFileSync(
        filePath,
        JSON.stringify(validIssue) +
          "\n" +
          "invalid json line" +
          "\n" +
          JSON.stringify(validIssue).replace("ISSUE-001", "ISSUE-002") +
          "\n"
      );

      const entities = parser.parseJSONL(filePath);

      // Should only parse valid lines
      expect(entities.size).toBe(2);
    });

    it("should skip entities without id field", () => {
      const filePath = path.join(tempDir, "no-id.jsonl");

      fs.writeFileSync(
        filePath,
        JSON.stringify({ title: "No ID", content: "No ID" }) + "\n"
      );

      const entities = parser.parseJSONL(filePath);

      expect(entities.size).toBe(0);
    });
  });

  describe("computeDiff", () => {
    it("should detect created entities", () => {
      const oldEntities = new Map<string, Issue>();
      const newEntities = new Map<string, Issue>();

      const issue: Issue = {
        id: "ISSUE-001",
        uuid: "uuid-001",
        title: "New Issue",
        content: "New content",
        status: "open",
        priority: 2,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };

      newEntities.set("ISSUE-001", issue);

      const events = parser.computeDiff("issue", oldEntities, newEntities);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("issue_created");
      expect(events[0].entityId).toBe("ISSUE-001");
      expect(events[0].oldValue).toBeNull();
      expect(events[0].newValue).toEqual(issue);
    });

    it("should detect updated entities", () => {
      const oldIssue: Issue = {
        id: "ISSUE-001",
        uuid: "uuid-001",
        title: "Old Title",
        content: "Old content",
        status: "open",
        priority: 2,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };

      const newIssue: Issue = {
        ...oldIssue,
        title: "Updated Title",
        content: "Updated content",
        status: "in_progress",
        updated_at: "2025-01-02T00:00:00Z",
      };

      const oldEntities = new Map([["ISSUE-001", oldIssue]]);
      const newEntities = new Map([["ISSUE-001", newIssue]]);

      const events = parser.computeDiff("issue", oldEntities, newEntities);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("issue_updated");
      expect(events[0].entityId).toBe("ISSUE-001");
      expect(events[0].oldValue).toEqual(oldIssue);
      expect(events[0].newValue).toEqual(newIssue);
      expect(events[0].delta).toBeDefined();
      expect(events[0].delta?.title).toBe("Updated Title");
      expect(events[0].delta?.status).toBe("in_progress");
    });

    it("should detect deleted entities", () => {
      const oldIssue: Issue = {
        id: "ISSUE-001",
        uuid: "uuid-001",
        title: "Deleted Issue",
        content: "To be deleted",
        status: "open",
        priority: 2,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };

      const oldEntities = new Map([["ISSUE-001", oldIssue]]);
      const newEntities = new Map<string, Issue>();

      const events = parser.computeDiff("issue", oldEntities, newEntities);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("issue_deleted");
      expect(events[0].entityId).toBe("ISSUE-001");
      expect(events[0].oldValue).toEqual(oldIssue);
      expect(events[0].newValue).toBeNull();
    });

    it("should detect multiple types of changes", () => {
      const oldIssue1: Issue = {
        id: "ISSUE-001",
        uuid: "uuid-001",
        title: "Issue 1",
        content: "Content 1",
        status: "open",
        priority: 2,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };

      const oldIssue2: Issue = {
        id: "ISSUE-002",
        uuid: "uuid-002",
        title: "Issue 2 Old",
        content: "Content 2",
        status: "open",
        priority: 2,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };

      const updatedIssue2: Issue = {
        ...oldIssue2,
        title: "Issue 2 Updated",
        updated_at: "2025-01-02T00:00:00Z",
      };

      const newIssue3: Issue = {
        id: "ISSUE-003",
        uuid: "uuid-003",
        title: "Issue 3 New",
        content: "Content 3",
        status: "open",
        priority: 2,
        created_at: "2025-01-03T00:00:00Z",
        updated_at: "2025-01-03T00:00:00Z",
      };

      const oldEntities = new Map([
        ["ISSUE-001", oldIssue1],
        ["ISSUE-002", oldIssue2],
      ]);

      const newEntities = new Map([
        ["ISSUE-002", updatedIssue2],
        ["ISSUE-003", newIssue3],
      ]);

      const events = parser.computeDiff("issue", oldEntities, newEntities);

      expect(events).toHaveLength(3);

      // Check for update
      const updateEvent = events.find((e) => e.type === "issue_updated");
      expect(updateEvent).toBeDefined();
      expect(updateEvent?.entityId).toBe("ISSUE-002");

      // Check for create
      const createEvent = events.find((e) => e.type === "issue_created");
      expect(createEvent).toBeDefined();
      expect(createEvent?.entityId).toBe("ISSUE-003");

      // Check for delete
      const deleteEvent = events.find((e) => e.type === "issue_deleted");
      expect(deleteEvent).toBeDefined();
      expect(deleteEvent?.entityId).toBe("ISSUE-001");
    });

    it("should not generate events for unchanged entities", () => {
      const issue: Issue = {
        id: "ISSUE-001",
        uuid: "uuid-001",
        title: "Unchanged",
        content: "Same content",
        status: "open",
        priority: 2,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };

      const oldEntities = new Map([["ISSUE-001", issue]]);
      const newEntities = new Map([["ISSUE-001", issue]]);

      const events = parser.computeDiff("issue", oldEntities, newEntities);

      expect(events).toHaveLength(0);
    });
  });

  describe("computeDelta", () => {
    it("should return only changed fields", () => {
      const oldIssue: Issue = {
        id: "ISSUE-001",
        uuid: "uuid-001",
        title: "Old Title",
        content: "Old content",
        status: "open",
        priority: 2,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };

      const newIssue: Issue = {
        ...oldIssue,
        title: "New Title",
        status: "in_progress",
        updated_at: "2025-01-02T00:00:00Z",
      };

      const delta = parser.computeDelta(oldIssue, newIssue);

      expect(delta).toHaveProperty("title", "New Title");
      expect(delta).toHaveProperty("status", "in_progress");
      expect(delta).toHaveProperty("updated_at", "2025-01-02T00:00:00Z");
      expect(delta).not.toHaveProperty("content");
      expect(delta).not.toHaveProperty("priority");
    });

    it("should return empty object for identical entities", () => {
      const issue: Issue = {
        id: "ISSUE-001",
        uuid: "uuid-001",
        title: "Title",
        content: "Content",
        status: "open",
        priority: 2,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };

      const delta = parser.computeDelta(issue, issue);

      expect(Object.keys(delta)).toHaveLength(0);
    });
  });

  describe("createSnapshotEvents", () => {
    it("should create snapshot events for all entities", () => {
      const issue1: Issue = {
        id: "ISSUE-001",
        uuid: "uuid-001",
        title: "Issue 1",
        content: "Content 1",
        status: "open",
        priority: 2,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };

      const issue2: Issue = {
        id: "ISSUE-002",
        uuid: "uuid-002",
        title: "Issue 2",
        content: "Content 2",
        status: "closed",
        priority: 1,
        created_at: "2025-01-02T00:00:00Z",
        updated_at: "2025-01-02T00:00:00Z",
      };

      const entities = new Map([
        ["ISSUE-001", issue1],
        ["ISSUE-002", issue2],
      ]);

      const events = parser.createSnapshotEvents("issue", entities);

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe("issue_created");
      expect(events[0].metadata?.isSnapshot).toBe(true);
      expect(events[1].type).toBe("issue_created");
      expect(events[1].metadata?.isSnapshot).toBe(true);
    });

    it("should return empty array for empty map", () => {
      const entities = new Map<string, Issue>();
      const events = parser.createSnapshotEvents("issue", entities);

      expect(events).toHaveLength(0);
    });
  });

  describe("parseDirectory", () => {
    it("should parse both issues.jsonl and specs.jsonl", () => {
      const issue: Issue = {
        id: "ISSUE-001",
        uuid: "uuid-001",
        title: "Test Issue",
        content: "Content",
        status: "open",
        priority: 2,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };

      const spec: Spec = {
        id: "SPEC-001",
        uuid: "uuid-001",
        title: "Test Spec",
        content: "Spec content",
        file_path: "spec.md",
        priority: 2,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };

      fs.writeFileSync(
        path.join(tempDir, "issues.jsonl"),
        JSON.stringify(issue) + "\n"
      );
      fs.writeFileSync(
        path.join(tempDir, "specs.jsonl"),
        JSON.stringify(spec) + "\n"
      );

      const result = parser.parseDirectory(tempDir);

      expect(result.issues.size).toBe(1);
      expect(result.specs.size).toBe(1);
      expect(result.issues.get("ISSUE-001")).toEqual(issue);
      expect(result.specs.get("SPEC-001")).toEqual(spec);
    });

    it("should handle missing files gracefully", () => {
      const result = parser.parseDirectory(tempDir);

      expect(result.issues.size).toBe(0);
      expect(result.specs.size).toBe(0);
    });
  });
});
