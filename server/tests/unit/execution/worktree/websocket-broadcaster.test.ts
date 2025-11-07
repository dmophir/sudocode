/**
 * Unit tests for WorktreeWebSocketBroadcaster
 *
 * Tests real-time broadcasting of mutation events via WebSocket.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WorktreeWebSocketBroadcaster } from "../../../../src/execution/worktree/websocket-broadcaster.js";
import { WorktreeMutationEventBuffer } from "../../../../src/execution/worktree/mutation-event-buffer.js";
import type { WorktreeMutationEvent } from "../../../../src/execution/worktree/types.js";
import { randomUUID } from "node:crypto";

// Mock the websocket manager
vi.mock("../../../../src/services/websocket.js", () => ({
  websocketManager: {
    broadcastExecution: vi.fn(),
  },
}));

import { websocketManager } from "../../../../src/services/websocket.js";

describe("WorktreeWebSocketBroadcaster", () => {
  let eventBuffer: WorktreeMutationEventBuffer;
  let broadcaster: WorktreeWebSocketBroadcaster;

  beforeEach(() => {
    eventBuffer = new WorktreeMutationEventBuffer();
    broadcaster = new WorktreeWebSocketBroadcaster(eventBuffer);
    vi.clearAllMocks();
  });

  afterEach(() => {
    broadcaster.shutdown();
  });

  describe("initialization", () => {
    it("should initialize and subscribe to event buffer", () => {
      expect(broadcaster.isEnabled()).toBe(true);
    });

    it("should support enable/disable toggle", () => {
      expect(broadcaster.isEnabled()).toBe(true);

      broadcaster.disable();
      expect(broadcaster.isEnabled()).toBe(false);

      broadcaster.enable();
      expect(broadcaster.isEnabled()).toBe(true);
    });
  });

  describe("event broadcasting", () => {
    it("should broadcast mutation events to WebSocket clients", () => {
      const executionId = "exec-001";

      // Add an event to the buffer (triggers broadcast)
      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "issue_created",
        entityType: "issue",
        entityId: "issue-001",
        oldValue: null,
        newValue: {
          id: "issue-001",
          title: "New Issue",
          status: "open",
          description: "Created",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      // Verify broadcast was called
      expect(websocketManager.broadcastExecution).toHaveBeenCalledTimes(1);
      expect(websocketManager.broadcastExecution).toHaveBeenCalledWith(
        executionId,
        expect.objectContaining({
          type: "worktree_mutation",
          data: expect.objectContaining({
            executionId,
            mutationType: "issue_created",
            entityType: "issue",
            entityId: "issue-001",
            provisional: true,
          }),
        })
      );
    });

    it("should broadcast spec mutation events", () => {
      const executionId = "exec-002";

      // Add a spec update event
      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "spec_updated",
        entityType: "spec",
        entityId: "spec-001",
        oldValue: { id: "spec-001", title: "Old" } as any,
        newValue: { id: "spec-001", title: "Updated" } as any,
        delta: { title: "Updated" },
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      expect(websocketManager.broadcastExecution).toHaveBeenCalledWith(
        executionId,
        expect.objectContaining({
          type: "worktree_mutation",
          data: expect.objectContaining({
            mutationType: "spec_updated",
            entityType: "spec",
            entityId: "spec-001",
          }),
        })
      );
    });

    it("should broadcast deletion events", () => {
      const executionId = "exec-003";

      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "issue_deleted",
        entityType: "issue",
        entityId: "issue-to-delete",
        oldValue: { id: "issue-to-delete", title: "Will be deleted" } as any,
        newValue: null,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      expect(websocketManager.broadcastExecution).toHaveBeenCalledWith(
        executionId,
        expect.objectContaining({
          type: "worktree_mutation",
          data: expect.objectContaining({
            mutationType: "issue_deleted",
            entityId: "issue-to-delete",
          }),
        })
      );
    });

    it("should include sequence number in broadcast", () => {
      const executionId = "exec-004";

      // Add multiple events to check sequence numbers
      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "issue_created",
        entityType: "issue",
        entityId: "issue-1",
        oldValue: null,
        newValue: {} as any,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "issue_created",
        entityType: "issue",
        entityId: "issue-2",
        oldValue: null,
        newValue: {} as any,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      // Check both broadcasts included sequence numbers
      const calls = vi.mocked(websocketManager.broadcastExecution).mock.calls;
      expect(calls[0][1].data.sequenceNumber).toBe(0);
      expect(calls[1][1].data.sequenceNumber).toBe(1);
    });

    it("should not broadcast when disabled", () => {
      const executionId = "exec-005";

      broadcaster.disable();

      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "issue_created",
        entityType: "issue",
        entityId: "issue-001",
        oldValue: null,
        newValue: {} as any,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      // Should not have broadcasted
      expect(websocketManager.broadcastExecution).not.toHaveBeenCalled();
    });

    it("should resume broadcasting after re-enable", () => {
      const executionId = "exec-006";

      broadcaster.disable();

      // This should not broadcast
      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "issue_created",
        entityType: "issue",
        entityId: "issue-1",
        oldValue: null,
        newValue: {} as any,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      expect(websocketManager.broadcastExecution).not.toHaveBeenCalled();

      broadcaster.enable();

      // This should broadcast
      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "issue_created",
        entityType: "issue",
        entityId: "issue-2",
        oldValue: null,
        newValue: {} as any,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      expect(websocketManager.broadcastExecution).toHaveBeenCalledTimes(1);
    });
  });

  describe("multiple executions", () => {
    it("should broadcast events for different executions separately", () => {
      const exec1 = "exec-001";
      const exec2 = "exec-002";

      // Add events for two different executions
      eventBuffer.addEvent(exec1, {
        id: randomUUID(),
        executionId: exec1,
        type: "issue_created",
        entityType: "issue",
        entityId: "issue-exec1",
        oldValue: null,
        newValue: {} as any,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      eventBuffer.addEvent(exec2, {
        id: randomUUID(),
        executionId: exec2,
        type: "spec_created",
        entityType: "spec",
        entityId: "spec-exec2",
        oldValue: null,
        newValue: {} as any,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      // Verify separate broadcasts
      expect(websocketManager.broadcastExecution).toHaveBeenCalledTimes(2);
      expect(websocketManager.broadcastExecution).toHaveBeenNthCalledWith(
        1,
        exec1,
        expect.anything()
      );
      expect(websocketManager.broadcastExecution).toHaveBeenNthCalledWith(
        2,
        exec2,
        expect.anything()
      );
    });
  });

  describe("message format", () => {
    it("should include all required fields in broadcast message", () => {
      const executionId = "exec-007";
      const timestamp = Date.now();

      eventBuffer.addEvent(executionId, {
        id: randomUUID(),
        executionId,
        type: "issue_updated",
        entityType: "issue",
        entityId: "issue-001",
        oldValue: {} as any,
        newValue: {} as any,
        delta: { title: "Updated" },
        detectedAt: timestamp,
        source: "jsonl_diff",
      });

      const broadcastCall = vi.mocked(websocketManager.broadcastExecution).mock
        .calls[0];
      const message = broadcastCall[1];

      expect(message).toMatchObject({
        type: "worktree_mutation",
        data: {
          executionId,
          mutationType: "issue_updated",
          entityType: "issue",
          entityId: "issue-001",
          sequenceNumber: expect.any(Number),
          provisional: true,
          timestamp: expect.any(Number),
          event: expect.objectContaining({
            type: "issue_updated",
            entityId: "issue-001",
          }),
        },
      });
    });
  });

  describe("shutdown", () => {
    it("should clean up on shutdown", () => {
      broadcaster.shutdown();

      // Add event after shutdown - should not broadcast
      eventBuffer.addEvent("exec-001", {
        id: randomUUID(),
        executionId: "exec-001",
        type: "issue_created",
        entityType: "issue",
        entityId: "issue-001",
        oldValue: null,
        newValue: {} as any,
        detectedAt: Date.now(),
        source: "jsonl_diff",
      });

      expect(websocketManager.broadcastExecution).not.toHaveBeenCalled();
    });
  });
});
