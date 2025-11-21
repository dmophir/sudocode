/**
 * ExecutionLogsStore Service
 *
 * Manages persistence of raw execution logs and normalized logs to the database.
 * Provides CRUD operations for execution_logs and execution_normalized_logs tables.
 *
 * @module services/execution-logs-store
 */

import type Database from "better-sqlite3";
import type { NormalizedEntry } from "agent-execution-engine/agents";
import { randomUUID } from "crypto";

/**
 * Metadata for execution logs (without the full logs text)
 */
export interface LogMetadata {
  execution_id: string;
  byte_size: number;
  line_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Statistics about all execution logs
 */
export interface LogStats {
  totalExecutions: number;
  totalBytes: number;
  totalLines: number;
  avgLinesPerExecution: number;
  avgBytesPerExecution: number;
}

/**
 * Log counts for both raw and normalized formats
 */
export interface LogCounts {
  raw: number;
  normalized: number;
}

/**
 * ExecutionLogsStore - Database service for execution logs
 *
 * Provides methods to store and retrieve raw agent output logs in NDJSON format.
 * All logs are stored as newline-delimited JSON strings for efficient append operations.
 *
 * @example
 * ```typescript
 * const store = new ExecutionLogsStore(db);
 * store.initializeLogs('exec-123');
 * store.appendRawLog('exec-123', '{"type":"assistant","message":{...}}');
 * const logs = store.getRawLogs('exec-123');
 * ```
 */
export class ExecutionLogsStore {
  constructor(private db: Database.Database) {}

  /**
   * Initialize empty log entry for a new execution
   *
   * Creates a new row in execution_logs with empty raw_logs.
   * Uses INSERT OR IGNORE so calling multiple times is safe.
   *
   * @param executionId - Unique execution identifier
   *
   * @example
   * ```typescript
   * store.initializeLogs('exec-123');
   * ```
   */
  initializeLogs(executionId: string): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO execution_logs (execution_id, raw_logs, byte_size, line_count)
      VALUES (?, '', 0, 0)
    `);
    stmt.run(executionId);
  }

  /**
   * Append a single log line to an execution
   *
   * Appends the line with a newline character and updates metadata.
   * Uses prepared statement for performance.
   *
   * @param executionId - Unique execution identifier
   * @param line - Raw log line (NDJSON format, no trailing newline)
   *
   * @example
   * ```typescript
   * store.appendRawLog('exec-123', '{"type":"assistant","message":{...}}');
   * ```
   */
  appendRawLog(executionId: string, line: string): void {
    const byteSize = Buffer.byteLength(line) + 1; // +1 for newline

    const stmt = this.db.prepare(`
      UPDATE execution_logs
      SET raw_logs = raw_logs || ? || char(10),
          byte_size = byte_size + ?,
          line_count = line_count + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE execution_id = ?
    `);

    stmt.run(line, byteSize, executionId);
  }

  /**
   * Append multiple log lines in a single transaction
   *
   * More efficient than calling appendRawLog multiple times.
   * Uses transaction for atomicity - all lines added or none.
   *
   * @param executionId - Unique execution identifier
   * @param lines - Array of raw log lines
   *
   * @example
   * ```typescript
   * store.appendRawLogs('exec-123', [
   *   '{"type":"assistant",...}',
   *   '{"type":"tool_result",...}'
   * ]);
   * ```
   */
  appendRawLogs(executionId: string, lines: string[]): void {
    const transaction = this.db.transaction((lines: string[]) => {
      for (const line of lines) {
        this.appendRawLog(executionId, line);
      }
    });

    transaction(lines);
  }

  /**
   * Retrieve all raw logs for an execution
   *
   * Returns logs as an array of individual log lines (NDJSON).
   * Empty lines are filtered out.
   *
   * @param executionId - Unique execution identifier
   * @returns Array of log lines, or empty array if execution not found
   *
   * @example
   * ```typescript
   * const logs = store.getRawLogs('exec-123');
   * logs.forEach(line => {
   *   const message = JSON.parse(line);
   *   console.log(message.type);
   * });
   * ```
   */
  getRawLogs(executionId: string): string[] {
    const stmt = this.db.prepare(`
      SELECT raw_logs FROM execution_logs WHERE execution_id = ?
    `);

    const result = stmt.get(executionId) as { raw_logs: string } | undefined;

    if (!result) {
      return [];
    }

    // Split by newline and filter empty lines
    return result.raw_logs.split("\n").filter((line) => line.trim().length > 0);
  }

  /**
   * Get metadata for an execution without fetching full logs
   *
   * Useful for displaying log size/count without loading entire log content.
   *
   * @param executionId - Unique execution identifier
   * @returns Metadata object or null if execution not found
   *
   * @example
   * ```typescript
   * const metadata = store.getLogMetadata('exec-123');
   * if (metadata) {
   *   console.log(`${metadata.line_count} lines, ${metadata.byte_size} bytes`);
   * }
   * ```
   */
  getLogMetadata(executionId: string): LogMetadata | null {
    const stmt = this.db.prepare(`
      SELECT execution_id, byte_size, line_count, created_at, updated_at
      FROM execution_logs
      WHERE execution_id = ?
    `);

    return (stmt.get(executionId) as LogMetadata | undefined) || null;
  }

  /**
   * Delete logs for an execution
   *
   * Removes the entire log entry from the database (both raw and normalized).
   * Foreign key constraint ensures execution must exist.
   *
   * @param executionId - Unique execution identifier
   *
   * @example
   * ```typescript
   * store.deleteLogs('exec-123');
   * ```
   */
  deleteLogs(executionId: string): void {
    // Delete raw logs
    const stmt1 = this.db.prepare(`
      DELETE FROM execution_logs WHERE execution_id = ?
    `);
    stmt1.run(executionId);

    // Delete normalized logs
    const stmt2 = this.db.prepare(`
      DELETE FROM execution_normalized_logs WHERE execution_id = ?
    `);
    stmt2.run(executionId);
  }

  /**
   * Prune old execution logs based on age
   *
   * Deletes logs for completed/failed/cancelled executions older than threshold.
   * Only removes logs where the execution has reached a terminal state.
   *
   * @param olderThanMs - Age threshold in milliseconds
   * @returns Number of log entries deleted
   *
   * @example
   * ```typescript
   * // Delete logs older than 30 days
   * const deleted = store.pruneOldLogs(30 * 24 * 60 * 60 * 1000);
   * console.log(`Pruned ${deleted} old execution logs`);
   * ```
   */
  pruneOldLogs(olderThanMs: number): number {
    // Calculate threshold timestamp as ISO string
    const thresholdMs = Date.now() - olderThanMs;
    const thresholdDate = new Date(thresholdMs).toISOString();

    const stmt = this.db.prepare(`
      DELETE FROM execution_logs
      WHERE execution_id IN (
        SELECT id FROM executions
        WHERE status IN ('completed', 'failed', 'cancelled', 'stopped')
        AND completed_at IS NOT NULL
        AND completed_at < ?
      )
    `);

    const result = stmt.run(thresholdDate);
    return result.changes;
  }

  /**
   * Get aggregate statistics about all execution logs
   *
   * Provides overview of total storage usage and averages.
   *
   * @returns Statistics object with totals and averages
   *
   * @example
   * ```typescript
   * const stats = store.getStats();
   * console.log(`Total storage: ${stats.totalBytes} bytes`);
   * console.log(`Average: ${stats.avgLinesPerExecution} lines/execution`);
   * ```
   */
  getStats(): LogStats {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as totalExecutions,
        COALESCE(SUM(byte_size), 0) as totalBytes,
        COALESCE(SUM(line_count), 0) as totalLines
      FROM execution_logs
    `);

    const result = stmt.get() as {
      totalExecutions: number;
      totalBytes: number;
      totalLines: number;
    };

    return {
      totalExecutions: result.totalExecutions,
      totalBytes: result.totalBytes,
      totalLines: result.totalLines,
      avgLinesPerExecution:
        result.totalExecutions > 0
          ? result.totalLines / result.totalExecutions
          : 0,
      avgBytesPerExecution:
        result.totalExecutions > 0
          ? result.totalBytes / result.totalExecutions
          : 0,
    };
  }

  // ============================================================================
  // Normalized Logs Methods (Direct Runner Pattern)
  // ============================================================================

  /**
   * Append a normalized log entry
   *
   * Stores a NormalizedEntry from direct runner execution.
   * Used by DirectRunnerAdapter to persist agent-execution-engine output.
   *
   * @param executionId - Execution ID
   * @param entry - Normalized entry from agent executor
   *
   * @example
   * ```typescript
   * const entry: NormalizedEntry = {
   *   index: 0,
   *   type: { kind: 'assistant_message' },
   *   content: 'Hello',
   * };
   * store.appendNormalizedLog('exec-123', entry);
   * ```
   */
  appendNormalizedLog(executionId: string, entry: NormalizedEntry): void {
    const logId = randomUUID();
    const entryKind = entry.type.kind;
    const timestamp = entry.timestamp?.getTime() || Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO execution_normalized_logs
        (id, execution_id, entry_index, entry_kind, entry_data, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    try {
      stmt.run(
        logId,
        executionId,
        entry.index,
        entryKind,
        JSON.stringify(entry),
        timestamp
      );
    } catch (error) {
      console.error("[ExecutionLogsStore] Failed to append normalized log:", {
        executionId,
        entryIndex: entry.index,
        entryKind,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get all normalized logs for an execution
   *
   * Returns normalized entries ordered by index.
   * Used for log replay and historical viewing.
   *
   * @param executionId - Execution ID
   * @returns Array of normalized entries
   *
   * @example
   * ```typescript
   * const logs = store.getNormalizedLogs('exec-123');
   * logs.forEach(entry => {
   *   console.log(entry.type.kind, entry.content);
   * });
   * ```
   */
  getNormalizedLogs(executionId: string): NormalizedEntry[] {
    const stmt = this.db.prepare(`
      SELECT entry_data
      FROM execution_normalized_logs
      WHERE execution_id = ?
      ORDER BY entry_index ASC
    `);

    const rows = stmt.all(executionId) as Array<{ entry_data: string }>;

    return rows
      .map((row) => {
        try {
          return JSON.parse(row.entry_data) as NormalizedEntry;
        } catch (error) {
          console.error(
            "[ExecutionLogsStore] Failed to parse normalized log:",
            {
              executionId,
              error: error instanceof Error ? error.message : String(error),
            }
          );
          // Skip malformed entries
          return null;
        }
      })
      .filter((entry): entry is NormalizedEntry => entry !== null);
  }

  /**
   * Get normalized logs filtered by entry kind
   *
   * Useful for querying specific types of entries (e.g., only tool_use entries).
   *
   * @param executionId - Execution ID
   * @param entryKind - Entry type to filter by
   * @returns Array of normalized entries matching the kind
   *
   * @example
   * ```typescript
   * // Get only tool use entries
   * const toolLogs = store.getNormalizedLogsByKind('exec-123', 'tool_use');
   * ```
   */
  getNormalizedLogsByKind(
    executionId: string,
    entryKind: string
  ): NormalizedEntry[] {
    const stmt = this.db.prepare(`
      SELECT entry_data
      FROM execution_normalized_logs
      WHERE execution_id = ? AND entry_kind = ?
      ORDER BY entry_index ASC
    `);

    const rows = stmt.all(executionId, entryKind) as Array<{
      entry_data: string;
    }>;

    return rows
      .map((row) => {
        try {
          return JSON.parse(row.entry_data) as NormalizedEntry;
        } catch (error) {
          console.error(
            "[ExecutionLogsStore] Failed to parse normalized log:",
            {
              executionId,
              entryKind,
              error: error instanceof Error ? error.message : String(error),
            }
          );
          return null;
        }
      })
      .filter((entry): entry is NormalizedEntry => entry !== null);
  }

  /**
   * Get normalized logs within a time range
   *
   * @param executionId - Execution ID
   * @param startTime - Start timestamp (inclusive)
   * @param endTime - End timestamp (inclusive)
   * @returns Array of normalized entries in the time range
   *
   * @example
   * ```typescript
   * const start = Date.now() - 60000; // Last minute
   * const end = Date.now();
   * const recentLogs = store.getNormalizedLogsInRange('exec-123', start, end);
   * ```
   */
  getNormalizedLogsInRange(
    executionId: string,
    startTime: number,
    endTime: number
  ): NormalizedEntry[] {
    const stmt = this.db.prepare(`
      SELECT entry_data
      FROM execution_normalized_logs
      WHERE execution_id = ?
        AND timestamp >= ?
        AND timestamp <= ?
      ORDER BY entry_index ASC
    `);

    const rows = stmt.all(executionId, startTime, endTime) as Array<{
      entry_data: string;
    }>;

    return rows
      .map((row) => {
        try {
          return JSON.parse(row.entry_data) as NormalizedEntry;
        } catch (error) {
          console.error(
            "[ExecutionLogsStore] Failed to parse normalized log:",
            {
              executionId,
              error: error instanceof Error ? error.message : String(error),
            }
          );
          return null;
        }
      })
      .filter((entry): entry is NormalizedEntry => entry !== null);
  }

  /**
   * Get log count for an execution
   *
   * Returns counts for both raw and normalized logs.
   * Useful for determining which format is available.
   *
   * @param executionId - Execution ID
   * @returns Object with raw and normalized log counts
   *
   * @example
   * ```typescript
   * const counts = store.getLogCounts('exec-123');
   * if (counts.normalized > 0) {
   *   console.log('Using normalized logs');
   * } else {
   *   console.log('Using raw logs');
   * }
   * ```
   */
  getLogCounts(executionId: string): LogCounts {
    const rawCount =
      (
        this.db
          .prepare(
            `
      SELECT COUNT(*) as count
      FROM execution_logs
      WHERE execution_id = ?
    `
          )
          .get(executionId) as { count: number } | undefined
      )?.count || 0;

    const normalizedCount =
      (
        this.db
          .prepare(
            `
      SELECT COUNT(*) as count
      FROM execution_normalized_logs
      WHERE execution_id = ?
    `
          )
          .get(executionId) as { count: number } | undefined
      )?.count || 0;

    return {
      raw: rawCount > 0 ? 1 : 0, // Raw logs are stored as single row
      normalized: normalizedCount,
    };
  }

  /**
   * Initialize normalized logs for a new execution
   *
   * No-op for now since we create logs on-demand.
   * Kept for API consistency and future metadata tracking.
   *
   * @param executionId - Execution ID
   */
  initializeNormalizedLogs(executionId: string): void {
    // No-op - logs are created on demand with appendNormalizedLog
    console.log(
      "[ExecutionLogsStore] Initialized normalized logs for execution:",
      executionId
    );
  }
}
