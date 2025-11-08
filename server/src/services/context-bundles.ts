/**
 * Context Bundles service - wraps CLI operations for API use
 */

import type Database from "better-sqlite3";
import {
  getContextBundle,
  listContextBundles,
  createContextBundle,
  updateContextBundle,
  deleteContextBundle,
  addBundleItem,
  removeBundleItem,
  getBundleItems,
  getBundlesForEntity,
  type CreateContextBundleInput,
  type UpdateContextBundleInput,
  type AddBundleItemInput,
} from "@sudocode-ai/cli/dist/operations/index.js";
import type { ContextBundle, ContextBundleItem } from "@sudocode-ai/types";

/**
 * Get all context bundles with optional filtering
 */
export function getAllBundles(
  db: Database.Database,
  options?: { archived?: boolean; limit?: number; offset?: number }
): ContextBundle[] {
  return listContextBundles(db, options || {});
}

/**
 * Get a single bundle by ID
 */
export function getBundleById(db: Database.Database, id: string): ContextBundle | null {
  return getContextBundle(db, id);
}

/**
 * Create a new bundle
 */
export function createNewBundle(
  db: Database.Database,
  input: CreateContextBundleInput
): ContextBundle {
  return createContextBundle(db, input);
}

/**
 * Update an existing bundle
 */
export function updateExistingBundle(
  db: Database.Database,
  id: string,
  input: UpdateContextBundleInput
): ContextBundle {
  return updateContextBundle(db, id, input);
}

/**
 * Delete a bundle
 */
export function deleteExistingBundle(db: Database.Database, id: string): boolean {
  return deleteContextBundle(db, id);
}

/**
 * Add item to bundle
 */
export function addItemToBundle(
  db: Database.Database,
  input: AddBundleItemInput
): ContextBundleItem {
  return addBundleItem(db, input);
}

/**
 * Remove item from bundle
 */
export function removeItemFromBundle(
  db: Database.Database,
  bundle_id: string,
  entity_type: string,
  entity_id: string
): boolean {
  return removeBundleItem(db, bundle_id, entity_type, entity_id);
}

/**
 * Get items in a bundle
 */
export function getItemsInBundle(
  db: Database.Database,
  bundle_id: string
): ContextBundleItem[] {
  return getBundleItems(db, bundle_id);
}

/**
 * Get bundles containing an entity
 */
export function getBundlesContainingEntity(
  db: Database.Database,
  entity_type: string,
  entity_id: string
): ContextBundle[] {
  return getBundlesForEntity(db, entity_type, entity_id);
}
