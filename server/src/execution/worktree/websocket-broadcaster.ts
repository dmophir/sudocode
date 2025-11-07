/**
 * Worktree WebSocket Broadcaster
 *
 * Broadcasts worktree mutation events to WebSocket clients in real-time.
 * Subscribes to the event buffer and pushes updates to clients subscribed to specific executions.
 *
 * @module execution/worktree/websocket-broadcaster
 */

import type { WorktreeMutationEventBuffer } from "./mutation-event-buffer.js";
import type { WorktreeMutationEvent } from "./types.js";
import { websocketManager } from "../../services/websocket.js";

/**
 * Broadcasts worktree mutation events via WebSocket
 *
 * Listens to the event buffer and broadcasts mutation events to WebSocket clients
 * subscribed to specific executions. This enables real-time updates for provisional
 * state changes happening in worktrees.
 *
 * Usage:
 * ```typescript
 * const broadcaster = new WorktreeWebSocketBroadcaster(eventBuffer);
 * // Events are now automatically broadcasted to subscribed clients
 *
 * // Client subscription example (from frontend):
 * ws.send(JSON.stringify({
 *   type: 'subscribe',
 *   entity_type: 'execution',
 *   entity_id: 'exec-123'
 * }));
 * ```
 */
export class WorktreeWebSocketBroadcaster {
  private eventBuffer: WorktreeMutationEventBuffer;
  private enabled: boolean = true;

  constructor(eventBuffer: WorktreeMutationEventBuffer) {
    this.eventBuffer = eventBuffer;

    // Subscribe to event buffer additions
    this.eventBuffer.on("event-added", this.handleEventAdded.bind(this));

    console.log(
      "[WorktreeWebSocketBroadcaster] Initialized and subscribed to event buffer"
    );
  }

  /**
   * Handle event-added event from the buffer
   *
   * Broadcasts the mutation event to all WebSocket clients subscribed to this execution.
   *
   * @param event - The mutation event that was added to the buffer
   */
  private handleEventAdded(event: WorktreeMutationEvent): void {
    if (!this.enabled) {
      return;
    }

    // Create WebSocket message
    const message = {
      type: "worktree_mutation" as const,
      data: {
        executionId: event.executionId,
        mutationType: event.type,
        entityType: event.entityType,
        entityId: event.entityId,
        sequenceNumber: event.sequenceNumber,
        provisional: true, // Mark as provisional change
        timestamp: event.detectedAt,
        event, // Include full event for detailed information
      },
    };

    // Broadcast to clients subscribed to this execution
    websocketManager.broadcastExecution(event.executionId, message);
  }

  /**
   * Enable broadcasting
   *
   * Useful for temporarily disabling broadcasts during bulk operations.
   */
  enable(): void {
    this.enabled = true;
    console.log("[WorktreeWebSocketBroadcaster] Broadcasting enabled");
  }

  /**
   * Disable broadcasting
   *
   * Useful for temporarily disabling broadcasts during bulk operations.
   */
  disable(): void {
    this.enabled = false;
    console.log("[WorktreeWebSocketBroadcaster] Broadcasting disabled");
  }

  /**
   * Check if broadcasting is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Shutdown the broadcaster
   *
   * Removes event listeners and cleans up resources.
   */
  shutdown(): void {
    this.eventBuffer.removeListener("event-added", this.handleEventAdded.bind(this));
    this.enabled = false;
    console.log("[WorktreeWebSocketBroadcaster] Shutdown complete");
  }
}
