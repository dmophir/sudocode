/**
 * Federation metrics collection and reporting
 */

import type Database from "better-sqlite3";

// Metric types
export interface FederationMetrics {
  requests: {
    outgoing: {
      total: number;
      byStatus: Record<string, number>;
      byType: Record<string, number>;
    };
    incoming: {
      total: number;
      byStatus: Record<string, number>;
      byType: Record<string, number>;
    };
  };
  subscriptions: {
    total: number;
    active: number;
    inactive: number;
    byRemoteRepo: Record<string, number>;
  };
  events: {
    published: number;
    delivered: number;
    failed: number;
  };
  remoteRepos: {
    total: number;
    byTrustLevel: Record<string, number>;
  };
}

export interface MetricsSummary {
  timeRange: {
    start: string;
    end: string;
  };
  metrics: FederationMetrics;
}

/**
 * Get federation metrics for a time range
 */
export function getMetrics(
  db: Database.Database,
  startTime?: string,
  endTime?: string
): MetricsSummary {
  const now = new Date().toISOString();
  const start = startTime || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // Last 24 hours by default
  const end = endTime || now;

  // Request metrics - outgoing
  const outgoingTotal = db
    .prepare("SELECT COUNT(*) as count FROM cross_repo_requests WHERE direction = 'outgoing' AND created_at >= ? AND created_at <= ?")
    .get(start, end) as { count: number };

  const outgoingByStatus = db
    .prepare("SELECT status, COUNT(*) as count FROM cross_repo_requests WHERE direction = 'outgoing' AND created_at >= ? AND created_at <= ? GROUP BY status")
    .all(start, end) as Array<{ status: string; count: number }>;

  const outgoingByType = db
    .prepare("SELECT request_type, COUNT(*) as count FROM cross_repo_requests WHERE direction = 'outgoing' AND created_at >= ? AND created_at <= ? GROUP BY request_type")
    .all(start, end) as Array<{ request_type: string; count: number }>;

  // Request metrics - incoming
  const incomingTotal = db
    .prepare("SELECT COUNT(*) as count FROM cross_repo_requests WHERE direction = 'incoming' AND created_at >= ? AND created_at <= ?")
    .get(start, end) as { count: number };

  const incomingByStatus = db
    .prepare("SELECT status, COUNT(*) as count FROM cross_repo_requests WHERE direction = 'incoming' AND created_at >= ? AND created_at <= ? GROUP BY status")
    .all(start, end) as Array<{ status: string; count: number }>;

  const incomingByType = db
    .prepare("SELECT request_type, COUNT(*) as count FROM cross_repo_requests WHERE direction = 'incoming' AND created_at >= ? AND created_at <= ? GROUP BY request_type")
    .all(start, end) as Array<{ request_type: string; count: number }>;

  // Subscription metrics
  const subscriptionTotal = db
    .prepare("SELECT COUNT(*) as count FROM cross_repo_subscriptions")
    .get() as { count: number };

  const subscriptionActive = db
    .prepare("SELECT COUNT(*) as count FROM cross_repo_subscriptions WHERE active = 1")
    .get() as { count: number };

  const subscriptionsByRepo = db
    .prepare("SELECT remote_repo, COUNT(*) as count FROM cross_repo_subscriptions GROUP BY remote_repo")
    .all() as Array<{ remote_repo: string; count: number }>;

  // Event metrics (from audit log)
  const eventsPublished = db
    .prepare("SELECT COUNT(*) as count FROM cross_repo_audit_log WHERE operation_type = 'publish_event' AND timestamp >= ? AND timestamp <= ?")
    .get(start, end) as { count: number };

  const eventsDelivered = db
    .prepare("SELECT COUNT(*) as count FROM cross_repo_audit_log WHERE operation_type = 'publish_event' AND status = 'success' AND timestamp >= ? AND timestamp <= ?")
    .get(start, end) as { count: number };

  const eventsFailed = db
    .prepare("SELECT COUNT(*) as count FROM cross_repo_audit_log WHERE operation_type = 'publish_event' AND status = 'failed' AND timestamp >= ? AND timestamp <= ?")
    .get(start, end) as { count: number };

  // Remote repo metrics
  const remoteRepoTotal = db
    .prepare("SELECT COUNT(*) as count FROM remote_repos")
    .get() as { count: number };

  const remoteReposByTrust = db
    .prepare("SELECT trust_level, COUNT(*) as count FROM remote_repos GROUP BY trust_level")
    .all() as Array<{ trust_level: string; count: number }>;

  // Build metrics object
  const metrics: FederationMetrics = {
    requests: {
      outgoing: {
        total: outgoingTotal.count,
        byStatus: {},
        byType: {},
      },
      incoming: {
        total: incomingTotal.count,
        byStatus: {},
        byType: {},
      },
    },
    subscriptions: {
      total: subscriptionTotal.count,
      active: subscriptionActive.count,
      inactive: subscriptionTotal.count - subscriptionActive.count,
      byRemoteRepo: {},
    },
    events: {
      published: eventsPublished.count,
      delivered: eventsDelivered.count,
      failed: eventsFailed.count,
    },
    remoteRepos: {
      total: remoteRepoTotal.count,
      byTrustLevel: {},
    },
  };

  // Populate byStatus
  for (const row of outgoingByStatus) {
    metrics.requests.outgoing.byStatus[row.status] = row.count;
  }
  for (const row of incomingByStatus) {
    metrics.requests.incoming.byStatus[row.status] = row.count;
  }

  // Populate byType
  for (const row of outgoingByType) {
    metrics.requests.outgoing.byType[row.request_type] = row.count;
  }
  for (const row of incomingByType) {
    metrics.requests.incoming.byType[row.request_type] = row.count;
  }

  // Populate byRemoteRepo
  for (const row of subscriptionsByRepo) {
    metrics.subscriptions.byRemoteRepo[row.remote_repo] = row.count;
  }

  // Populate byTrustLevel
  for (const row of remoteReposByTrust) {
    metrics.remoteRepos.byTrustLevel[row.trust_level] = row.count;
  }

  return {
    timeRange: {
      start,
      end,
    },
    metrics,
  };
}

/**
 * Get top remote repositories by activity
 */
export function getTopRemoteRepos(
  db: Database.Database,
  limit: number = 10
): Array<{
  url: string;
  display_name: string;
  trust_level: string;
  request_count: number;
  subscription_count: number;
}> {
  const results = db
    .prepare(
      `
    SELECT
      rr.url,
      rr.display_name,
      rr.trust_level,
      (SELECT COUNT(*) FROM cross_repo_requests WHERE from_repo = rr.url OR to_repo = rr.url) as request_count,
      (SELECT COUNT(*) FROM cross_repo_subscriptions WHERE remote_repo = rr.url) as subscription_count
    FROM remote_repos rr
    ORDER BY request_count DESC, subscription_count DESC
    LIMIT ?
  `
    )
    .all(limit) as Array<{
    url: string;
    display_name: string;
    trust_level: string;
    request_count: number;
    subscription_count: number;
  }>;

  return results;
}

/**
 * Get recent federation activity (audit log)
 */
export function getRecentActivity(
  db: Database.Database,
  limit: number = 50
): Array<{
  log_id: string;
  operation_type: string;
  direction: string;
  local_repo: string;
  remote_repo: string;
  status: string;
  timestamp: string;
  request_id?: string;
  error_message?: string;
}> {
  const results = db
    .prepare(
      `
    SELECT
      log_id,
      operation_type,
      direction,
      local_repo,
      remote_repo,
      status,
      timestamp,
      request_id,
      error_message
    FROM cross_repo_audit_log
    ORDER BY timestamp DESC
    LIMIT ?
  `
    )
    .all(limit) as Array<{
    log_id: string;
    operation_type: string;
    direction: string;
    local_repo: string;
    remote_repo: string;
    status: string;
    timestamp: string;
    request_id?: string;
    error_message?: string;
  }>;

  return results;
}

/**
 * Get federation health status
 */
export function getHealthStatus(
  db: Database.Database
): {
  status: "healthy" | "degraded" | "critical";
  issues: string[];
  stats: {
    pendingRequests: number;
    failedRequests: number;
    activeSubscriptions: number;
    remoteRepos: number;
  };
} {
  // Get stats
  const pendingRequests = db
    .prepare("SELECT COUNT(*) as count FROM cross_repo_requests WHERE status = 'pending'")
    .get() as { count: number };

  const failedRequests = db
    .prepare(
      "SELECT COUNT(*) as count FROM cross_repo_requests WHERE status = 'failed' AND created_at >= datetime('now', '-1 hour')"
    )
    .get() as { count: number };

  const activeSubscriptions = db
    .prepare("SELECT COUNT(*) as count FROM cross_repo_subscriptions WHERE active = 1")
    .get() as { count: number };

  const remoteRepos = db
    .prepare("SELECT COUNT(*) as count FROM remote_repos")
    .get() as { count: number };

  // Determine health status
  const issues: string[] = [];
  let status: "healthy" | "degraded" | "critical" = "healthy";

  // Check for pending requests older than 1 hour
  const oldPendingRequests = db
    .prepare(
      "SELECT COUNT(*) as count FROM cross_repo_requests WHERE status = 'pending' AND created_at < datetime('now', '-1 hour')"
    )
    .get() as { count: number };

  if (oldPendingRequests.count > 0) {
    issues.push(`${oldPendingRequests.count} pending requests older than 1 hour`);
    status = "degraded";
  }

  // Check for failed requests
  if (failedRequests.count > 10) {
    issues.push(`${failedRequests.count} failed requests in the last hour`);
    status = "critical";
  } else if (failedRequests.count > 5) {
    issues.push(`${failedRequests.count} failed requests in the last hour`);
    if (status === "healthy") {
      status = "degraded";
    }
  }

  // Check for stale subscriptions
  const staleSubscriptions = db
    .prepare(
      "SELECT COUNT(*) as count FROM cross_repo_subscriptions WHERE active = 1 AND last_event_at IS NOT NULL AND last_event_at < datetime('now', '-7 days')"
    )
    .get() as { count: number };

  if (staleSubscriptions.count > 0) {
    issues.push(`${staleSubscriptions.count} subscriptions with no events in 7 days`);
    if (status === "healthy") {
      status = "degraded";
    }
  }

  return {
    status,
    issues,
    stats: {
      pendingRequests: pendingRequests.count,
      failedRequests: failedRequests.count,
      activeSubscriptions: activeSubscriptions.count,
      remoteRepos: remoteRepos.count,
    },
  };
}
