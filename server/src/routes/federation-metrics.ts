/**
 * Federation metrics and dashboard API routes
 */

import { Router, Request, Response } from "express";
import type Database from "better-sqlite3";
import {
  getMetrics,
  getTopRemoteRepos,
  getRecentActivity,
  getHealthStatus,
} from "../services/metrics.js";

export function createFederationMetricsRouter(db: Database.Database): Router {
  const router = Router();

  /**
   * GET /api/v1/federation/metrics - Get federation metrics
   */
  router.get("/metrics", (req: Request, res: Response) => {
    try {
      const startTime = req.query.start as string | undefined;
      const endTime = req.query.end as string | undefined;

      const metrics = getMetrics(db, startTime, endTime);

      res.json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      console.error("Error getting federation metrics:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/v1/federation/metrics/top-repos - Get top remote repositories by activity
   */
  router.get("/metrics/top-repos", (req: Request, res: Response) => {
    try {
      const limit = req.query.limit
        ? parseInt(req.query.limit as string, 10)
        : 10;

      const topRepos = getTopRemoteRepos(db, limit);

      res.json({
        success: true,
        data: topRepos,
      });
    } catch (error) {
      console.error("Error getting top remote repos:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/v1/federation/metrics/activity - Get recent federation activity
   */
  router.get("/metrics/activity", (req: Request, res: Response) => {
    try {
      const limit = req.query.limit
        ? parseInt(req.query.limit as string, 10)
        : 50;

      const activity = getRecentActivity(db, limit);

      res.json({
        success: true,
        data: activity,
      });
    } catch (error) {
      console.error("Error getting recent activity:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/v1/federation/metrics/health - Get federation health status
   */
  router.get("/metrics/health", (_req: Request, res: Response) => {
    try {
      const health = getHealthStatus(db);

      res.json({
        success: true,
        data: health,
      });
    } catch (error) {
      console.error("Error getting health status:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/v1/federation/dashboard - Get comprehensive dashboard data
   */
  router.get("/dashboard", (_req: Request, res: Response) => {
    try {
      const startTime = _req.query.start as string | undefined;
      const endTime = _req.query.end as string | undefined;

      // Get all dashboard data in one call
      const metrics = getMetrics(db, startTime, endTime);
      const topRepos = getTopRemoteRepos(db, 5);
      const recentActivity = getRecentActivity(db, 20);
      const health = getHealthStatus(db);

      res.json({
        success: true,
        data: {
          metrics,
          topRepos,
          recentActivity,
          health,
        },
      });
    } catch (error) {
      console.error("Error getting dashboard data:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
