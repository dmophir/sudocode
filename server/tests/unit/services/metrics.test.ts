/**
 * Tests for federation metrics service
 */

import { describe, it, expect, beforeEach } from "vitest";
import { initDatabase } from "../../../src/services/db.js";
import type Database from "better-sqlite3";
import {
  getMetrics,
  getTopRemoteRepos,
  getRecentActivity,
  getHealthStatus,
} from "../../../src/services/metrics.js";

describe("Metrics Service", () => {
  let db: Database.Database;

  beforeEach(() => {
    // Initialize in-memory database
    db = initDatabase({ path: ":memory:" });

    // Create test data
    const now = new Date().toISOString();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // Create remote repos
    db.prepare(`
      INSERT INTO remote_repos (url, display_name, trust_level, sync_status, auto_sync, sync_interval_minutes, added_by, added_at)
      VALUES
        ('github.com/org1/repo1', 'Org1 Repo1', 'trusted', 'synced', 0, 60, 'test', ?),
        ('github.com/org2/repo2', 'Org2 Repo2', 'verified', 'synced', 0, 60, 'test', ?),
        ('github.com/org3/repo3', 'Org3 Repo3', 'untrusted', 'synced', 0, 60, 'test', ?)
    `).run(now, now, now);

    // Create cross-repo requests
    db.prepare(`
      INSERT INTO cross_repo_requests (request_id, direction, from_repo, to_repo, request_type, payload, status, created_at)
      VALUES
        ('req-1', 'outgoing', 'local', 'github.com/org1/repo1', 'query', '{}', 'completed', ?),
        ('req-2', 'outgoing', 'local', 'github.com/org1/repo1', 'create_issue', '{}', 'pending', ?),
        ('req-3', 'incoming', 'github.com/org2/repo2', 'local', 'query', '{}', 'approved', ?),
        ('req-4', 'incoming', 'github.com/org2/repo2', 'local', 'update_issue', '{}', 'failed', ?)
    `).run(oneHourAgo, now, oneHourAgo, now);

    // Create subscriptions
    db.prepare(`
      INSERT INTO cross_repo_subscriptions (subscription_id, local_repo, remote_repo, entity_type, events, active, created_at)
      VALUES
        ('sub-1', 'local', 'github.com/org1/repo1', 'issue', '["created"]', 1, ?),
        ('sub-2', 'local', 'github.com/org2/repo2', 'spec', '["updated"]', 1, ?),
        ('sub-3', 'local', 'github.com/org3/repo3', 'issue', '["deleted"]', 0, ?)
    `).run(now, now, now);

    // Create audit log entries
    db.prepare(`
      INSERT INTO cross_repo_audit_log (log_id, operation_type, direction, local_repo, remote_repo, status, timestamp)
      VALUES
        ('log-1', 'publish_event', 'outgoing', 'local', 'github.com/org1/repo1', 'success', ?),
        ('log-2', 'publish_event', 'outgoing', 'local', 'github.com/org2/repo2', 'success', ?),
        ('log-3', 'publish_event', 'outgoing', 'local', 'github.com/org3/repo3', 'failed', ?)
    `).run(oneHourAgo, now, now);
  });

  describe("getMetrics", () => {
    it("should return federation metrics for default time range", () => {
      const metrics = getMetrics(db);

      expect(metrics).toHaveProperty("timeRange");
      expect(metrics).toHaveProperty("metrics");

      expect(metrics.metrics.requests.outgoing.total).toBeGreaterThanOrEqual(0);
      expect(metrics.metrics.requests.incoming.total).toBeGreaterThanOrEqual(0);
      expect(metrics.metrics.subscriptions.total).toBe(3);
      expect(metrics.metrics.subscriptions.active).toBe(2);
      expect(metrics.metrics.subscriptions.inactive).toBe(1);
      expect(metrics.metrics.remoteRepos.total).toBe(3);
    });

    it("should group requests by status", () => {
      const metrics = getMetrics(db);

      expect(metrics.metrics.requests.outgoing.byStatus).toHaveProperty("completed");
      expect(metrics.metrics.requests.outgoing.byStatus).toHaveProperty("pending");
      expect(metrics.metrics.requests.incoming.byStatus).toHaveProperty("approved");
      expect(metrics.metrics.requests.incoming.byStatus).toHaveProperty("failed");
    });

    it("should group requests by type", () => {
      const metrics = getMetrics(db);

      expect(metrics.metrics.requests.outgoing.byType).toHaveProperty("query");
      expect(metrics.metrics.requests.outgoing.byType).toHaveProperty("create_issue");
      expect(metrics.metrics.requests.incoming.byType).toHaveProperty("query");
    });

    it("should group subscriptions by remote repo", () => {
      const metrics = getMetrics(db);

      expect(metrics.metrics.subscriptions.byRemoteRepo).toHaveProperty("github.com/org1/repo1");
      expect(metrics.metrics.subscriptions.byRemoteRepo).toHaveProperty("github.com/org2/repo2");
      expect(metrics.metrics.subscriptions.byRemoteRepo["github.com/org1/repo1"]).toBe(1);
    });

    it("should group remote repos by trust level", () => {
      const metrics = getMetrics(db);

      expect(metrics.metrics.remoteRepos.byTrustLevel).toHaveProperty("trusted");
      expect(metrics.metrics.remoteRepos.byTrustLevel).toHaveProperty("verified");
      expect(metrics.metrics.remoteRepos.byTrustLevel).toHaveProperty("untrusted");
      expect(metrics.metrics.remoteRepos.byTrustLevel.trusted).toBe(1);
      expect(metrics.metrics.remoteRepos.byTrustLevel.verified).toBe(1);
      expect(metrics.metrics.remoteRepos.byTrustLevel.untrusted).toBe(1);
    });

    it("should filter by time range", () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      const metrics = getMetrics(
        db,
        twoHoursAgo.toISOString(),
        oneHourAgo.toISOString()
      );

      // Should only include requests from 1-2 hours ago
      expect(metrics.timeRange.start).toBe(twoHoursAgo.toISOString());
      expect(metrics.timeRange.end).toBe(oneHourAgo.toISOString());
    });

    it("should track event metrics", () => {
      const metrics = getMetrics(db);

      expect(metrics.metrics.events.published).toBeGreaterThanOrEqual(0);
      expect(metrics.metrics.events.delivered).toBeGreaterThanOrEqual(0);
      expect(metrics.metrics.events.failed).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getTopRemoteRepos", () => {
    it("should return top remote repos by activity", () => {
      const topRepos = getTopRemoteRepos(db, 5);

      expect(Array.isArray(topRepos)).toBe(true);
      expect(topRepos.length).toBeGreaterThan(0);

      // Each repo should have required fields
      if (topRepos.length > 0) {
        expect(topRepos[0]).toHaveProperty("url");
        expect(topRepos[0]).toHaveProperty("display_name");
        expect(topRepos[0]).toHaveProperty("trust_level");
        expect(topRepos[0]).toHaveProperty("request_count");
        expect(topRepos[0]).toHaveProperty("subscription_count");
      }
    });

    it("should respect limit parameter", () => {
      const topRepos = getTopRemoteRepos(db, 2);
      expect(topRepos.length).toBeLessThanOrEqual(2);
    });

    it("should order by activity", () => {
      const topRepos = getTopRemoteRepos(db, 10);

      // Verify ordering (first should have >= activity than second)
      if (topRepos.length >= 2) {
        const firstActivity = topRepos[0].request_count + topRepos[0].subscription_count;
        const secondActivity = topRepos[1].request_count + topRepos[1].subscription_count;
        expect(firstActivity).toBeGreaterThanOrEqual(secondActivity);
      }
    });
  });

  describe("getRecentActivity", () => {
    it("should return recent audit log entries", () => {
      const activity = getRecentActivity(db, 50);

      expect(Array.isArray(activity)).toBe(true);

      // Each activity should have required fields
      if (activity.length > 0) {
        expect(activity[0]).toHaveProperty("log_id");
        expect(activity[0]).toHaveProperty("operation_type");
        expect(activity[0]).toHaveProperty("direction");
        expect(activity[0]).toHaveProperty("local_repo");
        expect(activity[0]).toHaveProperty("remote_repo");
        expect(activity[0]).toHaveProperty("status");
        expect(activity[0]).toHaveProperty("timestamp");
      }
    });

    it("should respect limit parameter", () => {
      const activity = getRecentActivity(db, 2);
      expect(activity.length).toBeLessThanOrEqual(2);
    });

    it("should order by timestamp descending", () => {
      const activity = getRecentActivity(db, 10);

      // Verify ordering (most recent first)
      if (activity.length >= 2) {
        const firstTime = new Date(activity[0].timestamp).getTime();
        const secondTime = new Date(activity[1].timestamp).getTime();
        expect(firstTime).toBeGreaterThanOrEqual(secondTime);
      }
    });
  });

  describe("getHealthStatus", () => {
    it("should return health status", () => {
      const health = getHealthStatus(db);

      expect(health).toHaveProperty("status");
      expect(health).toHaveProperty("issues");
      expect(health).toHaveProperty("stats");

      expect(["healthy", "degraded", "critical"]).toContain(health.status);
      expect(Array.isArray(health.issues)).toBe(true);

      expect(health.stats).toHaveProperty("pendingRequests");
      expect(health.stats).toHaveProperty("failedRequests");
      expect(health.stats).toHaveProperty("activeSubscriptions");
      expect(health.stats).toHaveProperty("remoteRepos");
    });

    it("should report correct stats", () => {
      const health = getHealthStatus(db);

      expect(health.stats.pendingRequests).toBe(1);
      expect(health.stats.activeSubscriptions).toBe(2);
      expect(health.stats.remoteRepos).toBe(3);
    });

    it("should detect pending requests", () => {
      const health = getHealthStatus(db);

      // We have 1 pending request
      expect(health.stats.pendingRequests).toBeGreaterThan(0);
    });

    it("should be healthy with no issues", () => {
      // Clear all problematic data
      db.prepare("DELETE FROM cross_repo_requests WHERE status = 'pending'").run();
      db.prepare("DELETE FROM cross_repo_requests WHERE status = 'failed'").run();

      const health = getHealthStatus(db);

      expect(health.status).toBe("healthy");
      expect(health.issues).toHaveLength(0);
    });

    it("should detect degraded state with old pending requests", () => {
      // Clear existing pending requests first
      db.prepare("DELETE FROM cross_repo_requests WHERE status = 'pending'").run();

      // Create old pending request using SQLite's datetime function
      db.prepare(`
        INSERT INTO cross_repo_requests (request_id, direction, from_repo, to_repo, request_type, payload, status, created_at)
        VALUES ('req-old', 'outgoing', 'local', 'github.com/org1/repo1', 'query', '{}', 'pending', datetime('now', '-2 hours'))
      `).run();

      const health = getHealthStatus(db);

      expect(["degraded", "critical"]).toContain(health.status);
      expect(health.issues.length).toBeGreaterThan(0);
      expect(health.issues.some((issue) => issue.includes("older than 1 hour"))).toBe(true);
    });

    it("should detect critical state with many failed requests", () => {
      // Create many failed requests
      const now = new Date().toISOString();
      const stmt = db.prepare(`
        INSERT INTO cross_repo_requests (request_id, direction, from_repo, to_repo, request_type, payload, status, created_at)
        VALUES (?, 'outgoing', 'local', 'github.com/org1/repo1', 'query', '{}', 'failed', ?)
      `);

      for (let i = 0; i < 15; i++) {
        stmt.run(`req-fail-${i}`, now);
      }

      const health = getHealthStatus(db);

      expect(health.status).toBe("critical");
      expect(health.issues.some((issue) => issue.includes("failed requests"))).toBe(true);
    });
  });
});
