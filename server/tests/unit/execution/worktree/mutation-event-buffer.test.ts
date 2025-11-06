/**
 * Tests for Worktree Mutation Event Buffer
 */

import { describe, it, beforeEach, expect, vi } from "vitest";
import { WorktreeMutationEventBuffer } from "../../../../src/execution/worktree/mutation-event-buffer.js";
import type { WorktreeMutationEvent } from "../../../../src/execution/worktree/types.js";
import type { Issue } from "@sudocode-ai/types";

describe("WorktreeMutationEventBuffer", () => {
  let buffer: WorktreeMutationEventBuffer;

  beforeEach(() => {
    buffer = new WorktreeMutationEventBuffer();
  });

  describe("addEvent", () => {
    it("should add an event with auto-incremented sequence number", () => {
      const executionId = "exec-001";
      const mockIssue: Issue = {
        id: "ISSUE-001",
        uuid: "uuid-001",
        title: "Test Issue",
        content: "Test content",
        status: "open",
        priority: 2,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };

      const event: Omit<WorktreeMutationEvent, "sequenceNumber"> = {
        id: "event-001",
        executionId,
        type: "issue_created",
        entityType: "issue",
        entityId: "ISSUE-001",
        oldValue: null,
        newValue: mockIssue,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      };

      buffer.addEvent(executionId, event);

      const events = buffer.getEvents(executionId);
      expect(events).toHaveLength(1);
      expect(events[0].sequenceNumber).toBe(0);
      expect(events[0].type).toBe("issue_created");
    });

    it("should create buffer on first event", () => {
      const executionId = "exec-002";

      expect(buffer.hasBuffer(executionId)).toBe(false);

      buffer.addEvent(executionId, {
        id: "event-001",
        executionId,
        type: "spec_created",
        entityType: "spec",
        entityId: "SPEC-001",
        oldValue: null,
        newValue: {} as any,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      expect(buffer.hasBuffer(executionId)).toBe(true);
    });

    it("should increment sequence numbers correctly", () => {
      const executionId = "exec-003";

      for (let i = 0; i < 5; i++) {
        buffer.addEvent(executionId, {
          id: `event-${i}`,
          executionId,
          type: "issue_updated",
          entityType: "issue",
          entityId: "ISSUE-001",
          oldValue: {} as any,
          newValue: {} as any,
          detectedAt: Date.now(),
          source: "jsonl_diff",
        });
      }

      const events = buffer.getEvents(executionId);
      expect(events).toHaveLength(5);
      expect(events.map((e) => e.sequenceNumber)).toEqual([0, 1, 2, 3, 4]);
    });

    it("should enforce max events limit with ring buffer behavior", () => {
      const executionId = "exec-004";
      const maxEvents = 10000;
      const overage = 100;

      // Add more events than the limit
      for (let i = 0; i < maxEvents + overage; i++) {
        buffer.addEvent(executionId, {
          id: `event-${i}`,
          executionId,
          type: "issue_updated",
          entityType: "issue",
          entityId: "ISSUE-001",
          oldValue: {} as any,
          newValue: {} as any,
          detectedAt: Date.now(),
          source: "jsonl_diff",
        });
      }

      const events = buffer.getEvents(executionId);

      // Should have removed 10% (1000 events) when limit was hit
      expect(events.length).toBeLessThanOrEqual(maxEvents);
      expect(events.length).toBeGreaterThan(maxEvents - 1000);
    });

    it("should emit 'event-added' event", () => {
      const executionId = "exec-005";
      const listener = vi.fn();

      buffer.on("event-added", listener);

      buffer.addEvent(executionId, {
        id: "event-001",
        executionId,
        type: "issue_created",
        entityType: "issue",
        entityId: "ISSUE-001",
        oldValue: null,
        newValue: {} as any,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "event-001",
          type: "issue_created",
          sequenceNumber: 0,
        })
      );
    });
  });

  describe("getEvents", () => {
    it("should return empty array for non-existent buffer", () => {
      const events = buffer.getEvents("non-existent");
      expect(events).toEqual([]);
    });

    it("should return all events when no sequence filter", () => {
      const executionId = "exec-006";

      for (let i = 0; i < 3; i++) {
        buffer.addEvent(executionId, {
          id: `event-${i}`,
          executionId,
          type: "issue_updated",
          entityType: "issue",
          entityId: "ISSUE-001",
          oldValue: {} as any,
          newValue: {} as any,
          detectedAt: Date.now(),
          source: "jsonl_diff",
        });
      }

      const events = buffer.getEvents(executionId);
      expect(events).toHaveLength(3);
    });

    it("should filter events by sequence number", () => {
      const executionId = "exec-007";

      for (let i = 0; i < 10; i++) {
        buffer.addEvent(executionId, {
          id: `event-${i}`,
          executionId,
          type: "issue_updated",
          entityType: "issue",
          entityId: "ISSUE-001",
          oldValue: {} as any,
          newValue: {} as any,
          detectedAt: Date.now(),
          source: "jsonl_diff",
        });
      }

      const events = buffer.getEvents(executionId, 5);
      expect(events).toHaveLength(5);
      expect(events[0].sequenceNumber).toBe(5);
      expect(events[4].sequenceNumber).toBe(9);
    });

    it("should return a copy of events array", () => {
      const executionId = "exec-008";

      buffer.addEvent(executionId, {
        id: "event-001",
        executionId,
        type: "issue_created",
        entityType: "issue",
        entityId: "ISSUE-001",
        oldValue: null,
        newValue: {} as any,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      const events1 = buffer.getEvents(executionId);
      const events2 = buffer.getEvents(executionId);

      expect(events1).not.toBe(events2); // Different array instances
      expect(events1).toEqual(events2); // But same content
    });
  });

  describe("captureInitialSnapshot", () => {
    it("should capture initial snapshot", () => {
      const executionId = "exec-009";
      const mockIssue: Issue = {
        id: "ISSUE-001",
        uuid: "uuid-001",
        title: "Test",
        content: "Test",
        status: "open",
        priority: 2,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };

      const snapshot = {
        issues: { "ISSUE-001": mockIssue },
        specs: {},
      };

      buffer.captureInitialSnapshot(executionId, snapshot);

      const retrieved = buffer.getInitialSnapshot(executionId);
      expect(retrieved).toEqual(snapshot);
    });

    it("should create buffer if it doesn't exist", () => {
      const executionId = "exec-010";

      expect(buffer.hasBuffer(executionId)).toBe(false);

      buffer.captureInitialSnapshot(executionId, { issues: {}, specs: {} });

      expect(buffer.hasBuffer(executionId)).toBe(true);
    });
  });

  describe("getInitialSnapshot", () => {
    it("should return null for non-existent buffer", () => {
      const snapshot = buffer.getInitialSnapshot("non-existent");
      expect(snapshot).toBeNull();
    });
  });

  describe("hasBuffer", () => {
    it("should return false for non-existent buffer", () => {
      expect(buffer.hasBuffer("non-existent")).toBe(false);
    });

    it("should return true for existing buffer", () => {
      const executionId = "exec-011";

      buffer.addEvent(executionId, {
        id: "event-001",
        executionId,
        type: "issue_created",
        entityType: "issue",
        entityId: "ISSUE-001",
        oldValue: null,
        newValue: {} as any,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      expect(buffer.hasBuffer(executionId)).toBe(true);
    });
  });

  describe("getBufferInfo", () => {
    it("should return null for non-existent buffer", () => {
      const info = buffer.getBufferInfo("non-existent");
      expect(info).toBeNull();
    });

    it("should return buffer metadata without events", () => {
      const executionId = "exec-012";

      buffer.addEvent(executionId, {
        id: "event-001",
        executionId,
        type: "issue_created",
        entityType: "issue",
        entityId: "ISSUE-001",
        oldValue: null,
        newValue: {} as any,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      const info = buffer.getBufferInfo(executionId);

      expect(info).toBeDefined();
      expect(info?.executionId).toBe(executionId);
      expect(info?.nextSequence).toBe(1);
      expect(info?.createdAt).toBeGreaterThan(0);
      expect(info?.lastUpdatedAt).toBeGreaterThan(0);
      expect(info).not.toHaveProperty("events");
    });
  });

  describe("removeBuffer", () => {
    it("should remove buffer and return true", () => {
      const executionId = "exec-013";

      buffer.addEvent(executionId, {
        id: "event-001",
        executionId,
        type: "issue_created",
        entityType: "issue",
        entityId: "ISSUE-001",
        oldValue: null,
        newValue: {} as any,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      expect(buffer.hasBuffer(executionId)).toBe(true);

      const result = buffer.removeBuffer(executionId);

      expect(result).toBe(true);
      expect(buffer.hasBuffer(executionId)).toBe(false);
    });

    it("should return false for non-existent buffer", () => {
      const result = buffer.removeBuffer("non-existent");
      expect(result).toBe(false);
    });
  });

  describe("clearAll", () => {
    it("should remove all buffers", () => {
      buffer.addEvent("exec-001", {
        id: "event-001",
        executionId: "exec-001",
        type: "issue_created",
        entityType: "issue",
        entityId: "ISSUE-001",
        oldValue: null,
        newValue: {} as any,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      buffer.addEvent("exec-002", {
        id: "event-002",
        executionId: "exec-002",
        type: "spec_created",
        entityType: "spec",
        entityId: "SPEC-001",
        oldValue: null,
        newValue: {} as any,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      expect(buffer.getBufferCount()).toBe(2);

      buffer.clearAll();

      expect(buffer.getBufferCount()).toBe(0);
    });
  });

  describe("pruneStale", () => {
    it("should prune buffers older than retention threshold", () => {
      const executionId = "exec-014";

      // Add event
      buffer.addEvent(executionId, {
        id: "event-001",
        executionId,
        type: "issue_created",
        entityType: "issue",
        entityId: "ISSUE-001",
        oldValue: null,
        newValue: {} as any,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      // Manually set lastUpdatedAt to 3 hours ago (past retention threshold of 2 hours)
      const bufferInfo: any = buffer.getBufferInfo(executionId);
      if (bufferInfo) {
        const threeHoursAgo = Date.now() - 1000 * 60 * 60 * 3;
        (buffer as any).buffers.get(executionId).lastUpdatedAt = threeHoursAgo;
      }

      const pruned = buffer.pruneStale();

      expect(pruned).toBe(1);
      expect(buffer.hasBuffer(executionId)).toBe(false);
    });

    it("should not prune recent buffers", () => {
      const executionId = "exec-015";

      buffer.addEvent(executionId, {
        id: "event-001",
        executionId,
        type: "issue_created",
        entityType: "issue",
        entityId: "ISSUE-001",
        oldValue: null,
        newValue: {} as any,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      const pruned = buffer.pruneStale();

      expect(pruned).toBe(0);
      expect(buffer.hasBuffer(executionId)).toBe(true);
    });
  });

  describe("getStats", () => {
    it("should return correct statistics", () => {
      // Add events to multiple executions
      for (let i = 0; i < 3; i++) {
        buffer.addEvent(`exec-${i}`, {
          id: `event-${i}`,
          executionId: `exec-${i}`,
          type: "issue_created",
          entityType: "issue",
          entityId: `ISSUE-${i}`,
          oldValue: null,
          newValue: {} as any,
          detectedAt: Date.now(),
          source: "jsonl_diff",
        });
      }

      // Add 2 more events to exec-0
      for (let i = 0; i < 2; i++) {
        buffer.addEvent("exec-0", {
          id: `event-extra-${i}`,
          executionId: "exec-0",
          type: "issue_updated",
          entityType: "issue",
          entityId: "ISSUE-0",
          oldValue: {} as any,
          newValue: {} as any,
          detectedAt: Date.now(),
          source: "jsonl_diff",
        });
      }

      const stats = buffer.getStats();

      expect(stats.bufferCount).toBe(3);
      expect(stats.totalEvents).toBe(5); // 3 initial + 2 extra
      expect(stats.avgEventsPerBuffer).toBeCloseTo(5 / 3);
      expect(stats.oldestBuffer).toBeGreaterThan(0);
      expect(stats.newestBuffer).toBeGreaterThan(0);
    });

    it("should return zeros for empty buffer", () => {
      const stats = buffer.getStats();

      expect(stats.bufferCount).toBe(0);
      expect(stats.totalEvents).toBe(0);
      expect(stats.avgEventsPerBuffer).toBe(0);
      expect(stats.oldestBuffer).toBeNull();
      expect(stats.newestBuffer).toBeNull();
    });
  });

  describe("getBufferIds", () => {
    it("should return all execution IDs", () => {
      buffer.addEvent("exec-001", {
        id: "event-001",
        executionId: "exec-001",
        type: "issue_created",
        entityType: "issue",
        entityId: "ISSUE-001",
        oldValue: null,
        newValue: {} as any,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      buffer.addEvent("exec-002", {
        id: "event-002",
        executionId: "exec-002",
        type: "spec_created",
        entityType: "spec",
        entityId: "SPEC-001",
        oldValue: null,
        newValue: {} as any,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      const ids = buffer.getBufferIds();

      expect(ids).toHaveLength(2);
      expect(ids).toContain("exec-001");
      expect(ids).toContain("exec-002");
    });
  });
});
