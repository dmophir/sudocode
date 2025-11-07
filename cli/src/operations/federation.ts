/**
 * Federation operations - remote repository and request management
 */

import type Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";

// ============================================================================
// Types
// ============================================================================

export type TrustLevel = "trusted" | "verified" | "untrusted";
export type SyncStatus = "synced" | "stale" | "unreachable" | "unknown";
export type RequestStatus = "pending" | "approved" | "rejected" | "completed" | "failed";
export type RequestDirection = "incoming" | "outgoing";

export interface RemoteRepo {
  url: string;
  display_name: string;
  description?: string;
  trust_level: TrustLevel;
  capabilities?: string;
  rest_endpoint?: string;
  ws_endpoint?: string;
  git_url?: string;
  last_synced_at?: string;
  sync_status: SyncStatus;
  added_at: string;
  added_by: string;
  auto_sync: boolean;
  sync_interval_minutes: number;
}

export interface CrossRepoRequest {
  request_id: string;
  direction: RequestDirection;
  from_repo: string;
  to_repo: string;
  request_type: string;
  payload: string;
  status: RequestStatus;
  requires_approval: boolean;
  approved_by?: string;
  approved_at?: string;
  rejection_reason?: string;
  result?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface CrossRepoAuditLog {
  log_id: string;
  remote_repo: string;
  operation: string;
  direction: RequestDirection;
  request_id?: string;
  success: boolean;
  error?: string;
  created_at: string;
}

// ============================================================================
// Remote Repository Operations
// ============================================================================

export function addRemoteRepo(
  db: Database.Database,
  repo: Omit<RemoteRepo, "added_at" | "last_synced_at" | "sync_status">
): RemoteRepo {
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO remote_repos (
      url, display_name, description, trust_level, capabilities,
      rest_endpoint, ws_endpoint, git_url,
      added_at, added_by, auto_sync, sync_interval_minutes, sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    repo.url,
    repo.display_name,
    repo.description || null,
    repo.trust_level,
    repo.capabilities || null,
    repo.rest_endpoint || null,
    repo.ws_endpoint || null,
    repo.git_url || null,
    now,
    repo.added_by,
    repo.auto_sync ? 1 : 0,
    repo.sync_interval_minutes,
    "unknown"
  );

  return {
    ...repo,
    description: repo.description,
    capabilities: repo.capabilities,
    rest_endpoint: repo.rest_endpoint,
    ws_endpoint: repo.ws_endpoint,
    git_url: repo.git_url,
    added_at: now,
    sync_status: "unknown",
  };
}

export function getRemoteRepo(
  db: Database.Database,
  url: string
): RemoteRepo | undefined {
  const stmt = db.prepare("SELECT * FROM remote_repos WHERE url = ?");
  const row = stmt.get(url) as any;

  if (!row) return undefined;

  return {
    ...row,
    auto_sync: row.auto_sync === 1,
  };
}

export function listRemoteRepos(
  db: Database.Database,
  filters?: {
    trust_level?: TrustLevel;
    sync_status?: SyncStatus;
  }
): RemoteRepo[] {
  let query = "SELECT * FROM remote_repos WHERE 1=1";
  const params: any[] = [];

  if (filters?.trust_level) {
    query += " AND trust_level = ?";
    params.push(filters.trust_level);
  }

  if (filters?.sync_status) {
    query += " AND sync_status = ?";
    params.push(filters.sync_status);
  }

  query += " ORDER BY added_at DESC";

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as any[];

  return rows.map((row) => ({
    ...row,
    auto_sync: row.auto_sync === 1,
  }));
}

export function updateRemoteRepo(
  db: Database.Database,
  url: string,
  updates: Partial<Omit<RemoteRepo, "url" | "added_at" | "added_by">>
): RemoteRepo | undefined {
  const existing = getRemoteRepo(db, url);
  if (!existing) {
    throw new Error(`Remote repository ${url} not found`);
  }

  const fields: string[] = [];
  const params: any[] = [];

  if (updates.display_name !== undefined) {
    fields.push("display_name = ?");
    params.push(updates.display_name);
  }
  if (updates.description !== undefined) {
    fields.push("description = ?");
    params.push(updates.description);
  }
  if (updates.trust_level !== undefined) {
    fields.push("trust_level = ?");
    params.push(updates.trust_level);
  }
  if (updates.capabilities !== undefined) {
    fields.push("capabilities = ?");
    params.push(updates.capabilities);
  }
  if (updates.rest_endpoint !== undefined) {
    fields.push("rest_endpoint = ?");
    params.push(updates.rest_endpoint);
  }
  if (updates.ws_endpoint !== undefined) {
    fields.push("ws_endpoint = ?");
    params.push(updates.ws_endpoint);
  }
  if (updates.git_url !== undefined) {
    fields.push("git_url = ?");
    params.push(updates.git_url);
  }
  if (updates.sync_status !== undefined) {
    fields.push("sync_status = ?");
    params.push(updates.sync_status);
  }
  if (updates.last_synced_at !== undefined) {
    fields.push("last_synced_at = ?");
    params.push(updates.last_synced_at);
  }
  if (updates.auto_sync !== undefined) {
    fields.push("auto_sync = ?");
    params.push(updates.auto_sync ? 1 : 0);
  }
  if (updates.sync_interval_minutes !== undefined) {
    fields.push("sync_interval_minutes = ?");
    params.push(updates.sync_interval_minutes);
  }

  if (fields.length === 0) {
    return existing;
  }

  params.push(url);
  const query = `UPDATE remote_repos SET ${fields.join(", ")} WHERE url = ?`;

  db.prepare(query).run(...params);

  return getRemoteRepo(db, url);
}

export function removeRemoteRepo(
  db: Database.Database,
  url: string
): boolean {
  const stmt = db.prepare("DELETE FROM remote_repos WHERE url = ?");
  const result = stmt.run(url);
  return result.changes > 0;
}

export function remoteRepoExists(
  db: Database.Database,
  url: string
): boolean {
  return getRemoteRepo(db, url) !== undefined;
}

// ============================================================================
// Request Operations
// ============================================================================

export function getRequest(
  db: Database.Database,
  requestId: string
): CrossRepoRequest | undefined {
  const stmt = db.prepare("SELECT * FROM cross_repo_requests WHERE request_id = ?");
  const row = stmt.get(requestId) as any;

  if (!row) return undefined;

  return {
    ...row,
    requires_approval: row.requires_approval === 1,
  };
}

export function listRequests(
  db: Database.Database,
  filters?: {
    status?: RequestStatus;
    direction?: RequestDirection;
    from_repo?: string;
    to_repo?: string;
    limit?: number;
  }
): CrossRepoRequest[] {
  let query = "SELECT * FROM cross_repo_requests WHERE 1=1";
  const params: any[] = [];

  if (filters?.status) {
    query += " AND status = ?";
    params.push(filters.status);
  }

  if (filters?.direction) {
    query += " AND direction = ?";
    params.push(filters.direction);
  }

  if (filters?.from_repo) {
    query += " AND from_repo = ?";
    params.push(filters.from_repo);
  }

  if (filters?.to_repo) {
    query += " AND to_repo = ?";
    params.push(filters.to_repo);
  }

  query += " ORDER BY created_at DESC";

  if (filters?.limit) {
    query += " LIMIT ?";
    params.push(filters.limit);
  }

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as any[];

  return rows.map((row) => ({
    ...row,
    requires_approval: row.requires_approval === 1,
  }));
}

export function listPendingRequests(
  db: Database.Database,
  direction?: RequestDirection
): CrossRepoRequest[] {
  return listRequests(db, {
    status: "pending",
    direction,
  });
}

export function approveRequest(
  db: Database.Database,
  requestId: string,
  approver: string
): CrossRepoRequest {
  const request = getRequest(db, requestId);
  if (!request) {
    throw new Error(`Request ${requestId} not found`);
  }

  if (request.status !== "pending") {
    throw new Error(`Request ${requestId} is not pending`);
  }

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE cross_repo_requests
    SET status = ?, approved_by = ?, approved_at = ?, updated_at = ?
    WHERE request_id = ?
  `).run("approved", approver, now, now, requestId);

  return getRequest(db, requestId)!;
}

export function rejectRequest(
  db: Database.Database,
  requestId: string,
  reason: string
): CrossRepoRequest {
  const request = getRequest(db, requestId);
  if (!request) {
    throw new Error(`Request ${requestId} not found`);
  }

  if (request.status !== "pending") {
    throw new Error(`Request ${requestId} is not pending`);
  }

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE cross_repo_requests
    SET status = ?, rejection_reason = ?, completed_at = ?, updated_at = ?
    WHERE request_id = ?
  `).run("rejected", reason, now, now, requestId);

  return getRequest(db, requestId)!;
}

export function completeRequest(
  db: Database.Database,
  requestId: string,
  result: any
): CrossRepoRequest {
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE cross_repo_requests
    SET status = ?, result = ?, completed_at = ?, updated_at = ?
    WHERE request_id = ?
  `).run("completed", JSON.stringify(result), now, now, requestId);

  return getRequest(db, requestId)!;
}

export function failRequest(
  db: Database.Database,
  requestId: string,
  error: string
): CrossRepoRequest {
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE cross_repo_requests
    SET status = ?, result = ?, completed_at = ?, updated_at = ?
    WHERE request_id = ?
  `).run("failed", JSON.stringify({ error }), now, now, requestId);

  return getRequest(db, requestId)!;
}

// ============================================================================
// Audit Log Operations
// ============================================================================

export function createAuditLog(
  db: Database.Database,
  log: Omit<CrossRepoAuditLog, "log_id" | "created_at">
): string {
  const log_id = `log-${uuidv4()}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO cross_repo_audit_log (
      log_id, remote_repo, operation, direction,
      request_id, success, error, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    log_id,
    log.remote_repo,
    log.operation,
    log.direction,
    log.request_id || null,
    log.success ? 1 : 0,
    log.error || null,
    now
  );

  return log_id;
}

export function getAuditLogs(
  db: Database.Database,
  filters?: {
    remote_repo?: string;
    operation?: string;
    success?: boolean;
    limit?: number;
  }
): CrossRepoAuditLog[] {
  let query = "SELECT * FROM cross_repo_audit_log WHERE 1=1";
  const params: any[] = [];

  if (filters?.remote_repo) {
    query += " AND remote_repo = ?";
    params.push(filters.remote_repo);
  }

  if (filters?.operation) {
    query += " AND operation = ?";
    params.push(filters.operation);
  }

  if (filters?.success !== undefined) {
    query += " AND success = ?";
    params.push(filters.success ? 1 : 0);
  }

  query += " ORDER BY created_at DESC";

  if (filters?.limit) {
    query += " LIMIT ?";
    params.push(filters.limit);
  }

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as any[];

  return rows.map((row) => ({
    ...row,
    success: row.success === 1,
  }));
}
