/**
 * CLI handlers for cross-repo request commands
 */

import chalk from "chalk";
import type Database from "better-sqlite3";
import Table from "cli-table3";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import * as path from "path";
import * as fs from "fs";
import {
  getRequest,
  listRequests,
  listPendingRequests,
  approveRequest,
  rejectRequest,
  completeRequest,
  type RequestStatus,
  type RequestDirection,
} from "../operations/federation.js";
import { getRemoteRepo } from "../operations/federation.js";
import { createIssue, getIssue } from "../operations/issues.js";
import { createSpec, getSpec } from "../operations/specs.js";
import { generateIssueId, generateSpecId } from "../id-generator.js";
import { exportToJSONL } from "../export.js";
import { generateUniqueFilename } from "../filename-generator.js";

export interface CommandContext {
  db: Database.Database;
  outputDir: string;
  jsonOutput: boolean;
}

// ============================================================================
// Request Pending
// ============================================================================

export interface RequestPendingOptions {
  direction?: string;
}

export async function handleRequestPending(
  ctx: CommandContext,
  options: RequestPendingOptions
): Promise<void> {
  try {
    const requests = listPendingRequests(
      ctx.db,
      options.direction as RequestDirection
    );

    if (ctx.jsonOutput) {
      console.log(JSON.stringify(requests, null, 2));
      return;
    }

    if (requests.length === 0) {
      console.log(chalk.yellow("No pending requests"));
      return;
    }

    const table = new Table({
      head: [
        chalk.cyan("Request ID"),
        chalk.cyan("Direction"),
        chalk.cyan("From/To"),
        chalk.cyan("Type"),
        chalk.cyan("Created"),
      ],
      colWidths: [30, 12, 30, 20, 20],
      wordWrap: true,
    });

    for (const req of requests) {
      const fromTo =
        req.direction === "incoming" ? `From: ${req.from_repo}` : `To: ${req.to_repo}`;

      table.push([
        req.request_id,
        req.direction === "incoming" ? chalk.yellow("⬇ incoming") : chalk.blue("⬆ outgoing"),
        fromTo,
        req.request_type,
        new Date(req.created_at).toLocaleString(),
      ]);
    }

    console.log(table.toString());
    console.log(chalk.gray(`\nTotal: ${requests.length} pending request(s)`));
  } catch (error) {
    console.error(chalk.red("✗ Failed to list pending requests"));
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// ============================================================================
// Request List
// ============================================================================

export interface RequestListOptions {
  status?: string;
  direction?: string;
  fromRepo?: string;
  toRepo?: string;
  limit?: string;
}

export async function handleRequestList(
  ctx: CommandContext,
  options: RequestListOptions
): Promise<void> {
  try {
    const requests = listRequests(ctx.db, {
      status: options.status as RequestStatus,
      direction: options.direction as RequestDirection,
      from_repo: options.fromRepo,
      to_repo: options.toRepo,
      limit: options.limit ? parseInt(options.limit) : 50,
    });

    if (ctx.jsonOutput) {
      console.log(JSON.stringify(requests, null, 2));
      return;
    }

    if (requests.length === 0) {
      console.log(chalk.yellow("No requests found"));
      return;
    }

    const table = new Table({
      head: [
        chalk.cyan("Request ID"),
        chalk.cyan("Direction"),
        chalk.cyan("Status"),
        chalk.cyan("Type"),
        chalk.cyan("Created"),
      ],
      colWidths: [30, 12, 12, 20, 20],
      wordWrap: true,
    });

    for (const req of requests) {
      const statusColor =
        req.status === "approved"
          ? chalk.green
          : req.status === "rejected"
          ? chalk.red
          : req.status === "completed"
          ? chalk.blue
          : req.status === "failed"
          ? chalk.red
          : chalk.yellow;

      table.push([
        req.request_id,
        req.direction === "incoming" ? chalk.yellow("⬇ incoming") : chalk.blue("⬆ outgoing"),
        statusColor(req.status),
        req.request_type,
        new Date(req.created_at).toLocaleString(),
      ]);
    }

    console.log(table.toString());
    console.log(chalk.gray(`\nTotal: ${requests.length} request(s)`));
  } catch (error) {
    console.error(chalk.red("✗ Failed to list requests"));
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// ============================================================================
// Request Show
// ============================================================================

export async function handleRequestShow(
  ctx: CommandContext,
  requestId: string
): Promise<void> {
  try {
    const request = getRequest(ctx.db, requestId);

    if (!request) {
      console.error(chalk.red(`✗ Request not found: ${requestId}`));
      process.exit(1);
    }

    if (ctx.jsonOutput) {
      console.log(JSON.stringify(request, null, 2));
      return;
    }

    console.log(chalk.bold("\nCross-Repo Request Details"));
    console.log(chalk.gray("─".repeat(50)));
    console.log(chalk.cyan("Request ID:"), request.request_id);
    console.log(
      chalk.cyan("Direction:"),
      request.direction === "incoming" ? chalk.yellow("⬇ incoming") : chalk.blue("⬆ outgoing")
    );

    const statusColor =
      request.status === "approved"
        ? chalk.green
        : request.status === "rejected"
        ? chalk.red
        : request.status === "completed"
        ? chalk.blue
        : request.status === "failed"
        ? chalk.red
        : chalk.yellow;
    console.log(chalk.cyan("Status:"), statusColor(request.status));

    console.log(chalk.cyan("Type:"), request.request_type);
    console.log(chalk.cyan("From Repo:"), request.from_repo);
    console.log(chalk.cyan("To Repo:"), request.to_repo);

    console.log(chalk.cyan("\nPayload:"));
    try {
      const payload = JSON.parse(request.payload);
      console.log(chalk.gray(JSON.stringify(payload, null, 2)));
    } catch (e) {
      console.log(chalk.gray(request.payload));
    }

    if (request.approved_by) {
      console.log(chalk.cyan("\nApproved By:"), request.approved_by);
      console.log(
        chalk.cyan("Approved At:"),
        new Date(request.approved_at!).toLocaleString()
      );
    }

    if (request.rejection_reason) {
      console.log(chalk.cyan("\nRejection Reason:"), request.rejection_reason);
    }

    if (request.result) {
      console.log(chalk.cyan("\nResult:"));
      try {
        const result = JSON.parse(request.result);
        console.log(chalk.gray(JSON.stringify(result, null, 2)));
      } catch (e) {
        console.log(chalk.gray(request.result));
      }
    }

    console.log(chalk.cyan("\nCreated At:"), new Date(request.created_at).toLocaleString());
    console.log(chalk.cyan("Updated At:"), new Date(request.updated_at).toLocaleString());

    if (request.completed_at) {
      console.log(chalk.cyan("Completed At:"), new Date(request.completed_at).toLocaleString());
    }

    console.log(chalk.gray("─".repeat(50)));
  } catch (error) {
    console.error(chalk.red("✗ Failed to show request"));
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// ============================================================================
// Request Create
// ============================================================================

export interface RequestCreateOptions {
  remoteRepo: string;
  type: string;
  entity: string;
  title: string;
  description?: string;
  priority?: string;
}

export async function handleRequestCreate(
  ctx: CommandContext,
  options: RequestCreateOptions
): Promise<void> {
  try {
    const remote = getRemoteRepo(ctx.db, options.remoteRepo);

    if (!remote || !remote.rest_endpoint) {
      console.error(
        chalk.red(
          `✗ Remote repository not found or has no REST endpoint: ${options.remoteRepo}`
        )
      );
      process.exit(1);
    }

    const requestId = `req-${uuidv4()}`;
    const now = new Date().toISOString();

    // Create request data
    const data: any = {
      title: options.title,
    };

    if (options.description) {
      data.description = options.description;
    }

    if (options.priority) {
      data.priority = parseInt(options.priority);
    }

    console.log(
      chalk.blue(
        `Sending ${options.type} request for ${options.entity} to ${options.remoteRepo}...`
      )
    );

    const response = await axios.post(
      `${remote.rest_endpoint}/federation/mutate`,
      {
        type: "mutate",
        from: "local",
        to: options.remoteRepo,
        timestamp: now,
        operation: `${options.type}_${options.entity}`,
        data,
        metadata: {
          request_id: requestId,
          requester: "cli",
        },
      },
      {
        timeout: 10000,
      }
    );

    const result = response.data;

    // Store the outgoing request in local database
    ctx.db
      .prepare(
        `
      INSERT INTO cross_repo_requests (
        request_id, direction, from_repo, to_repo,
        request_type, payload, status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        requestId,
        "outgoing",
        "local",
        options.remoteRepo,
        `${options.type}_${options.entity}`,
        JSON.stringify(data),
        result.status === "pending_approval" ? "pending" : result.status,
        now,
        now
      );

    if (ctx.jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (result.status === "pending_approval") {
        console.log(chalk.yellow("⏳ Request is pending approval"));
        console.log(chalk.gray(`  Request ID: ${requestId}`));
        console.log(
          chalk.gray(
            `  The remote repository will need to approve this request`
          )
        );
      } else if (result.status === "rejected") {
        console.log(chalk.red("✗ Request was rejected"));
        console.log(chalk.gray(`  Reason: ${result.message}`));
      } else {
        console.log(chalk.green("✓ Request created successfully"));
        console.log(chalk.gray(`  Request ID: ${requestId}`));
      }
    }
  } catch (error) {
    console.error(chalk.red("✗ Failed to create request"));
    if (axios.isAxiosError(error)) {
      if (error.response) {
        console.error(
          chalk.gray(
            `  HTTP ${error.response.status}: ${error.response.data?.detail || error.response.statusText}`
          )
        );
      } else {
        console.error(chalk.gray(`  ${error.message}`));
      }
    } else {
      console.error(error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  }
}

// ============================================================================
// Request Approve
// ============================================================================

export interface RequestApproveOptions {
  approver: string;
}

export async function handleRequestApprove(
  ctx: CommandContext,
  requestId: string,
  options: RequestApproveOptions
): Promise<void> {
  try {
    const request = getRequest(ctx.db, requestId);

    if (!request) {
      console.error(chalk.red(`✗ Request not found: ${requestId}`));
      process.exit(1);
    }

    if (request.direction !== "incoming") {
      console.error(chalk.red("✗ Can only approve incoming requests"));
      process.exit(1);
    }

    // Approve the request
    const approved = approveRequest(ctx.db, requestId, options.approver);

    console.log(chalk.blue(`Executing approved request...`));

    // Execute the request
    const result = await executeRequest(ctx, approved);

    // Mark as completed
    completeRequest(ctx.db, requestId, result);

    if (ctx.jsonOutput) {
      console.log(JSON.stringify({ request: approved, result }, null, 2));
    } else {
      console.log(chalk.green("✓ Request approved and executed"));
      console.log(chalk.gray(`  Created: ${result.entity} ${result.id}`));
    }
  } catch (error) {
    console.error(chalk.red("✗ Failed to approve request"));
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// ============================================================================
// Request Reject
// ============================================================================

export interface RequestRejectOptions {
  reason: string;
}

export async function handleRequestReject(
  ctx: CommandContext,
  requestId: string,
  options: RequestRejectOptions
): Promise<void> {
  try {
    const request = getRequest(ctx.db, requestId);

    if (!request) {
      console.error(chalk.red(`✗ Request not found: ${requestId}`));
      process.exit(1);
    }

    if (request.direction !== "incoming") {
      console.error(chalk.red("✗ Can only reject incoming requests"));
      process.exit(1);
    }

    const rejected = rejectRequest(ctx.db, requestId, options.reason);

    if (ctx.jsonOutput) {
      console.log(JSON.stringify(rejected, null, 2));
    } else {
      console.log(chalk.green("✓ Request rejected"));
      console.log(chalk.gray(`  Reason: ${options.reason}`));
    }
  } catch (error) {
    console.error(chalk.red("✗ Failed to reject request"));
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// ============================================================================
// Helper: Execute Request
// ============================================================================

async function executeRequest(
  ctx: CommandContext,
  request: any
): Promise<{ entity: string; id: string; uuid: string }> {
  const payload = JSON.parse(request.payload);

  // Determine entity type from request_type
  const [operation, entity] = request.request_type.split("_");

  if (operation === "create") {
    if (entity === "issue") {
      const { id, uuid } = generateIssueId(ctx.db, ctx.outputDir);
      createIssue(ctx.db, {
        id,
        uuid,
        title: payload.title,
        content: payload.description || "",
        status: "open",
        priority: payload.priority || 2,
        assignee: payload.assignee,
      });
      await exportToJSONL(ctx.db, { outputDir: ctx.outputDir });
      return { entity: "issue", id, uuid };
    } else if (entity === "spec") {
      const { id, uuid } = generateSpecId(ctx.db, ctx.outputDir);

      // Generate file path for the spec
      const specsDir = path.join(ctx.outputDir, "specs");
      fs.mkdirSync(specsDir, { recursive: true });
      const fileName = generateUniqueFilename(payload.title, id, specsDir);
      const filePath = `specs/${fileName}`;

      createSpec(ctx.db, {
        id,
        uuid,
        title: payload.title,
        file_path: filePath,
        content: payload.description || "",
        priority: payload.priority || 2,
      });
      await exportToJSONL(ctx.db, { outputDir: ctx.outputDir });
      return { entity: "spec", id, uuid };
    }
  }

  throw new Error(`Unsupported request type: ${request.request_type}`);
}
