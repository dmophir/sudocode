/**
 * Provisional State API routes (mapped to /api)
 *
 * Provides REST API for accessing worktree provisional state and mutation events.
 */

import { Router, Request, Response } from "express";
import {
  getProvisionalStateManager,
  getEventBuffer,
  isWorktreeMutationSystemInitialized,
} from "../execution/worktree/singleton.js";

/**
 * Create provisional state router
 *
 * @returns Express router with provisional state endpoints
 */
export function createProvisionalStateRouter(): Router {
  const router = Router();

  /**
   * Middleware to check if mutation system is initialized
   */
  const checkInitialized = (req: Request, res: Response, next: Function) => {
    if (!isWorktreeMutationSystemInitialized()) {
      res.status(503).json({
        success: false,
        data: null,
        message: "Worktree mutation system not initialized",
      });
      return;
    }
    next();
  };

  /**
   * GET /api/executions/:executionId/provisional-state
   *
   * Get the provisional state for an execution (base + worktree mutations)
   *
   * Returns:
   * - base: Base state from main repository (issues, specs)
   * - provisional: Overlay of worktree mutations (creates, updates, deletes)
   * - execution: Execution metadata
   * - computedAt: Timestamp when state was computed
   */
  router.get(
    "/executions/:executionId/provisional-state",
    checkInitialized,
    async (req: Request, res: Response) => {
      try {
        const { executionId } = req.params;

        const provisionalStateManager = getProvisionalStateManager();
        const state = provisionalStateManager.computeProvisionalState(executionId);

        res.json({
          success: true,
          data: state,
        });
      } catch (error) {
        console.error(
          "[API Route] ERROR: Failed to get provisional state:",
          error
        );
        res.status(500).json({
          success: false,
          data: null,
          error_data: error instanceof Error ? error.message : String(error),
          message: "Failed to get provisional state",
        });
      }
    }
  );

  /**
   * GET /api/executions/:executionId/mutations
   *
   * Get raw mutation events for an execution
   *
   * Query parameters:
   * - fromSequence: Optional sequence number to start from (for polling)
   *
   * Returns:
   * - executionId: The execution ID
   * - events: Array of mutation events
   * - totalEvents: Total number of events returned
   * - nextSequence: Next sequence number for polling
   */
  router.get(
    "/executions/:executionId/mutations",
    checkInitialized,
    async (req: Request, res: Response) => {
      try {
        const { executionId } = req.params;
        const { fromSequence } = req.query;

        const eventBuffer = getEventBuffer();
        const events = eventBuffer.getEvents(
          executionId,
          fromSequence ? parseInt(fromSequence as string) : undefined
        );

        // Calculate next sequence number for polling
        const nextSequence =
          events.length > 0
            ? events[events.length - 1].sequenceNumber + 1
            : fromSequence
              ? parseInt(fromSequence as string)
              : 0;

        res.json({
          success: true,
          data: {
            executionId,
            events,
            totalEvents: events.length,
            nextSequence,
          },
        });
      } catch (error) {
        console.error("[API Route] ERROR: Failed to get mutations:", error);
        res.status(500).json({
          success: false,
          data: null,
          error_data: error instanceof Error ? error.message : String(error),
          message: "Failed to get mutations",
        });
      }
    }
  );

  /**
   * GET /api/executions/:executionId/merged-issues
   *
   * Get merged view of issues (base + provisional)
   *
   * Returns a single merged array of issues by:
   * 1. Starting with base issues from main repository
   * 2. Applying updates from worktree
   * 3. Adding created issues from worktree
   * 4. Removing deleted issues from worktree
   */
  router.get(
    "/executions/:executionId/merged-issues",
    checkInitialized,
    async (req: Request, res: Response) => {
      try {
        const { executionId } = req.params;

        const provisionalStateManager = getProvisionalStateManager();
        const issues = provisionalStateManager.getMergedIssues(executionId);

        res.json({
          success: true,
          data: issues,
        });
      } catch (error) {
        console.error("[API Route] ERROR: Failed to get merged issues:", error);
        res.status(500).json({
          success: false,
          data: null,
          error_data: error instanceof Error ? error.message : String(error),
          message: "Failed to get merged issues",
        });
      }
    }
  );

  /**
   * GET /api/executions/:executionId/merged-specs
   *
   * Get merged view of specs (base + provisional)
   *
   * Returns a single merged array of specs by:
   * 1. Starting with base specs from main repository
   * 2. Applying updates from worktree
   * 3. Adding created specs from worktree
   * 4. Removing deleted specs from worktree
   */
  router.get(
    "/executions/:executionId/merged-specs",
    checkInitialized,
    async (req: Request, res: Response) => {
      try {
        const { executionId } = req.params;

        const provisionalStateManager = getProvisionalStateManager();
        const specs = provisionalStateManager.getMergedSpecs(executionId);

        res.json({
          success: true,
          data: specs,
        });
      } catch (error) {
        console.error("[API Route] ERROR: Failed to get merged specs:", error);
        res.status(500).json({
          success: false,
          data: null,
          error_data: error instanceof Error ? error.message : String(error),
          message: "Failed to get merged specs",
        });
      }
    }
  );

  /**
   * GET /api/executions/:executionId/provisional-stats
   *
   * Get statistics about provisional state for an execution
   *
   * Returns counts of creates, updates, and deletes for issues and specs.
   */
  router.get(
    "/executions/:executionId/provisional-stats",
    checkInitialized,
    async (req: Request, res: Response) => {
      try {
        const { executionId } = req.params;

        const provisionalStateManager = getProvisionalStateManager();
        const stats = provisionalStateManager.getProvisionalStateStats(executionId);

        res.json({
          success: true,
          data: stats,
        });
      } catch (error) {
        console.error(
          "[API Route] ERROR: Failed to get provisional stats:",
          error
        );
        res.status(500).json({
          success: false,
          data: null,
          error_data: error instanceof Error ? error.message : String(error),
          message: "Failed to get provisional stats",
        });
      }
    }
  );

  return router;
}
