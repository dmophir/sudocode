/**
 * Issues API routes (mapped to /api/issues)
 */

import { Router, Request, Response } from "express";
import type Database from "better-sqlite3";
import { getAllIssues, getIssueById } from "../services/issues.js";

export function createIssuesRouter(db: Database.Database): Router {
  const router = Router();

  /**
   * GET /api/issues - List all issues
   */
  router.get("/", (req: Request, res: Response) => {
    try {
      // Parse query parameters for filtering
      const options: any = {};

      if (req.query.status) {
        options.status = req.query.status as string;
      }
      if (req.query.priority) {
        options.priority = parseInt(req.query.priority as string, 10);
      }
      if (req.query.assignee) {
        options.assignee = req.query.assignee as string;
      }
      if (req.query.limit) {
        options.limit = parseInt(req.query.limit as string, 10);
      }
      if (req.query.offset) {
        options.offset = parseInt(req.query.offset as string, 10);
      }

      const issues = getAllIssues(db, options);

      res.json({
        success: true,
        data: issues,
      });
    } catch (error) {
      console.error("Error listing issues:", error);
      res.status(500).json({
        success: false,
        data: null,
        error_data: error instanceof Error ? error.message : String(error),
        message: "Failed to list issues",
      });
    }
  });

  /**
   * GET /api/issues/:id - Get a specific issue
   */
  router.get("/:id", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const issue = getIssueById(db, id);

      if (!issue) {
        res.status(404).json({
          success: false,
          data: null,
          message: `Issue not found: ${id}`,
        });
        return;
      }

      res.json({
        success: true,
        data: issue,
      });
    } catch (error) {
      console.error("Error getting issue:", error);
      res.status(500).json({
        success: false,
        data: null,
        error_data: error instanceof Error ? error.message : String(error),
        message: "Failed to get issue",
      });
    }
  });

  return router;
}
