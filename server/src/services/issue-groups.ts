/**
 * Issue Groups Service
 *
 * Manages issue groups for coordinating related issues with shared branches
 */

import type Database from "better-sqlite3";
import type { IssueGroup, IssueGroupMember, Issue } from "@sudocode-ai/types";
import { generateUUID } from "@sudocode-ai/cli/dist/id-generator.js";

export interface CreateIssueGroupInput {
  id: string;
  uuid?: string;
  name: string;
  description?: string;
  baseBranch?: string;
  workingBranch: string;
  status?: "active" | "paused" | "completed";
  color?: string;
}

export interface UpdateIssueGroupInput {
  name?: string;
  description?: string;
  status?: "active" | "paused" | "completed";
  pauseReason?: string;
  color?: string;
  lastExecutionId?: string;
  lastCommitSha?: string;
  closed_at?: string;
}

export interface ListIssueGroupsOptions {
  status?: "active" | "paused" | "completed";
}

/**
 * Create a new issue group
 */
export function createIssueGroup(
  db: Database.Database,
  input: CreateIssueGroupInput
): IssueGroup {
  const uuid = input.uuid || generateUUID();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO issue_groups (
      id,
      uuid,
      name,
      description,
      base_branch,
      working_branch,
      status,
      color,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    stmt.run(
      input.id,
      uuid,
      input.name,
      input.description || null,
      input.baseBranch || "main",
      input.workingBranch,
      input.status || "active",
      input.color || null,
      now,
      now
    );

    const group = getIssueGroup(db, input.id);
    if (!group) {
      throw new Error(`Failed to create issue group ${input.id}`);
    }

    return group;
  } catch (error: any) {
    if (error.code && error.code.startsWith("SQLITE_CONSTRAINT")) {
      if (error.message.includes("working_branch")) {
        throw new Error(
          `Working branch "${input.workingBranch}" is already in use by another group`
        );
      }
      throw new Error(`Constraint violation: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get an issue group by ID
 */
export function getIssueGroup(
  db: Database.Database,
  id: string
): IssueGroup | null {
  const stmt = db.prepare(`
    SELECT
      id,
      uuid,
      name,
      description,
      base_branch as baseBranch,
      working_branch as workingBranch,
      status,
      pause_reason as pauseReason,
      color,
      last_execution_id as lastExecutionId,
      last_commit_sha as lastCommitSha,
      created_at,
      updated_at,
      closed_at
    FROM issue_groups
    WHERE id = ?
  `);

  const row = stmt.get(id) as IssueGroup | undefined;
  return row || null;
}

/**
 * Update an issue group
 */
export function updateIssueGroup(
  db: Database.Database,
  id: string,
  input: UpdateIssueGroupInput
): IssueGroup {
  const existing = getIssueGroup(db, id);
  if (!existing) {
    throw new Error(`Issue group not found: ${id}`);
  }

  const updates: string[] = [];
  const params: Record<string, any> = { id };

  if (input.name !== undefined) {
    updates.push("name = @name");
    params.name = input.name;
  }

  if (input.description !== undefined) {
    updates.push("description = @description");
    params.description = input.description;
  }

  if (input.status !== undefined) {
    updates.push("status = @status");
    params.status = input.status;

    // Handle closed_at based on status
    if (input.status === "completed" && existing.status !== "completed") {
      updates.push("closed_at = CURRENT_TIMESTAMP");
    } else if (input.status !== "completed" && existing.status === "completed") {
      updates.push("closed_at = NULL");
    }
  }

  if (input.pauseReason !== undefined) {
    updates.push("pause_reason = @pause_reason");
    params.pause_reason = input.pauseReason;
  }

  if (input.color !== undefined) {
    updates.push("color = @color");
    params.color = input.color;
  }

  if (input.lastExecutionId !== undefined) {
    updates.push("last_execution_id = @last_execution_id");
    params.last_execution_id = input.lastExecutionId;
  }

  if (input.lastCommitSha !== undefined) {
    updates.push("last_commit_sha = @last_commit_sha");
    params.last_commit_sha = input.lastCommitSha;
  }

  if (input.closed_at !== undefined) {
    updates.push("closed_at = @closed_at");
    params.closed_at = input.closed_at;
  }

  // Always update updated_at
  updates.push("updated_at = CURRENT_TIMESTAMP");

  if (updates.length === 1) {
    // Only updated_at, no actual changes
    return existing;
  }

  const stmt = db.prepare(`
    UPDATE issue_groups
    SET ${updates.join(", ")}
    WHERE id = @id
  `);

  stmt.run(params);

  const updated = getIssueGroup(db, id);
  if (!updated) {
    throw new Error(`Failed to update issue group ${id}`);
  }

  return updated;
}

/**
 * Delete an issue group
 */
export function deleteIssueGroup(db: Database.Database, id: string): boolean {
  const stmt = db.prepare(`
    DELETE FROM issue_groups WHERE id = ?
  `);

  const result = stmt.run(id);
  return result.changes > 0;
}

/**
 * List issue groups with optional filters
 */
export function listIssueGroups(
  db: Database.Database,
  options: ListIssueGroupsOptions = {}
): IssueGroup[] {
  const conditions: string[] = [];
  const params: Record<string, any> = {};

  if (options.status !== undefined) {
    conditions.push("status = @status");
    params.status = options.status;
  }

  let query = `
    SELECT
      id,
      uuid,
      name,
      description,
      base_branch as baseBranch,
      working_branch as workingBranch,
      status,
      pause_reason as pauseReason,
      color,
      last_execution_id as lastExecutionId,
      last_commit_sha as lastCommitSha,
      created_at,
      updated_at,
      closed_at
    FROM issue_groups
  `;

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(" AND ")}`;
  }

  query += " ORDER BY created_at DESC";

  const stmt = db.prepare(query);
  return stmt.all(params) as IssueGroup[];
}

/**
 * Add an issue to a group
 */
export function addIssueToGroup(
  db: Database.Database,
  groupId: string,
  issueId: string,
  position?: number
): IssueGroupMember {
  // Verify group exists
  const group = getIssueGroup(db, groupId);
  if (!group) {
    throw new Error(`Issue group not found: ${groupId}`);
  }

  // Verify issue exists and get uuid
  const issue = db
    .prepare(`SELECT id, uuid FROM issues WHERE id = ?`)
    .get(issueId) as { id: string; uuid: string } | undefined;

  if (!issue) {
    throw new Error(`Issue not found: ${issueId}`);
  }

  const stmt = db.prepare(`
    INSERT INTO issue_group_members (
      group_id,
      group_uuid,
      issue_id,
      issue_uuid,
      position,
      added_at
    ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  try {
    stmt.run(groupId, group.uuid, issueId, issue.uuid, position || null);

    // Return the created member
    const member = db
      .prepare(
        `
      SELECT * FROM issue_group_members
      WHERE group_id = ? AND issue_id = ?
    `
      )
      .get(groupId, issueId) as IssueGroupMember;

    return member;
  } catch (error: any) {
    if (error.code && error.code.startsWith("SQLITE_CONSTRAINT")) {
      throw new Error(`Issue ${issueId} is already in group ${groupId}`);
    }
    throw error;
  }
}

/**
 * Remove an issue from a group
 */
export function removeIssueFromGroup(
  db: Database.Database,
  groupId: string,
  issueId: string
): boolean {
  const stmt = db.prepare(`
    DELETE FROM issue_group_members
    WHERE group_id = ? AND issue_id = ?
  `);

  const result = stmt.run(groupId, issueId);
  return result.changes > 0;
}

/**
 * Get all issues in a group
 */
export function getIssuesInGroup(db: Database.Database, groupId: string): Issue[] {
  const stmt = db.prepare(`
    SELECT i.*
    FROM issues i
    JOIN issue_group_members m ON m.issue_id = i.id
    WHERE m.group_id = ?
    ORDER BY m.position ASC NULLS LAST, m.added_at ASC
  `);

  return stmt.all(groupId) as Issue[];
}

/**
 * Get the group that an issue belongs to (if any)
 */
export function getGroupForIssue(
  db: Database.Database,
  issueId: string
): IssueGroup | null {
  const stmt = db.prepare(`
    SELECT
      g.id,
      g.uuid,
      g.name,
      g.description,
      g.base_branch as baseBranch,
      g.working_branch as workingBranch,
      g.status,
      g.pause_reason as pauseReason,
      g.color,
      g.last_execution_id as lastExecutionId,
      g.last_commit_sha as lastCommitSha,
      g.created_at,
      g.updated_at,
      g.closed_at
    FROM issue_groups g
    JOIN issue_group_members m ON m.group_id = g.id
    WHERE m.issue_id = ?
    LIMIT 1
  `);

  const row = stmt.get(issueId) as IssueGroup | undefined;
  return row || null;
}
