/**
 * Context Bundles API routes (mapped to /api/bundles)
 */

import { Router, Request, Response } from "express";
import type Database from "better-sqlite3";
import {
  getAllBundles,
  getBundleById,
  createNewBundle,
  updateExistingBundle,
  deleteExistingBundle,
  addItemToBundle,
  removeItemFromBundle,
  getItemsInBundle,
  getBundlesContainingEntity,
} from "../services/context-bundles.js";
import { generateBundleId } from "@sudocode-ai/cli/dist/id-generator.js";
import { getSudocodeDir } from "../utils/sudocode-dir.js";

export function createBundlesRouter(db: Database.Database): Router {
  const router = Router();

  /**
   * GET /api/bundles - List all bundles
   */
  router.get("/", (req: Request, res: Response) => {
    try {
      const options: any = {};

      // Default to excluding archived unless explicitly specified
      options.archived =
        req.query.archived !== undefined
          ? req.query.archived === "true"
          : false;
      if (req.query.limit) {
        options.limit = parseInt(req.query.limit as string, 10);
      }
      if (req.query.offset) {
        options.offset = parseInt(req.query.offset as string, 10);
      }

      const bundles = getAllBundles(db, options);

      res.json({
        success: true,
        data: bundles,
      });
    } catch (error) {
      console.error("Error listing bundles:", error);
      res.status(500).json({
        success: false,
        data: null,
        error_data: error instanceof Error ? error.message : String(error),
        message: "Failed to list bundles",
      });
    }
  });

  /**
   * GET /api/bundles/:id - Get a specific bundle
   */
  router.get("/:id", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const bundle = getBundleById(db, id);

      if (!bundle) {
        res.status(404).json({
          success: false,
          data: null,
          message: `Bundle not found: ${id}`,
        });
        return;
      }

      res.json({
        success: true,
        data: bundle,
      });
    } catch (error) {
      console.error("Error getting bundle:", error);
      res.status(500).json({
        success: false,
        data: null,
        error_data: error instanceof Error ? error.message : String(error),
        message: "Failed to get bundle",
      });
    }
  });

  /**
   * GET /api/bundles/:id/items - Get items in a bundle
   */
  router.get("/:id/items", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const items = getItemsInBundle(db, id);

      res.json({
        success: true,
        data: items,
      });
    } catch (error) {
      console.error("Error getting bundle items:", error);
      res.status(500).json({
        success: false,
        data: null,
        error_data: error instanceof Error ? error.message : String(error),
        message: "Failed to get bundle items",
      });
    }
  });

  /**
   * POST /api/bundles - Create a new bundle
   */
  router.post("/", (req: Request, res: Response) => {
    try {
      const { name, description } = req.body;

      // Validate required fields
      if (!name || typeof name !== "string") {
        res.status(400).json({
          success: false,
          data: null,
          message: "name is required and must be a string",
        });
        return;
      }

      if (name.length > 500) {
        res.status(400).json({
          success: false,
          data: null,
          message: "Name must be 500 characters or less",
        });
        return;
      }

      // Generate new bundle ID
      const outputDir = getSudocodeDir();
      const { id, uuid } = generateBundleId(db, outputDir);

      // Create bundle using CLI operation
      const bundle = createNewBundle(db, {
        id,
        uuid,
        name,
        description: description || undefined,
      });

      res.status(201).json({
        success: true,
        data: bundle,
      });
    } catch (error) {
      console.error("Error creating bundle:", error);
      res.status(500).json({
        success: false,
        data: null,
        error_data: error instanceof Error ? error.message : String(error),
        message: "Failed to create bundle",
      });
    }
  });

  /**
   * PUT /api/bundles/:id - Update an existing bundle
   */
  router.put("/:id", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name, description, archived } = req.body;

      // Validate name if provided
      if (name !== undefined && typeof name !== "string") {
        res.status(400).json({
          success: false,
          data: null,
          message: "name must be a string",
        });
        return;
      }

      if (name && name.length > 500) {
        res.status(400).json({
          success: false,
          data: null,
          message: "Name must be 500 characters or less",
        });
        return;
      }

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (archived !== undefined) updateData.archived = archived;

      const bundle = updateExistingBundle(db, id, updateData);

      res.json({
        success: true,
        data: bundle,
      });
    } catch (error) {
      console.error("Error updating bundle:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Check if bundle not found
      if (errorMessage.includes("not found")) {
        res.status(404).json({
          success: false,
          data: null,
          error_data: errorMessage,
          message: "Bundle not found",
        });
        return;
      }

      res.status(500).json({
        success: false,
        data: null,
        error_data: errorMessage,
        message: "Failed to update bundle",
      });
    }
  });

  /**
   * DELETE /api/bundles/:id - Delete a bundle
   */
  router.delete("/:id", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const deleted = deleteExistingBundle(db, id);

      if (!deleted) {
        res.status(404).json({
          success: false,
          data: null,
          message: `Bundle not found: ${id}`,
        });
        return;
      }

      res.json({
        success: true,
        data: { id },
        message: "Bundle deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting bundle:", error);
      res.status(500).json({
        success: false,
        data: null,
        error_data: error instanceof Error ? error.message : String(error),
        message: "Failed to delete bundle",
      });
    }
  });

  /**
   * POST /api/bundles/:id/items - Add item to bundle
   */
  router.post("/:id/items", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { entity_type, entity_id, order_index } = req.body;

      if (!entity_type || !entity_id) {
        res.status(400).json({
          success: false,
          data: null,
          message: "entity_type and entity_id are required",
        });
        return;
      }

      const validTypes = ["session", "spec", "issue", "execution"];
      if (!validTypes.includes(entity_type)) {
        res.status(400).json({
          success: false,
          data: null,
          message: `entity_type must be one of: ${validTypes.join(", ")}`,
        });
        return;
      }

      const item = addItemToBundle(db, {
        bundle_id: id,
        entity_type,
        entity_id,
        order_index,
      });

      res.status(201).json({
        success: true,
        data: item,
      });
    } catch (error) {
      console.error("Error adding item to bundle:", error);
      res.status(500).json({
        success: false,
        data: null,
        error_data: error instanceof Error ? error.message : String(error),
        message: "Failed to add item to bundle",
      });
    }
  });

  /**
   * DELETE /api/bundles/:id/items/:entityType/:entityId - Remove item from bundle
   */
  router.delete("/:id/items/:entityType/:entityId", (req: Request, res: Response) => {
    try {
      const { id, entityType, entityId } = req.params;

      const removed = removeItemFromBundle(db, id, entityType, entityId);

      if (!removed) {
        res.status(404).json({
          success: false,
          data: null,
          message: "Item not found in bundle",
        });
        return;
      }

      res.json({
        success: true,
        data: { bundle_id: id, entity_type: entityType, entity_id: entityId },
        message: "Item removed from bundle",
      });
    } catch (error) {
      console.error("Error removing item from bundle:", error);
      res.status(500).json({
        success: false,
        data: null,
        error_data: error instanceof Error ? error.message : String(error),
        message: "Failed to remove item from bundle",
      });
    }
  });

  return router;
}
