/**
 * Worktree Mutation Event Buffer
 *
 * In-memory storage for worktree mutation events, similar to the existing
 * EventBuffer (event-buffer.ts) but specifically for tracking changes made
 * in isolated worktree environments.
 *
 * @module execution/worktree/mutation-event-buffer
 */

import { EventEmitter } from "events";
import {
  WorktreeMutationEvent,
  WorktreeEventBuffer,
  EventBufferStats,
} from "./types.js";
import type { Issue, Spec } from "@sudocode-ai/types";

/**
 * WorktreeMutationEventBuffer - In-memory storage for worktree mutation events
 *
 * Stores events for active worktree executions and allows replay when needed.
 * Events are automatically pruned after executions complete to prevent memory leaks.
 *
 * Similar to EventBuffer (event-buffer.ts) but specialized for worktree mutations.
 */
export class WorktreeMutationEventBuffer extends EventEmitter {
  private buffers = new Map<string, WorktreeEventBuffer>();
  private readonly MAX_EVENTS_PER_EXECUTION = 10000; // Prevent unbounded growth
  private readonly RETENTION_MS = 1000 * 60 * 60 * 2; // 2 hours after last update

  /**
   * Add a mutation event to the buffer for an execution
   *
   * @param executionId - Execution ID
   * @param event - Mutation event to buffer (without sequenceNumber, will be assigned)
   */
  addEvent(
    executionId: string,
    event: Omit<WorktreeMutationEvent, "sequenceNumber">
  ): void {
    let buffer = this.buffers.get(executionId);

    if (!buffer) {
      buffer = {
        executionId,
        events: [],
        nextSequence: 0,
        createdAt: Date.now(),
        lastUpdatedAt: Date.now(),
        initialSnapshot: { issues: {}, specs: {} },
      };
      this.buffers.set(executionId, buffer);
      console.log("[WorktreeMutationEventBuffer] Created buffer for execution", {
        executionId,
        timestamp: new Date().toISOString(),
      });
    }

    // Add event with sequence number
    const sequencedEvent: WorktreeMutationEvent = {
      ...event,
      sequenceNumber: buffer.nextSequence++,
    };

    buffer.events.push(sequencedEvent);
    buffer.lastUpdatedAt = Date.now();

    // Enforce max events limit (ring buffer behavior)
    if (buffer.events.length > this.MAX_EVENTS_PER_EXECUTION) {
      const toRemove = Math.floor(this.MAX_EVENTS_PER_EXECUTION * 0.1);
      buffer.events.splice(0, toRemove);
      console.warn(
        "[WorktreeMutationEventBuffer] Buffer size limit reached, removing oldest events",
        {
          executionId,
          removedCount: toRemove,
          remainingCount: buffer.events.length,
        }
      );
    }

    console.log("[WorktreeMutationEventBuffer] Event added to buffer", {
      executionId,
      eventType: sequencedEvent.type,
      entityType: sequencedEvent.entityType,
      entityId: sequencedEvent.entityId,
      sequenceNumber: sequencedEvent.sequenceNumber,
      totalEvents: buffer.events.length,
    });

    // Emit event for listeners (e.g., WebSocket broadcaster)
    this.emit("event-added", sequencedEvent);
  }

  /**
   * Get all buffered events for an execution
   *
   * @param executionId - Execution ID
   * @param fromSequence - Optional: only return events >= this sequence number
   * @returns Array of mutation events, or empty array if no buffer exists
   */
  getEvents(executionId: string, fromSequence?: number): WorktreeMutationEvent[] {
    const buffer = this.buffers.get(executionId);
    if (!buffer) {
      return [];
    }

    if (fromSequence !== undefined) {
      return buffer.events.filter((e) => e.sequenceNumber >= fromSequence);
    }

    return [...buffer.events];
  }

  /**
   * Check if a buffer exists for an execution
   *
   * @param executionId - Execution ID
   * @returns true if buffer exists
   */
  hasBuffer(executionId: string): boolean {
    return this.buffers.has(executionId);
  }

  /**
   * Get buffer metadata without events
   *
   * @param executionId - Execution ID
   * @returns Buffer metadata or null if not found
   */
  getBufferInfo(
    executionId: string
  ): Omit<WorktreeEventBuffer, "events"> | null {
    const buffer = this.buffers.get(executionId);
    if (!buffer) {
      return null;
    }

    return {
      executionId: buffer.executionId,
      nextSequence: buffer.nextSequence,
      createdAt: buffer.createdAt,
      lastUpdatedAt: buffer.lastUpdatedAt,
      initialSnapshot: buffer.initialSnapshot,
    };
  }

  /**
   * Capture initial snapshot of worktree state
   *
   * This should be called when a worktree is first created, to capture
   * the baseline state before any mutations occur.
   *
   * @param executionId - Execution ID
   * @param snapshot - Initial state snapshot
   */
  captureInitialSnapshot(
    executionId: string,
    snapshot: { issues: Record<string, Issue>; specs: Record<string, Spec> }
  ): void {
    let buffer = this.buffers.get(executionId);

    if (!buffer) {
      // Create buffer if it doesn't exist
      buffer = {
        executionId,
        events: [],
        nextSequence: 0,
        createdAt: Date.now(),
        lastUpdatedAt: Date.now(),
        initialSnapshot: { issues: {}, specs: {} },
      };
      this.buffers.set(executionId, buffer);
    }

    buffer.initialSnapshot = snapshot;
    buffer.lastUpdatedAt = Date.now();

    console.log("[WorktreeMutationEventBuffer] Initial snapshot captured", {
      executionId,
      issueCount: Object.keys(snapshot.issues).length,
      specCount: Object.keys(snapshot.specs).length,
    });
  }

  /**
   * Get initial snapshot for an execution
   *
   * @param executionId - Execution ID
   * @returns Initial snapshot or null if not found
   */
  getInitialSnapshot(
    executionId: string
  ): { issues: Record<string, Issue>; specs: Record<string, Spec> } | null {
    const buffer = this.buffers.get(executionId);
    return buffer ? buffer.initialSnapshot : null;
  }

  /**
   * Remove a buffer for an execution
   *
   * @param executionId - Execution ID
   * @returns true if buffer was removed, false if it didn't exist
   */
  removeBuffer(executionId: string): boolean {
    const existed = this.buffers.has(executionId);
    if (existed) {
      this.buffers.delete(executionId);
      console.log("[WorktreeMutationEventBuffer] Buffer removed", {
        executionId,
        timestamp: new Date().toISOString(),
      });
    }
    return existed;
  }

  /**
   * Clear all buffers
   */
  clearAll(): void {
    const count = this.buffers.size;
    this.buffers.clear();
    console.log("[WorktreeMutationEventBuffer] All buffers cleared", { count });
  }

  /**
   * Prune stale buffers that haven't been updated recently
   *
   * Should be called periodically to prevent memory leaks.
   *
   * @returns Number of buffers pruned
   */
  pruneStale(): number {
    const now = Date.now();
    const threshold = now - this.RETENTION_MS;
    let pruned = 0;

    for (const [executionId, buffer] of this.buffers.entries()) {
      if (buffer.lastUpdatedAt < threshold) {
        this.buffers.delete(executionId);
        pruned++;
      }
    }

    if (pruned > 0) {
      console.log("[WorktreeMutationEventBuffer] Pruned stale buffers", {
        count: pruned,
        remaining: this.buffers.size,
      });
    }

    return pruned;
  }

  /**
   * Get total number of buffers
   *
   * @returns Number of active buffers
   */
  getBufferCount(): number {
    return this.buffers.size;
  }

  /**
   * Get total number of events across all buffers
   *
   * @returns Total event count
   */
  getTotalEventCount(): number {
    let total = 0;
    for (const buffer of this.buffers.values()) {
      total += buffer.events.length;
    }
    return total;
  }

  /**
   * Get statistics about buffer usage
   *
   * @returns Buffer statistics
   */
  getStats(): EventBufferStats {
    const bufferCount = this.buffers.size;
    const totalEvents = this.getTotalEventCount();

    let oldest: number | null = null;
    let newest: number | null = null;

    for (const buffer of this.buffers.values()) {
      if (oldest === null || buffer.createdAt < oldest) {
        oldest = buffer.createdAt;
      }
      if (newest === null || buffer.createdAt > newest) {
        newest = buffer.createdAt;
      }
    }

    return {
      bufferCount,
      totalEvents,
      avgEventsPerBuffer: bufferCount > 0 ? totalEvents / bufferCount : 0,
      oldestBuffer: oldest,
      newestBuffer: newest,
    };
  }

  /**
   * Get all buffer IDs (execution IDs)
   *
   * @returns Array of execution IDs
   */
  getBufferIds(): string[] {
    return Array.from(this.buffers.keys());
  }
}
