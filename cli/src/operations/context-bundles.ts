/**
 * CRUD operations for Context Bundles
 */

import type Database from "better-sqlite3";
import type { ContextBundle, ContextBundleItem } from "../types.js";
import { generateUUID } from "../id-generator.js";

export interface CreateContextBundleInput {
  id: string;
  uuid?: string;
  name: string;
  description?: string;
  archived?: boolean;
  archived_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface UpdateContextBundleInput {
  name?: string;
  description?: string;
  archived?: boolean;
  archived_at?: string;
  updated_at?: string;
}

export interface AddBundleItemInput {
  bundle_id: string;
  entity_type: "session" | "spec" | "issue" | "execution";
  entity_id: string;
  order_index?: number;
}

/**
 * Create a new context bundle
 */
export function createContextBundle(
  db: Database.Database,
  input: CreateContextBundleInput
): ContextBundle {
  const uuid = input.uuid || generateUUID();

  const columns = ["id", "uuid", "name", "description", "archived"];
  const values = ["@id", "@uuid", "@name", "@description", "@archived"];

  if (input.created_at) {
    columns.push("created_at");
    values.push("@created_at");
  }
  if (input.updated_at) {
    columns.push("updated_at");
    values.push("@updated_at");
  }
  if (input.archived_at !== undefined) {
    columns.push("archived_at");
    values.push("@archived_at");
  }

  const stmt = db.prepare(`
    INSERT INTO context_bundles (${columns.join(", ")})
    VALUES (${values.join(", ")})
  `);

  const params: Record<string, any> = {
    id: input.id,
    uuid,
    name: input.name,
    description: input.description ?? null,
    archived: input.archived ? 1 : 0,
  };

  if (input.created_at) params.created_at = input.created_at;
  if (input.updated_at) params.updated_at = input.updated_at;
  if (input.archived_at !== undefined) params.archived_at = input.archived_at;

  stmt.run(params);

  const bundle = getContextBundle(db, input.id);
  if (!bundle) throw new Error(`Failed to create context bundle ${input.id}`);
  return bundle;
}

/**
 * Get a context bundle by ID
 */
export function getContextBundle(
  db: Database.Database,
  id: string
): ContextBundle | null {
  const stmt = db.prepare(`SELECT * FROM context_bundles WHERE id = ?`);
  return (stmt.get(id) as ContextBundle | undefined) ?? null;
}

/**
 * Update a context bundle
 */
export function updateContextBundle(
  db: Database.Database,
  id: string,
  input: UpdateContextBundleInput
): ContextBundle {
  const existing = getContextBundle(db, id);
  if (!existing) throw new Error(`Context bundle not found: ${id}`);

  const updates: string[] = [];
  const params: Record<string, any> = { id };

  if (input.name !== undefined && input.name !== existing.name) {
    updates.push("name = @name");
    params.name = input.name;
  }
  if (input.description !== undefined && input.description !== existing.description) {
    updates.push("description = @description");
    params.description = input.description;
  }
  if (input.archived !== undefined && input.archived !== existing.archived) {
    updates.push("archived = @archived");
    params.archived = input.archived ? 1 : 0;

    if (input.archived_at !== undefined) {
      updates.push("archived_at = @archived_at");
      params.archived_at = input.archived_at;
    } else if (input.archived && !existing.archived) {
      updates.push("archived_at = CURRENT_TIMESTAMP");
    } else if (!input.archived && existing.archived) {
      updates.push("archived_at = NULL");
    }
  }

  if (input.updated_at !== undefined) {
    updates.push("updated_at = @updated_at");
    params.updated_at = input.updated_at;
  } else if (updates.length > 0) {
    updates.push("updated_at = CURRENT_TIMESTAMP");
  }

  if (updates.length === 0) return existing;

  const stmt = db.prepare(`UPDATE context_bundles SET ${updates.join(", ")} WHERE id = @id`);
  stmt.run(params);

  const updated = getContextBundle(db, id);
  if (!updated) throw new Error(`Failed to update context bundle ${id}`);
  return updated;
}

/**
 * Delete a context bundle
 */
export function deleteContextBundle(db: Database.Database, id: string): boolean {
  const stmt = db.prepare(`DELETE FROM context_bundles WHERE id = ?`);
  const result = stmt.run(id);
  return result.changes > 0;
}

/**
 * List context bundles
 */
export function listContextBundles(
  db: Database.Database,
  options: { archived?: boolean; limit?: number; offset?: number } = {}
): ContextBundle[] {
  const conditions: string[] = [];
  const params: Record<string, any> = {};

  if (options.archived !== undefined) {
    conditions.push("archived = @archived");
    params.archived = options.archived ? 1 : 0;
  }

  let query = "SELECT * FROM context_bundles";
  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }
  query += " ORDER BY created_at DESC";

  if (options.limit !== undefined) {
    query += " LIMIT @limit";
    params.limit = options.limit;
  }
  if (options.offset !== undefined) {
    query += " OFFSET @offset";
    params.offset = options.offset;
  }

  const stmt = db.prepare(query);
  return stmt.all(params) as ContextBundle[];
}

/**
 * Add item to bundle
 */
export function addBundleItem(
  db: Database.Database,
  input: AddBundleItemInput
): ContextBundleItem {
  // Get max order_index for this bundle
  const maxStmt = db.prepare(`
    SELECT COALESCE(MAX(order_index), -1) as max_order
    FROM context_bundle_items
    WHERE bundle_id = ?
  `);
  const result = maxStmt.get(input.bundle_id) as { max_order: number };
  const orderIndex = input.order_index ?? result.max_order + 1;

  const stmt = db.prepare(`
    INSERT INTO context_bundle_items (bundle_id, entity_type, entity_id, order_index)
    VALUES (@bundle_id, @entity_type, @entity_id, @order_index)
  `);

  stmt.run({
    bundle_id: input.bundle_id,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    order_index: orderIndex,
  });

  return {
    bundle_id: input.bundle_id,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    order_index: orderIndex,
  };
}

/**
 * Remove item from bundle
 */
export function removeBundleItem(
  db: Database.Database,
  bundle_id: string,
  entity_type: string,
  entity_id: string
): boolean {
  const stmt = db.prepare(`
    DELETE FROM context_bundle_items
    WHERE bundle_id = ? AND entity_type = ? AND entity_id = ?
  `);
  const result = stmt.run(bundle_id, entity_type, entity_id);
  return result.changes > 0;
}

/**
 * Get all items in a bundle
 */
export function getBundleItems(
  db: Database.Database,
  bundle_id: string
): ContextBundleItem[] {
  const stmt = db.prepare(`
    SELECT * FROM context_bundle_items
    WHERE bundle_id = ?
    ORDER BY order_index
  `);
  return stmt.all(bundle_id) as ContextBundleItem[];
}

/**
 * Get bundles containing an entity
 */
export function getBundlesForEntity(
  db: Database.Database,
  entity_type: string,
  entity_id: string
): ContextBundle[] {
  const stmt = db.prepare(`
    SELECT cb.* FROM context_bundles cb
    JOIN context_bundle_items cbi ON cb.id = cbi.bundle_id
    WHERE cbi.entity_type = ? AND cbi.entity_id = ?
    ORDER BY cb.created_at DESC
  `);
  return stmt.all(entity_type, entity_id) as ContextBundle[];
}
