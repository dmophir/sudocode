/**
 * Unit tests for ProvisionalStateManager
 *
 * Tests the computation of provisional state by applying mutation events
 * on top of base repository state.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { ProvisionalStateManager } from "../../../../src/execution/worktree/provisional-state-manager";
import { WorktreeMutationEventBuffer } from "../../../../src/execution/worktree/mutation-event-buffer";
import type { Issue, Spec } from "@sudocode-ai/types";
import type { WorktreeMutationEvent } from "../../../../src/execution/worktree/types";
import { randomUUID } from "node:crypto";

// Mock the service imports
vi.mock("../../../../src/services/issues", () => ({
  getAllIssues: vi.fn(),
}));

vi.mock("../../../../src/services/specs", () => ({
  getAllSpecs: vi.fn(),
}));

vi.mock("../../../../src/services/executions", () => ({
  getExecution: vi.fn(),
}));

import { getAllIssues } from "../../../../src/services/issues";
import { getAllSpecs } from "../../../../src/services/specs";
import { getExecution } from "../../../../src/services/executions";

describe("ProvisionalStateManager", () => {
  let db: Database.Database;
  let eventBuffer: WorktreeMutationEventBuffer;
  let manager: ProvisionalStateManager;

  // Sample base data
  const baseIssue1: Issue = {
    id: "issue-1",
    title: "Base Issue 1",
    status: "open",
    description: "Base description",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };

  const baseIssue2: Issue = {
    id: "issue-2",
    title: "Base Issue 2",
    status: "in_progress",
    description: "Another base issue",
    created_at: "2024-01-02T00:00:00Z",
    updated_at: "2024-01-02T00:00:00Z",
  };

  const baseSpec1: Spec = {
    id: "spec-1",
    title: "Base Spec 1",
    status: "draft",
    description: "Base spec description",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };

  beforeEach(() => {
    // Create in-memory database
    db = new Database(":memory:");

    // Create event buffer
    eventBuffer = new WorktreeMutationEventBuffer();

    // Create manager
    manager = new ProvisionalStateManager(db, eventBuffer);

    // Setup default mocks
    vi.mocked(getAllIssues).mockReturnValue([baseIssue1, baseIssue2]);
    vi.mocked(getAllSpecs).mockReturnValue([baseSpec1]);
    vi.mocked(getExecution).mockReturnValue({
      id: "exec-001",
      issue_id: "issue-1",
      status: "running",
      started_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    } as any);
  });

  afterEach(() => {
    db.close();
    vi.clearAllMocks();
  });

  describe("computeProvisionalState", () => {
    it("should return base state when no events exist", () => {
      const executionId = "exec-001";

      const state = manager.computeProvisionalState(executionId);

      expect(state.base.issues).toHaveLength(2);
      expect(state.base.specs).toHaveLength(1);
      expect(state.provisional.issuesCreated).toHaveLength(0);
      expect(state.provisional.issuesUpdated).toHaveLength(0);
      expect(state.provisional.issuesDeleted).toHaveLength(0);
      expect(state.provisional.specsCreated).toHaveLength(0);
      expect(state.provisional.specsUpdated).toHaveLength(0);
      expect(state.provisional.specsDeleted).toHaveLength(0);
      expect(state.execution.id).toBe("exec-001");
      expect(state.computedAt).toBeGreaterThan(0);
    });

    it("should detect issue creation events", () => {
      const executionId = "exec-001";
      const newIssue: Issue = {
        id: "issue-new",
        title: "New Issue",
        status: "open",
        description: "Created in worktree",
        created_at: "2024-01-03T00:00:00Z",
        updated_at: "2024-01-03T00:00:00Z",
      };

      // Add creation event
      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "issue_created",
        entityType: "issue",
        entityId: newIssue.id,
        oldValue: null,
        newValue: newIssue,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      const state = manager.computeProvisionalState(executionId);

      expect(state.provisional.issuesCreated).toHaveLength(1);
      expect(state.provisional.issuesCreated[0]).toEqual(newIssue);
      expect(state.provisional.issuesUpdated).toHaveLength(0);
      expect(state.provisional.issuesDeleted).toHaveLength(0);
    });

    it("should detect issue update events", () => {
      const executionId = "exec-001";
      const updatedIssue: Issue = {
        ...baseIssue1,
        title: "Updated Title",
        status: "in_progress",
        updated_at: "2024-01-03T00:00:00Z",
      };

      // Add update event
      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "issue_updated",
        entityType: "issue",
        entityId: baseIssue1.id,
        oldValue: baseIssue1,
        newValue: updatedIssue,
        delta: { title: "Updated Title", status: "in_progress" },
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      const state = manager.computeProvisionalState(executionId);

      expect(state.provisional.issuesCreated).toHaveLength(0);
      expect(state.provisional.issuesUpdated).toHaveLength(1);
      expect(state.provisional.issuesUpdated[0].id).toBe(baseIssue1.id);
      expect(state.provisional.issuesUpdated[0].baseIssue).toEqual(baseIssue1);
      expect(state.provisional.issuesUpdated[0].updatedIssue).toEqual(updatedIssue);
      expect(state.provisional.issuesUpdated[0].delta).toEqual({
        title: "Updated Title",
        status: "in_progress",
      });
    });

    it("should detect issue deletion events", () => {
      const executionId = "exec-001";

      // Add deletion event
      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "issue_deleted",
        entityType: "issue",
        entityId: baseIssue1.id,
        oldValue: baseIssue1,
        newValue: null,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      const state = manager.computeProvisionalState(executionId);

      expect(state.provisional.issuesDeleted).toHaveLength(1);
      expect(state.provisional.issuesDeleted[0]).toBe(baseIssue1.id);
    });

    it("should detect spec creation events", () => {
      const executionId = "exec-001";
      const newSpec: Spec = {
        id: "spec-new",
        title: "New Spec",
        status: "draft",
        description: "Created in worktree",
        created_at: "2024-01-03T00:00:00Z",
        updated_at: "2024-01-03T00:00:00Z",
      };

      // Add creation event
      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "spec_created",
        entityType: "spec",
        entityId: newSpec.id,
        oldValue: null,
        newValue: newSpec,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      const state = manager.computeProvisionalState(executionId);

      expect(state.provisional.specsCreated).toHaveLength(1);
      expect(state.provisional.specsCreated[0]).toEqual(newSpec);
    });

    it("should detect spec update events", () => {
      const executionId = "exec-001";
      const updatedSpec: Spec = {
        ...baseSpec1,
        title: "Updated Spec Title",
        status: "active",
        updated_at: "2024-01-03T00:00:00Z",
      };

      // Add update event
      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "spec_updated",
        entityType: "spec",
        entityId: baseSpec1.id,
        oldValue: baseSpec1,
        newValue: updatedSpec,
        delta: { title: "Updated Spec Title", status: "active" },
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      const state = manager.computeProvisionalState(executionId);

      expect(state.provisional.specsUpdated).toHaveLength(1);
      expect(state.provisional.specsUpdated[0].id).toBe(baseSpec1.id);
      expect(state.provisional.specsUpdated[0].baseSpec).toEqual(baseSpec1);
      expect(state.provisional.specsUpdated[0].updatedSpec).toEqual(updatedSpec);
    });

    it("should detect spec deletion events", () => {
      const executionId = "exec-001";

      // Add deletion event
      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "spec_deleted",
        entityType: "spec",
        entityId: baseSpec1.id,
        oldValue: baseSpec1,
        newValue: null,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      const state = manager.computeProvisionalState(executionId);

      expect(state.provisional.specsDeleted).toHaveLength(1);
      expect(state.provisional.specsDeleted[0]).toBe(baseSpec1.id);
    });

    it("should handle mixed operations in sequence", () => {
      const executionId = "exec-001";
      const newIssue: Issue = {
        id: "issue-new",
        title: "New Issue",
        status: "open",
        description: "Created in worktree",
        created_at: "2024-01-03T00:00:00Z",
        updated_at: "2024-01-03T00:00:00Z",
      };
      const updatedIssue: Issue = {
        ...baseIssue2,
        status: "done",
      };

      // Add multiple events
      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "issue_created",
        entityType: "issue",
        entityId: newIssue.id,
        oldValue: null,
        newValue: newIssue,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "issue_updated",
        entityType: "issue",
        entityId: baseIssue2.id,
        oldValue: baseIssue2,
        newValue: updatedIssue,
        delta: { status: "done" },
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "issue_deleted",
        entityType: "issue",
        entityId: baseIssue1.id,
        oldValue: baseIssue1,
        newValue: null,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      const state = manager.computeProvisionalState(executionId);

      expect(state.provisional.issuesCreated).toHaveLength(1);
      expect(state.provisional.issuesUpdated).toHaveLength(1);
      expect(state.provisional.issuesDeleted).toHaveLength(1);
    });

    it("should handle execution not found", () => {
      const executionId = "exec-nonexistent";
      vi.mocked(getExecution).mockReturnValue(null);

      const state = manager.computeProvisionalState(executionId);

      expect(state.execution.id).toBe(executionId);
      expect(state.execution.issueId).toBeNull();
      expect(state.execution.status).toBe("unknown");
    });
  });

  describe("getMergedIssues", () => {
    it("should return base issues when no events", () => {
      const executionId = "exec-001";

      const merged = manager.getMergedIssues(executionId);

      expect(merged).toHaveLength(2);
      expect(merged[0].id).toBe("issue-1");
      expect(merged[1].id).toBe("issue-2");
    });

    it("should include created issues", () => {
      const executionId = "exec-001";
      const newIssue: Issue = {
        id: "issue-new",
        title: "New Issue",
        status: "open",
        description: "Created in worktree",
        created_at: "2024-01-03T00:00:00Z",
        updated_at: "2024-01-03T00:00:00Z",
      };

      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "issue_created",
        entityType: "issue",
        entityId: newIssue.id,
        oldValue: null,
        newValue: newIssue,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      const merged = manager.getMergedIssues(executionId);

      expect(merged).toHaveLength(3);
      expect(merged[2]).toEqual(newIssue);
    });

    it("should apply updates to base issues", () => {
      const executionId = "exec-001";
      const updatedIssue: Issue = {
        ...baseIssue1,
        title: "Updated Title",
        status: "done",
      };

      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "issue_updated",
        entityType: "issue",
        entityId: baseIssue1.id,
        oldValue: baseIssue1,
        newValue: updatedIssue,
        delta: { title: "Updated Title", status: "done" },
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      const merged = manager.getMergedIssues(executionId);

      expect(merged).toHaveLength(2);
      expect(merged[0].title).toBe("Updated Title");
      expect(merged[0].status).toBe("done");
    });

    it("should exclude deleted issues", () => {
      const executionId = "exec-001";

      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "issue_deleted",
        entityType: "issue",
        entityId: baseIssue1.id,
        oldValue: baseIssue1,
        newValue: null,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      const merged = manager.getMergedIssues(executionId);

      expect(merged).toHaveLength(1);
      expect(merged[0].id).toBe("issue-2");
    });

    it("should handle complex merge scenario", () => {
      const executionId = "exec-001";
      const newIssue: Issue = {
        id: "issue-new",
        title: "New Issue",
        status: "open",
        description: "Created",
        created_at: "2024-01-03T00:00:00Z",
        updated_at: "2024-01-03T00:00:00Z",
      };
      const updatedIssue: Issue = {
        ...baseIssue2,
        status: "done",
      };

      // Create, update, and delete
      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "issue_created",
        entityType: "issue",
        entityId: newIssue.id,
        oldValue: null,
        newValue: newIssue,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "issue_updated",
        entityType: "issue",
        entityId: baseIssue2.id,
        oldValue: baseIssue2,
        newValue: updatedIssue,
        delta: { status: "done" },
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "issue_deleted",
        entityType: "issue",
        entityId: baseIssue1.id,
        oldValue: baseIssue1,
        newValue: null,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      const merged = manager.getMergedIssues(executionId);

      // Should have: baseIssue2 (updated) + newIssue
      // baseIssue1 deleted
      expect(merged).toHaveLength(2);
      expect(merged[0].id).toBe("issue-2");
      expect(merged[0].status).toBe("done");
      expect(merged[1].id).toBe("issue-new");
    });
  });

  describe("getMergedSpecs", () => {
    it("should return base specs when no events", () => {
      const executionId = "exec-001";

      const merged = manager.getMergedSpecs(executionId);

      expect(merged).toHaveLength(1);
      expect(merged[0].id).toBe("spec-1");
    });

    it("should include created specs", () => {
      const executionId = "exec-001";
      const newSpec: Spec = {
        id: "spec-new",
        title: "New Spec",
        status: "draft",
        description: "Created",
        created_at: "2024-01-03T00:00:00Z",
        updated_at: "2024-01-03T00:00:00Z",
      };

      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "spec_created",
        entityType: "spec",
        entityId: newSpec.id,
        oldValue: null,
        newValue: newSpec,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      const merged = manager.getMergedSpecs(executionId);

      expect(merged).toHaveLength(2);
      expect(merged[1]).toEqual(newSpec);
    });

    it("should apply updates to base specs", () => {
      const executionId = "exec-001";
      const updatedSpec: Spec = {
        ...baseSpec1,
        title: "Updated Spec",
        status: "active",
      };

      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "spec_updated",
        entityType: "spec",
        entityId: baseSpec1.id,
        oldValue: baseSpec1,
        newValue: updatedSpec,
        delta: { title: "Updated Spec", status: "active" },
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      const merged = manager.getMergedSpecs(executionId);

      expect(merged).toHaveLength(1);
      expect(merged[0].title).toBe("Updated Spec");
      expect(merged[0].status).toBe("active");
    });

    it("should exclude deleted specs", () => {
      const executionId = "exec-001";

      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "spec_deleted",
        entityType: "spec",
        entityId: baseSpec1.id,
        oldValue: baseSpec1,
        newValue: null,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      const merged = manager.getMergedSpecs(executionId);

      expect(merged).toHaveLength(0);
    });
  });

  describe("hasProvisionalState", () => {
    it("should return false when no events", () => {
      const executionId = "exec-001";

      expect(manager.hasProvisionalState(executionId)).toBe(false);
    });

    it("should return true when events exist", () => {
      const executionId = "exec-001";

      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "issue_created",
        entityType: "issue",
        entityId: "issue-new",
        oldValue: null,
        newValue: {} as Issue,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      expect(manager.hasProvisionalState(executionId)).toBe(true);
    });
  });

  describe("getProvisionalStateStats", () => {
    it("should return zeros when no events", () => {
      const executionId = "exec-001";

      const stats = manager.getProvisionalStateStats(executionId);

      expect(stats).toEqual({
        totalEvents: 0,
        issuesCreated: 0,
        issuesUpdated: 0,
        issuesDeleted: 0,
        specsCreated: 0,
        specsUpdated: 0,
        specsDeleted: 0,
      });
    });

    it("should return correct counts for multiple events", () => {
      const executionId = "exec-001";

      // Add various events
      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "issue_created",
        entityType: "issue",
        entityId: "issue-new",
        oldValue: null,
        newValue: {} as Issue,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "issue_updated",
        entityType: "issue",
        entityId: baseIssue1.id,
        oldValue: baseIssue1,
        newValue: baseIssue1,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "spec_created",
        entityType: "spec",
        entityId: "spec-new",
        oldValue: null,
        newValue: {} as Spec,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      const stats = manager.getProvisionalStateStats(executionId);

      expect(stats.totalEvents).toBe(3);
      expect(stats.issuesCreated).toBe(1);
      expect(stats.issuesUpdated).toBe(1);
      expect(stats.specsCreated).toBe(1);
    });
  });
});
