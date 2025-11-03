/**
 * Execution Event Buffer
 *
 * Stores AG-UI events for executions so they can be replayed to late-joining clients
 * or retrieved for historical display.
 *
 * @module execution/transport/event-buffer
 */

import type { AgUiEvent } from "./transport-manager.js";

/**
 * Buffered event with metadata
 */
export interface BufferedEvent {
  /** The AG-UI event */
  event: AgUiEvent;
  /** When the event was buffered */
  timestamp: number;
  /** Event sequence number within the execution */
  sequenceNumber: number;
}

/**
 * Event buffer for a single execution
 */
export interface ExecutionEventBuffer {
  /** Execution/run ID */
  executionId: string;
  /** Buffered events in order */
  events: BufferedEvent[];
  /** Next sequence number */
  nextSequence: number;
  /** When the buffer was created */
  createdAt: number;
  /** When the buffer was last updated */
  lastUpdatedAt: number;
}

/**
 * EventBuffer - In-memory storage for execution events
 *
 * Stores events for active executions and allows replay when clients connect.
 * Events are automatically pruned after executions complete to prevent memory leaks.
 */
export class EventBuffer {
  private buffers = new Map<string, ExecutionEventBuffer>();
  private readonly MAX_EVENTS_PER_EXECUTION = 10000; // Prevent unbounded growth
  private readonly RETENTION_MS = 1000 * 60 * 60; // 1 hour after last update

  /**
   * Add an event to the buffer for an execution
   *
   * @param executionId - Execution ID
   * @param event - AG-UI event to buffer
   */
  addEvent(executionId: string, event: AgUiEvent): void {
    let buffer = this.buffers.get(executionId);

    if (!buffer) {
      buffer = {
        executionId,
        events: [],
        nextSequence: 0,
        createdAt: Date.now(),
        lastUpdatedAt: Date.now(),
      };
      this.buffers.set(executionId, buffer);
      console.log("[EventBuffer] Created buffer for execution", {
        executionId,
        timestamp: new Date().toISOString(),
      });
    }

    // Add event with sequence number
    const bufferedEvent: BufferedEvent = {
      event,
      timestamp: Date.now(),
      sequenceNumber: buffer.nextSequence++,
    };

    buffer.events.push(bufferedEvent);
    buffer.lastUpdatedAt = Date.now();

    // Enforce max events limit
    if (buffer.events.length > this.MAX_EVENTS_PER_EXECUTION) {
      // Remove oldest 10% of events
      const toRemove = Math.floor(this.MAX_EVENTS_PER_EXECUTION * 0.1);
      buffer.events.splice(0, toRemove);
      console.warn(
        "[EventBuffer] Buffer size limit reached, removing oldest events",
        {
          executionId,
          removedCount: toRemove,
          remainingCount: buffer.events.length,
        }
      );
    }

    console.log("[EventBuffer] Event added to buffer", {
      executionId,
      eventType: event.type,
      sequenceNumber: bufferedEvent.sequenceNumber,
      totalEvents: buffer.events.length,
    });
  }

  /**
   * Get all buffered events for an execution
   *
   * @param executionId - Execution ID
   * @param fromSequence - Optional: only return events >= this sequence number
   * @returns Array of buffered events, or empty array if no buffer exists
   */
  getEvents(executionId: string, fromSequence?: number): BufferedEvent[] {
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
  ): Omit<ExecutionEventBuffer, "events"> | null {
    const buffer = this.buffers.get(executionId);
    if (!buffer) {
      return null;
    }

    return {
      executionId: buffer.executionId,
      nextSequence: buffer.nextSequence,
      createdAt: buffer.createdAt,
      lastUpdatedAt: buffer.lastUpdatedAt,
    };
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
      console.log("[EventBuffer] Buffer removed", {
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
    console.log("[EventBuffer] All buffers cleared", { count });
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
      console.log("[EventBuffer] Pruned stale buffers", {
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
  getStats(): {
    bufferCount: number;
    totalEvents: number;
    avgEventsPerBuffer: number;
    oldestBuffer: number | null;
    newestBuffer: number | null;
  } {
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
}
