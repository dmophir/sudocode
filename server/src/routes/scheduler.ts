/**
 * Scheduler API routes (mapped to /api/scheduler)
 */

import { Router, Request, Response } from "express";
import type Database from "better-sqlite3";
import {
  getSchedulerConfig,
  updateSchedulerConfig,
} from "../services/scheduler-config.js";
import type { ExecutionScheduler } from "../services/execution-scheduler.js";

export function createSchedulerRouter(
  db: Database.Database,
  scheduler: ExecutionScheduler
): Router {
  const router = Router();

  /**
   * GET /api/scheduler/config - Get scheduler configuration
   */
  router.get("/config", (req: Request, res: Response) => {
    try {
      const config = getSchedulerConfig(db);

      res.json({
        success: true,
        data: config,
      });
    } catch (error) {
      console.error("Error getting scheduler config:", error);
      res.status(500).json({
        success: false,
        data: null,
        error_data: error instanceof Error ? error.message : String(error),
        message: "Failed to get scheduler config",
      });
    }
  });

  /**
   * PUT /api/scheduler/config - Update scheduler configuration
   */
  router.put("/config", (req: Request, res: Response) => {
    try {
      const { enabled, maxConcurrency, pollInterval } = req.body;

      const config = updateSchedulerConfig(db, {
        enabled,
        maxConcurrency,
        pollInterval,
      });

      res.json({
        success: true,
        data: config,
      });
    } catch (error) {
      console.error("Error updating scheduler config:", error);
      res.status(400).json({
        success: false,
        data: null,
        error_data: error instanceof Error ? error.message : String(error),
        message: "Failed to update scheduler config",
      });
    }
  });

  /**
   * POST /api/scheduler/start - Start the scheduler
   */
  router.post("/start", async (req: Request, res: Response) => {
    try {
      await scheduler.start();

      // Update config to mark as enabled
      const config = updateSchedulerConfig(db, { enabled: true });

      res.json({
        success: true,
        data: {
          status: "started",
          config,
        },
      });
    } catch (error) {
      console.error("Error starting scheduler:", error);
      res.status(500).json({
        success: false,
        data: null,
        error_data: error instanceof Error ? error.message : String(error),
        message: "Failed to start scheduler",
      });
    }
  });

  /**
   * POST /api/scheduler/stop - Stop the scheduler
   */
  router.post("/stop", async (req: Request, res: Response) => {
    try {
      await scheduler.stop();

      // Update config to mark as disabled
      const config = updateSchedulerConfig(db, { enabled: false });

      res.json({
        success: true,
        data: {
          status: "stopped",
          config,
        },
      });
    } catch (error) {
      console.error("Error stopping scheduler:", error);
      res.status(500).json({
        success: false,
        data: null,
        error_data: error instanceof Error ? error.message : String(error),
        message: "Failed to stop scheduler",
      });
    }
  });

  /**
   * GET /api/scheduler/status - Get scheduler status
   */
  router.get("/status", (req: Request, res: Response) => {
    try {
      const status = scheduler.getStatus();
      const config = getSchedulerConfig(db);

      res.json({
        success: true,
        data: {
          ...status,
          maxConcurrency: config.maxConcurrency,
        },
      });
    } catch (error) {
      console.error("Error getting scheduler status:", error);
      res.status(500).json({
        success: false,
        data: null,
        error_data: error instanceof Error ? error.message : String(error),
        message: "Failed to get scheduler status",
      });
    }
  });

  return router;
}
