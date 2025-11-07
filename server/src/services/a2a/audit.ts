/**
 * Audit logging for cross-repository operations
 */

import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import type { CrossRepoAuditLog } from "../../types/federation.js";

/**
 * Create audit log entry
 */
export async function createAuditLog(
  db: Database.Database,
  log: Omit<CrossRepoAuditLog, "log_id">
): Promise<string> {
  const logId = `log-${uuidv4()}`;

  db.prepare(
    `
    INSERT INTO cross_repo_audit_log (
      log_id, operation_type, direction,
      local_repo, remote_repo, request_id,
      payload, result, status,
      error_message, timestamp, duration_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    logId,
    log.operation_type,
    log.direction,
    log.local_repo,
    log.remote_repo,
    log.request_id || null,
    log.payload || null,
    log.result || null,
    log.status,
    log.error_message || null,
    log.timestamp,
    log.duration_ms || null
  );

  return logId;
}

/**
 * Get audit logs for a remote repo
 */
export function getAuditLogs(
  db: Database.Database,
  remoteRepo: string,
  limit = 100
): CrossRepoAuditLog[] {
  return db
    .prepare<[string, number]>(
      `
    SELECT * FROM cross_repo_audit_log
    WHERE remote_repo = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `
    )
    .all(remoteRepo, limit) as CrossRepoAuditLog[];
}

/**
 * Get audit logs by request ID
 */
export function getAuditLogsByRequest(
  db: Database.Database,
  requestId: string
): CrossRepoAuditLog[] {
  return db
    .prepare<[string]>(
      `
    SELECT * FROM cross_repo_audit_log
    WHERE request_id = ?
    ORDER BY timestamp ASC
  `
    )
    .all(requestId) as CrossRepoAuditLog[];
}

/**
 * Get audit statistics
 */
export interface AuditStats {
  total: number;
  successful: number;
  failed: number;
  byOperation: Record<string, number>;
  avgDuration: number;
}

export function getAuditStats(
  db: Database.Database,
  remoteRepo?: string,
  since?: string
): AuditStats {
  const conditions: string[] = [];
  const params: any[] = [];

  if (remoteRepo) {
    conditions.push("remote_repo = ?");
    params.push(remoteRepo);
  }

  if (since) {
    conditions.push("timestamp >= ?");
    params.push(since);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const stats = db
    .prepare<any[]>(
      `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      AVG(duration_ms) as avgDuration
    FROM cross_repo_audit_log
    ${whereClause}
  `
    )
    .get(...params) as any;

  const byOperation = db
    .prepare<any[]>(
      `
    SELECT operation_type, COUNT(*) as count
    FROM cross_repo_audit_log
    ${whereClause}
    GROUP BY operation_type
  `
    )
    .all(...params) as Array<{ operation_type: string; count: number }>;

  const byOperationMap = byOperation.reduce(
    (acc, { operation_type, count }) => {
      acc[operation_type] = count;
      return acc;
    },
    {} as Record<string, number>
  );

  return {
    total: stats.total || 0,
    successful: stats.successful || 0,
    failed: stats.failed || 0,
    byOperation: byOperationMap,
    avgDuration: stats.avgDuration || 0,
  };
}
