/**
 * WebSocket subscription service for real-time cross-repo updates
 *
 * Manages subscriptions to remote repository events and publishes
 * local events to subscribed remote repositories.
 */

import type Database from "better-sqlite3";
import type { WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";

export interface Subscription {
  subscription_id: string;
  local_repo: string;
  remote_repo: string;
  entity_type: "issue" | "spec" | "*";
  entity_id?: string;
  events: string[]; // ["created", "updated", "closed", etc.]
  webhook_url?: string;
  ws_connection_id?: string;
  active: boolean;
  created_at: string;
  last_event_at?: string;
}

export interface SubscriptionEvent {
  event_id: string;
  subscription_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  entity_uuid: string;
  payload: any;
  timestamp: string;
}

export interface WebSocketConnection {
  id: string;
  ws: WebSocket;
  remoteRepo?: string;
  subscriptions: Set<string>;
  lastPing: number;
}

/**
 * In-memory WebSocket connection management
 */
class WebSocketManager {
  private connections: Map<string, WebSocketConnection> = new Map();

  addConnection(ws: WebSocket, remoteRepo?: string): string {
    const id = uuidv4();
    this.connections.set(id, {
      id,
      ws,
      remoteRepo,
      subscriptions: new Set(),
      lastPing: Date.now(),
    });
    return id;
  }

  removeConnection(id: string): void {
    this.connections.delete(id);
  }

  getConnection(id: string): WebSocketConnection | undefined {
    return this.connections.get(id);
  }

  getConnectionsByRemoteRepo(remoteRepo: string): WebSocketConnection[] {
    return Array.from(this.connections.values()).filter(
      (conn) => conn.remoteRepo === remoteRepo
    );
  }

  getAllConnections(): WebSocketConnection[] {
    return Array.from(this.connections.values());
  }

  updatePing(id: string): void {
    const conn = this.connections.get(id);
    if (conn) {
      conn.lastPing = Date.now();
    }
  }
}

export const wsManager = new WebSocketManager();

/**
 * Create a new subscription
 */
export function createSubscription(
  db: Database.Database,
  subscription: Omit<Subscription, "subscription_id" | "created_at">
): Subscription {
  const subscriptionId = `sub-${uuidv4()}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO cross_repo_subscriptions (
      subscription_id, local_repo, remote_repo,
      entity_type, entity_id, events,
      webhook_url, ws_connection_id, active, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    subscriptionId,
    subscription.local_repo,
    subscription.remote_repo,
    subscription.entity_type,
    subscription.entity_id || null,
    JSON.stringify(subscription.events),
    subscription.webhook_url || null,
    subscription.ws_connection_id || null,
    subscription.active ? 1 : 0,
    now
  );

  return {
    ...subscription,
    subscription_id: subscriptionId,
    created_at: now,
  };
}

/**
 * Get subscription by ID
 */
export function getSubscription(
  db: Database.Database,
  subscriptionId: string
): Subscription | undefined {
  const row = db.prepare(`
    SELECT * FROM cross_repo_subscriptions WHERE subscription_id = ?
  `).get(subscriptionId) as any;

  if (!row) return undefined;

  return {
    ...row,
    events: JSON.parse(row.events),
    active: row.active === 1,
  };
}

/**
 * List all subscriptions
 */
export function listSubscriptions(
  db: Database.Database,
  filters?: {
    local_repo?: string;
    remote_repo?: string;
    active?: boolean;
  }
): Subscription[] {
  let query = "SELECT * FROM cross_repo_subscriptions WHERE 1=1";
  const params: any[] = [];

  if (filters?.local_repo) {
    query += " AND local_repo = ?";
    params.push(filters.local_repo);
  }

  if (filters?.remote_repo) {
    query += " AND remote_repo = ?";
    params.push(filters.remote_repo);
  }

  if (filters?.active !== undefined) {
    query += " AND active = ?";
    params.push(filters.active ? 1 : 0);
  }

  query += " ORDER BY created_at DESC";

  const rows = db.prepare(query).all(...params) as any[];

  return rows.map((row) => ({
    ...row,
    events: JSON.parse(row.events),
    active: row.active === 1,
  }));
}

/**
 * Update subscription
 */
export function updateSubscription(
  db: Database.Database,
  subscriptionId: string,
  updates: Partial<Omit<Subscription, "subscription_id" | "created_at">>
): Subscription | undefined {
  const existing = getSubscription(db, subscriptionId);
  if (!existing) {
    throw new Error(`Subscription ${subscriptionId} not found`);
  }

  const fields: string[] = [];
  const params: any[] = [];

  if (updates.entity_type !== undefined) {
    fields.push("entity_type = ?");
    params.push(updates.entity_type);
  }

  if (updates.entity_id !== undefined) {
    fields.push("entity_id = ?");
    params.push(updates.entity_id);
  }

  if (updates.events !== undefined) {
    fields.push("events = ?");
    params.push(JSON.stringify(updates.events));
  }

  if (updates.webhook_url !== undefined) {
    fields.push("webhook_url = ?");
    params.push(updates.webhook_url);
  }

  if (updates.ws_connection_id !== undefined) {
    fields.push("ws_connection_id = ?");
    params.push(updates.ws_connection_id);
  }

  if (updates.active !== undefined) {
    fields.push("active = ?");
    params.push(updates.active ? 1 : 0);
  }

  if (fields.length === 0) {
    return existing;
  }

  params.push(subscriptionId);
  const query = `UPDATE cross_repo_subscriptions SET ${fields.join(", ")} WHERE subscription_id = ?`;

  db.prepare(query).run(...params);

  return getSubscription(db, subscriptionId);
}

/**
 * Delete subscription
 */
export function deleteSubscription(
  db: Database.Database,
  subscriptionId: string
): boolean {
  const result = db.prepare(`
    DELETE FROM cross_repo_subscriptions WHERE subscription_id = ?
  `).run(subscriptionId);

  return result.changes > 0;
}

/**
 * Publish event to subscribers
 */
export async function publishEvent(
  db: Database.Database,
  event: {
    entity_type: "issue" | "spec";
    entity_id: string;
    entity_uuid: string;
    event_type: string; // "created", "updated", "closed", etc.
    payload: any;
  },
  localRepo: string
): Promise<number> {
  // Find matching subscriptions
  const subscriptions = listSubscriptions(db, {
    local_repo: localRepo,
    active: true,
  });

  let publishedCount = 0;

  for (const sub of subscriptions) {
    // Check if subscription matches the event
    if (
      sub.entity_type !== "*" &&
      sub.entity_type !== event.entity_type
    ) {
      continue;
    }

    if (
      sub.entity_id &&
      sub.entity_id !== event.entity_id
    ) {
      continue;
    }

    if (!sub.events.includes(event.event_type) && !sub.events.includes("*")) {
      continue;
    }

    // Publish to WebSocket if connection exists
    if (sub.ws_connection_id) {
      const conn = wsManager.getConnection(sub.ws_connection_id);
      if (conn && conn.ws.readyState === 1) { // OPEN
        try {
          conn.ws.send(JSON.stringify({
            type: "event",
            subscription_id: sub.subscription_id,
            event_id: uuidv4(),
            event_type: event.event_type,
            entity_type: event.entity_type,
            entity_id: event.entity_id,
            entity_uuid: event.entity_uuid,
            payload: event.payload,
            timestamp: new Date().toISOString(),
          }));
          publishedCount++;
        } catch (error) {
          console.error("Failed to send WebSocket event:", error);
        }
      }
    }

    // TODO: Publish to webhook if configured
    // if (sub.webhook_url) {
    //   await sendWebhook(sub.webhook_url, event);
    // }

    // Update last event timestamp
    db.prepare(`
      UPDATE cross_repo_subscriptions
      SET last_event_at = ?
      WHERE subscription_id = ?
    `).run(new Date().toISOString(), sub.subscription_id);
  }

  return publishedCount;
}

/**
 * Handle incoming WebSocket subscription request
 */
export function handleSubscribe(
  db: Database.Database,
  connectionId: string,
  message: {
    remote_repo: string;
    entity_type: "issue" | "spec" | "*";
    entity_id?: string;
    events: string[];
  },
  localRepo: string
): Subscription {
  const subscription = createSubscription(db, {
    local_repo: localRepo,
    remote_repo: message.remote_repo,
    entity_type: message.entity_type,
    entity_id: message.entity_id,
    events: message.events,
    ws_connection_id: connectionId,
    active: true,
  });

  // Add to connection's subscription set
  const conn = wsManager.getConnection(connectionId);
  if (conn) {
    conn.subscriptions.add(subscription.subscription_id);
  }

  return subscription;
}

/**
 * Handle incoming WebSocket unsubscribe request
 */
export function handleUnsubscribe(
  db: Database.Database,
  connectionId: string,
  subscriptionId: string
): boolean {
  const subscription = getSubscription(db, subscriptionId);

  if (!subscription || subscription.ws_connection_id !== connectionId) {
    return false;
  }

  // Remove from connection's subscription set
  const conn = wsManager.getConnection(connectionId);
  if (conn) {
    conn.subscriptions.delete(subscriptionId);
  }

  return deleteSubscription(db, subscriptionId);
}

/**
 * Clean up subscriptions for a disconnected WebSocket
 */
export function cleanupConnection(
  db: Database.Database,
  connectionId: string
): number {
  const conn = wsManager.getConnection(connectionId);
  if (!conn) return 0;

  let cleaned = 0;
  for (const subId of conn.subscriptions) {
    if (deleteSubscription(db, subId)) {
      cleaned++;
    }
  }

  wsManager.removeConnection(connectionId);
  return cleaned;
}

/**
 * Periodic cleanup of stale connections
 */
export function cleanupStaleConnections(
  db: Database.Database,
  maxAgeMs: number = 5 * 60 * 1000 // 5 minutes
): number {
  const now = Date.now();
  const staleConnections: string[] = [];

  for (const conn of wsManager.getAllConnections()) {
    if (now - conn.lastPing > maxAgeMs) {
      staleConnections.push(conn.id);
    }
  }

  let cleaned = 0;
  for (const connId of staleConnections) {
    cleaned += cleanupConnection(db, connId);
  }

  return cleaned;
}
