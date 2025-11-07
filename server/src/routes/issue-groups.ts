/**
 * Issue Groups API routes (mapped to /api/issue-groups)
 */

import { Router, Request, Response } from "express";
import type Database from "better-sqlite3";
import {
  createIssueGroup,
  getIssueGroup,
  updateIssueGroup,
  deleteIssueGroup,
  listIssueGroups,
  addIssueToGroup,
  removeIssueFromGroup,
  getIssuesInGroup,
  getGroupForIssue,
} from "../services/issue-groups.js";
import { generateIssueId } from "@sudocode-ai/cli/dist/id-generator.js";
import { broadcastIssueUpdate } from "../services/websocket.js";

export function createIssueGroupsRouter(db: Database.Database): Router {
  const router = Router();

  /**
   * GET /api/issue-groups - List all issue groups
   */
  router.get("/", (req: Request, res: Response) => {
    try {
      const options: any = {};

      // Filter by status if provided
      if (req.query.status) {
        options.status = req.query.status as string;
      }

      const groups = listIssueGroups(db, options);

      res.json({
        success: true,
        data: groups,
      });
    } catch (error) {
      console.error("Error listing issue groups:", error);
      res.status(500).json({
        success: false,
        data: null,
        error_data: error instanceof Error ? error.message : String(error),
        message: "Failed to list issue groups",
      });
    }
  });

  /**
   * GET /api/issue-groups/:id - Get a specific issue group
   */
  router.get("/:id", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const group = getIssueGroup(db, id);

      if (!group) {
        res.status(404).json({
          success: false,
          data: null,
          message: `Issue group not found: ${id}`,
        });
        return;
      }

      // Also get member issues and stats
      const issues = getIssuesInGroup(db, id);
      const stats = {
        totalIssues: issues.length,
        openIssues: issues.filter((i) => i.status === "open").length,
        inProgressIssues: issues.filter((i) => i.status === "in_progress")
          .length,
        completedIssues: issues.filter((i) => i.status === "closed").length,
        blockedIssues: issues.filter((i) => i.status === "blocked").length,
        needsReviewIssues: issues.filter((i) => i.status === "needs_review")
          .length,
      };

      res.json({
        success: true,
        data: {
          group,
          issues,
          stats,
        },
      });
    } catch (error) {
      console.error("Error getting issue group:", error);
      res.status(500).json({
        success: false,
        data: null,
        error_data: error instanceof Error ? error.message : String(error),
        message: "Failed to get issue group",
      });
    }
  });

  /**
   * POST /api/issue-groups - Create a new issue group
   */
  router.post("/", (req: Request, res: Response) => {
    try {
      const { name, description, baseBranch, workingBranch, color } = req.body;

      if (!name || !workingBranch) {
        res.status(400).json({
          success: false,
          data: null,
          message: "Missing required fields: name, workingBranch",
        });
        return;
      }

      // Generate ID
      const id = generateIssueId("group");

      const group = createIssueGroup(db, {
        id,
        name,
        description,
        baseBranch,
        workingBranch,
        color,
      });

      res.status(201).json({
        success: true,
        data: group,
      });
    } catch (error) {
      console.error("Error creating issue group:", error);
      res.status(400).json({
        success: false,
        data: null,
        error_data: error instanceof Error ? error.message : String(error),
        message: "Failed to create issue group",
      });
    }
  });

  /**
   * PUT /api/issue-groups/:id - Update an issue group
   */
  router.put("/:id", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const {
        name,
        description,
        status,
        pauseReason,
        color,
        lastExecutionId,
        lastCommitSha,
      } = req.body;

      const group = updateIssueGroup(db, id, {
        name,
        description,
        status,
        pauseReason,
        color,
        lastExecutionId,
        lastCommitSha,
      });

      res.json({
        success: true,
        data: group,
      });
    } catch (error) {
      console.error("Error updating issue group:", error);
      const status = error instanceof Error && error.message.includes("not found")
        ? 404
        : 400;

      res.status(status).json({
        success: false,
        data: null,
        error_data: error instanceof Error ? error.message : String(error),
        message: "Failed to update issue group",
      });
    }
  });

  /**
   * DELETE /api/issue-groups/:id - Delete an issue group
   */
  router.delete("/:id", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const result = deleteIssueGroup(db, id);

      if (!result) {
        res.status(404).json({
          success: false,
          data: null,
          message: `Issue group not found: ${id}`,
        });
        return;
      }

      res.json({
        success: true,
        data: { deleted: true },
      });
    } catch (error) {
      console.error("Error deleting issue group:", error);
      res.status(500).json({
        success: false,
        data: null,
        error_data: error instanceof Error ? error.message : String(error),
        message: "Failed to delete issue group",
      });
    }
  });

  /**
   * POST /api/issue-groups/:id/pause - Pause a group
   */
  router.post("/:id/pause", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const group = updateIssueGroup(db, id, {
        status: "paused",
        pauseReason: reason,
      });

      res.json({
        success: true,
        data: group,
      });
    } catch (error) {
      console.error("Error pausing issue group:", error);
      res.status(400).json({
        success: false,
        data: null,
        error_data: error instanceof Error ? error.message : String(error),
        message: "Failed to pause issue group",
      });
    }
  });

  /**
   * POST /api/issue-groups/:id/resume - Resume a paused group
   */
  router.post("/:id/resume", (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const group = updateIssueGroup(db, id, {
        status: "active",
        pauseReason: null,
      });

      res.json({
        success: true,
        data: group,
      });
    } catch (error) {
      console.error("Error resuming issue group:", error);
      res.status(400).json({
        success: false,
        data: null,
        error_data: error instanceof Error ? error.message : String(error),
        message: "Failed to resume issue group",
      });
    }
  });

  /**
   * POST /api/issue-groups/:id/complete - Mark group as completed
   */
  router.post("/:id/complete", (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const group = updateIssueGroup(db, id, {
        status: "completed",
      });

      res.json({
        success: true,
        data: group,
      });
    } catch (error) {
      console.error("Error completing issue group:", error);
      res.status(400).json({
        success: false,
        data: null,
        error_data: error instanceof Error ? error.message : String(error),
        message: "Failed to complete issue group",
      });
    }
  });

  /**
   * POST /api/issue-groups/:id/members - Add an issue to a group
   */
  router.post("/:id/members", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { issueId, position } = req.body;

      if (!issueId) {
        res.status(400).json({
          success: false,
          data: null,
          message: "Missing required field: issueId",
        });
        return;
      }

      const member = addIssueToGroup(db, id, issueId, position);

      // Broadcast update for the issue
      broadcastIssueUpdate(issueId, "updated", null);

      res.status(201).json({
        success: true,
        data: member,
      });
    } catch (error) {
      console.error("Error adding issue to group:", error);
      res.status(400).json({
        success: false,
        data: null,
        error_data: error instanceof Error ? error.message : String(error),
        message: "Failed to add issue to group",
      });
    }
  });

  /**
   * DELETE /api/issue-groups/:id/members/:issueId - Remove an issue from a group
   */
  router.delete("/:id/members/:issueId", (req: Request, res: Response) => {
    try {
      const { id, issueId } = req.params;
      const result = removeIssueFromGroup(db, id, issueId);

      if (!result) {
        res.status(404).json({
          success: false,
          data: null,
          message: `Issue ${issueId} is not in group ${id}`,
        });
        return;
      }

      // Broadcast update for the issue
      broadcastIssueUpdate(issueId, "updated", null);

      res.json({
        success: true,
        data: { removed: true },
      });
    } catch (error) {
      console.error("Error removing issue from group:", error);
      res.status(500).json({
        success: false,
        data: null,
        error_data: error instanceof Error ? error.message : String(error),
        message: "Failed to remove issue from group",
      });
    }
  });

  /**
   * GET /api/issue-groups/:id/members - Get all issues in a group
   */
  router.get("/:id/members", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const issues = getIssuesInGroup(db, id);

      res.json({
        success: true,
        data: issues,
      });
    } catch (error) {
      console.error("Error getting group members:", error);
      res.status(500).json({
        success: false,
        data: null,
        error_data: error instanceof Error ? error.message : String(error),
        message: "Failed to get group members",
      });
    }
  });

  return router;
}
