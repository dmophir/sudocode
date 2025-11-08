/**
 * Tests for cross-repo WebSocket subscription service
 */

import { describe, it, expect, beforeEach } from "vitest";
import { initDatabase } from "../../../src/services/db.js";
import type Database from "better-sqlite3";
import {
  createSubscription,
  getSubscription,
  listSubscriptions,
  updateSubscription,
  deleteSubscription,
  publishEvent,
  handleSubscribe,
  handleUnsubscribe,
  cleanupConnection,
  wsManager,
  type Subscription,
} from "../../../src/services/subscriptions.js";

describe("Subscription Service", () => {
  let db: Database.Database;

  beforeEach(() => {
    // Initialize in-memory database
    db = initDatabase({ path: ":memory:" });

    // Create test remote repo for foreign key constraints
    db.prepare(`
      INSERT INTO remote_repos (
        url, display_name, trust_level, sync_status,
        auto_sync, sync_interval_minutes, added_by, added_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "github.com/test/repo",
      "Test Repo",
      "verified",
      "synced",
      0,
      60,
      "test",
      new Date().toISOString()
    );
  });

  describe("createSubscription", () => {
    it("should create a new subscription", () => {
      const sub = createSubscription(db, {
        local_repo: "local",
        remote_repo: "github.com/test/repo",
        entity_type: "issue",
        events: ["created", "updated"],
        active: true,
      });

      expect(sub.subscription_id).toMatch(/^sub-/);
      expect(sub.local_repo).toBe("local");
      expect(sub.remote_repo).toBe("github.com/test/repo");
      expect(sub.entity_type).toBe("issue");
      expect(sub.events).toEqual(["created", "updated"]);
      expect(sub.active).toBe(true);
    });

    it("should create subscription with entity ID", () => {
      const sub = createSubscription(db, {
        local_repo: "local",
        remote_repo: "github.com/test/repo",
        entity_type: "spec",
        entity_id: "spec-001",
        events: ["updated"],
        active: true,
      });

      expect(sub.entity_id).toBe("spec-001");
    });

    it("should create subscription with wildcard entity type", () => {
      const sub = createSubscription(db, {
        local_repo: "local",
        remote_repo: "github.com/test/repo",
        entity_type: "*",
        events: ["*"],
        active: true,
      });

      expect(sub.entity_type).toBe("*");
      expect(sub.events).toEqual(["*"]);
    });

    it("should create subscription with WebSocket connection ID", () => {
      const sub = createSubscription(db, {
        local_repo: "local",
        remote_repo: "github.com/test/repo",
        entity_type: "issue",
        events: ["created"],
        ws_connection_id: "conn-123",
        active: true,
      });

      expect(sub.ws_connection_id).toBe("conn-123");
    });

    it("should create subscription with webhook URL", () => {
      const sub = createSubscription(db, {
        local_repo: "local",
        remote_repo: "github.com/test/repo",
        entity_type: "issue",
        events: ["created"],
        webhook_url: "https://example.com/webhook",
        active: true,
      });

      expect(sub.webhook_url).toBe("https://example.com/webhook");
    });
  });

  describe("getSubscription", () => {
    it("should retrieve a subscription by ID", () => {
      const created = createSubscription(db, {
        local_repo: "local",
        remote_repo: "github.com/test/repo",
        entity_type: "issue",
        events: ["created"],
        active: true,
      });

      const retrieved = getSubscription(db, created.subscription_id);
      expect(retrieved).toMatchObject(created);
    });

    it("should return undefined for non-existent subscription", () => {
      const sub = getSubscription(db, "non-existent");
      expect(sub).toBeUndefined();
    });
  });

  describe("listSubscriptions", () => {
    beforeEach(() => {
      // Create test subscriptions
      createSubscription(db, {
        local_repo: "local",
        remote_repo: "github.com/test/repo",
        entity_type: "issue",
        events: ["created"],
        active: true,
      });

      createSubscription(db, {
        local_repo: "local",
        remote_repo: "github.com/test/repo",
        entity_type: "spec",
        events: ["updated"],
        active: true,
      });

      createSubscription(db, {
        local_repo: "local2",
        remote_repo: "github.com/test/repo",
        entity_type: "issue",
        events: ["deleted"],
        active: false,
      });
    });

    it("should list all subscriptions", () => {
      const subs = listSubscriptions(db);
      expect(subs).toHaveLength(3);
    });

    it("should filter by local_repo", () => {
      const subs = listSubscriptions(db, { local_repo: "local" });
      expect(subs).toHaveLength(2);
      expect(subs.every((s) => s.local_repo === "local")).toBe(true);
    });

    it("should filter by remote_repo", () => {
      const subs = listSubscriptions(db, {
        remote_repo: "github.com/test/repo",
      });
      expect(subs).toHaveLength(3);
    });

    it("should filter by active status", () => {
      const activeSubs = listSubscriptions(db, { active: true });
      expect(activeSubs).toHaveLength(2);
      expect(activeSubs.every((s) => s.active)).toBe(true);

      const inactiveSubs = listSubscriptions(db, { active: false });
      expect(inactiveSubs).toHaveLength(1);
      expect(inactiveSubs.every((s) => !s.active)).toBe(true);
    });

    it("should filter by multiple criteria", () => {
      const subs = listSubscriptions(db, {
        local_repo: "local",
        active: true,
      });
      expect(subs).toHaveLength(2);
    });
  });

  describe("updateSubscription", () => {
    it("should update subscription fields", () => {
      const sub = createSubscription(db, {
        local_repo: "local",
        remote_repo: "github.com/test/repo",
        entity_type: "issue",
        events: ["created"],
        active: true,
      });

      const updated = updateSubscription(db, sub.subscription_id, {
        events: ["created", "updated", "deleted"],
        active: false,
      });

      expect(updated?.events).toEqual(["created", "updated", "deleted"]);
      expect(updated?.active).toBe(false);
    });

    it("should throw error for non-existent subscription", () => {
      expect(() => {
        updateSubscription(db, "non-existent", { active: false });
      }).toThrow("not found");
    });
  });

  describe("deleteSubscription", () => {
    it("should delete a subscription", () => {
      const sub = createSubscription(db, {
        local_repo: "local",
        remote_repo: "github.com/test/repo",
        entity_type: "issue",
        events: ["created"],
        active: true,
      });

      const deleted = deleteSubscription(db, sub.subscription_id);
      expect(deleted).toBe(true);

      const retrieved = getSubscription(db, sub.subscription_id);
      expect(retrieved).toBeUndefined();
    });

    it("should return false for non-existent subscription", () => {
      const deleted = deleteSubscription(db, "non-existent");
      expect(deleted).toBe(false);
    });
  });

  describe("publishEvent", () => {
    it("should publish to matching subscriptions", async () => {
      // Create mock WebSocket
      const messages: any[] = [];
      const mockWs = {
        readyState: 1, // OPEN
        send: (data: string) => messages.push(JSON.parse(data)),
      };

      // Register connection with wsManager
      const connId = wsManager.addConnection(mockWs as any, "github.com/test/repo");

      // Create subscription with ws connection
      createSubscription(db, {
        local_repo: "local",
        remote_repo: "github.com/test/repo",
        entity_type: "issue",
        events: ["created"],
        ws_connection_id: connId,
        active: true,
      });

      // Publish event (no need to create actual issue in DB)
      const issueUuid = "uuid-123";
      const count = await publishEvent(
        db,
        {
          entity_type: "issue",
          entity_id: "issue-001",
          entity_uuid: issueUuid,
          event_type: "created",
          payload: { id: "issue-001", title: "Test Issue" },
        },
        "local"
      );

      expect(count).toBe(1);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        type: "event",
        event_type: "created",
        entity_type: "issue",
        entity_id: "issue-001",
        entity_uuid: issueUuid,
      });

      // Cleanup
      wsManager.removeConnection(connId);
    });

    it("should not publish to non-matching entity type", async () => {
      const messages: any[] = [];
      const mockWs = {
        readyState: 1,
        send: (data: string) => messages.push(JSON.parse(data)),
      };

      const connId = wsManager.addConnection(mockWs as any);

      // Create subscription for specs only
      createSubscription(db, {
        local_repo: "local",
        remote_repo: "github.com/test/repo",
        entity_type: "spec",
        events: ["*"],
        ws_connection_id: connId,
        active: true,
      });

      // Publish issue event
      const count = await publishEvent(
        db,
        {
          entity_type: "issue",
          entity_id: "issue-001",
          entity_uuid: "uuid-123",
          event_type: "created",
          payload: {},
        },
        "local"
      );

      expect(count).toBe(0);
      expect(messages).toHaveLength(0);

      wsManager.removeConnection(connId);
    });

    it("should publish to wildcard entity type subscriptions", async () => {
      const messages: any[] = [];
      const mockWs = {
        readyState: 1,
        send: (data: string) => messages.push(JSON.parse(data)),
      };

      const connId = wsManager.addConnection(mockWs as any);

      // Create subscription with wildcard entity type
      createSubscription(db, {
        local_repo: "local",
        remote_repo: "github.com/test/repo",
        entity_type: "*",
        events: ["*"],
        ws_connection_id: connId,
        active: true,
      });

      // Publish event
      const count = await publishEvent(
        db,
        {
          entity_type: "issue",
          entity_id: "issue-001",
          entity_uuid: "uuid-123",
          event_type: "created",
          payload: {},
        },
        "local"
      );

      expect(count).toBe(1);
      expect(messages).toHaveLength(1);

      wsManager.removeConnection(connId);
    });

    it("should filter by specific entity ID", async () => {
      const messages: any[] = [];
      const mockWs = {
        readyState: 1,
        send: (data: string) => messages.push(JSON.parse(data)),
      };

      const connId = wsManager.addConnection(mockWs as any);

      // Create subscription for specific issue
      createSubscription(db, {
        local_repo: "local",
        remote_repo: "github.com/test/repo",
        entity_type: "issue",
        entity_id: "issue-001",
        events: ["*"],
        ws_connection_id: connId,
        active: true,
      });

      // Publish event for different issue
      const count = await publishEvent(
        db,
        {
          entity_type: "issue",
          entity_id: "issue-002",
          entity_uuid: "uuid-456",
          event_type: "created",
          payload: {},
        },
        "local"
      );

      expect(count).toBe(0);
      expect(messages).toHaveLength(0);

      wsManager.removeConnection(connId);
    });

    it("should filter by event type", async () => {
      const messages: any[] = [];
      const mockWs = {
        readyState: 1,
        send: (data: string) => messages.push(JSON.parse(data)),
      };

      const connId = wsManager.addConnection(mockWs as any);

      // Create subscription for created events only
      createSubscription(db, {
        local_repo: "local",
        remote_repo: "github.com/test/repo",
        entity_type: "issue",
        events: ["created"],
        ws_connection_id: connId,
        active: true,
      });

      // Publish updated event
      const count = await publishEvent(
        db,
        {
          entity_type: "issue",
          entity_id: "issue-001",
          entity_uuid: "uuid-123",
          event_type: "updated",
          payload: {},
        },
        "local"
      );

      expect(count).toBe(0);
      expect(messages).toHaveLength(0);

      wsManager.removeConnection(connId);
    });
  });

  describe("handleSubscribe", () => {
    it("should create subscription for WebSocket connection", () => {
      const mockWs = { readyState: 1, send: () => {} };
      const connId = wsManager.addConnection(mockWs as any);

      const sub = handleSubscribe(
        db,
        connId,
        {
          remote_repo: "github.com/test/repo",
          entity_type: "issue",
          events: ["created", "updated"],
        },
        "local"
      );

      expect(sub.ws_connection_id).toBe(connId);
      expect(sub.remote_repo).toBe("github.com/test/repo");
      expect(sub.entity_type).toBe("issue");

      // Verify connection tracks subscription
      const conn = wsManager.getConnection(connId);
      expect(conn?.subscriptions.has(sub.subscription_id)).toBe(true);

      wsManager.removeConnection(connId);
    });
  });

  describe("handleUnsubscribe", () => {
    it("should remove subscription for WebSocket connection", () => {
      const mockWs = { readyState: 1, send: () => {} };
      const connId = wsManager.addConnection(mockWs as any);

      const sub = handleSubscribe(
        db,
        connId,
        {
          remote_repo: "github.com/test/repo",
          entity_type: "issue",
          events: ["created"],
        },
        "local"
      );

      const removed = handleUnsubscribe(db, connId, sub.subscription_id);
      expect(removed).toBe(true);

      // Verify subscription is deleted
      const retrieved = getSubscription(db, sub.subscription_id);
      expect(retrieved).toBeUndefined();

      wsManager.removeConnection(connId);
    });

    it("should return false for subscription not owned by connection", () => {
      const mockWs = { readyState: 1, send: () => {} };
      const connId1 = wsManager.addConnection(mockWs as any);
      const connId2 = wsManager.addConnection(mockWs as any);

      const sub = handleSubscribe(
        db,
        connId1,
        {
          remote_repo: "github.com/test/repo",
          entity_type: "issue",
          events: ["created"],
        },
        "local"
      );

      // Try to unsubscribe from different connection
      const removed = handleUnsubscribe(db, connId2, sub.subscription_id);
      expect(removed).toBe(false);

      wsManager.removeConnection(connId1);
      wsManager.removeConnection(connId2);
    });
  });

  describe("cleanupConnection", () => {
    it("should remove all subscriptions for a connection", () => {
      const mockWs = { readyState: 1, send: () => {} };
      const connId = wsManager.addConnection(mockWs as any);

      // Create multiple subscriptions
      const sub1 = handleSubscribe(
        db,
        connId,
        {
          remote_repo: "github.com/test/repo",
          entity_type: "issue",
          events: ["created"],
        },
        "local"
      );

      const sub2 = handleSubscribe(
        db,
        connId,
        {
          remote_repo: "github.com/test/repo",
          entity_type: "spec",
          events: ["updated"],
        },
        "local"
      );

      const cleaned = cleanupConnection(db, connId);
      expect(cleaned).toBe(2);

      // Verify subscriptions are deleted
      expect(getSubscription(db, sub1.subscription_id)).toBeUndefined();
      expect(getSubscription(db, sub2.subscription_id)).toBeUndefined();

      // Verify connection is removed
      expect(wsManager.getConnection(connId)).toBeUndefined();
    });

    it("should return 0 for non-existent connection", () => {
      const cleaned = cleanupConnection(db, "non-existent");
      expect(cleaned).toBe(0);
    });
  });
});
