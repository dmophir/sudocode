/**
 * CLI handlers for external-link commands
 */

import chalk from "chalk";
import type Database from "better-sqlite3";
import type { ExternalLink, SyncDirection } from "../types.js";
import {
  addExternalLinkToSpec,
  addExternalLinkToIssue,
  removeExternalLinkFromSpec,
  removeExternalLinkFromIssue,
  updateSpecExternalLinkSync,
  updateIssueExternalLinkSync,
  getSpecExternalLinks,
  getIssueExternalLinks,
  findEntitiesByExternalLink,
} from "../operations/external-links.js";
import { importFromJSONL } from "../import.js";
import { trackCommand } from "../telemetry.js";

export interface CommandContext {
  db: Database.Database;
  outputDir: string;
  jsonOutput: boolean;
}

/**
 * Infer entity type from ID prefix
 */
function inferEntityType(entityId: string): "spec" | "issue" {
  if (entityId.startsWith("s-")) return "spec";
  if (entityId.startsWith("i-")) return "issue";
  throw new Error(
    `Cannot infer entity type from ID "${entityId}". Expected prefix "s-" (spec) or "i-" (issue).`
  );
}

/**
 * Parse a JSON string, throwing a user-friendly error on invalid input
 */
function parseJsonOption(value: string, optionName: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error(`${optionName} must be a JSON object`);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON for ${optionName}: ${error.message}`);
    }
    throw error;
  }
}

// ============================================================================
// ADD
// ============================================================================

export interface AddOptions {
  provider: string;
  externalId: string;
  externalUrl?: string;
  syncDirection?: string;
  syncEnabled?: boolean;
  contentHash?: string;
  metadata?: string;
}

export async function handleExternalLinkAdd(
  ctx: CommandContext,
  entityId: string,
  options: AddOptions
): Promise<void> {
  const startTime = Date.now();
  try {
    const entityType = inferEntityType(entityId);

    // Build the ExternalLink object
    const link: ExternalLink = {
      provider: options.provider,
      external_id: options.externalId,
      sync_enabled: options.syncEnabled !== false,
      sync_direction: (options.syncDirection as SyncDirection) || "bidirectional",
    };

    if (options.externalUrl) {
      link.external_url = options.externalUrl;
    }
    if (options.contentHash) {
      link.content_hash = options.contentHash;
    }
    if (options.metadata) {
      link.metadata = parseJsonOption(options.metadata, "--metadata");
    }

    // Add the link
    if (entityType === "spec") {
      addExternalLinkToSpec(ctx.outputDir, entityId, link);
    } else {
      addExternalLinkToIssue(ctx.outputDir, entityId, link);
    }

    // Sync JSONL to SQLite
    await importFromJSONL(ctx.db, { inputDir: ctx.outputDir });

    if (ctx.jsonOutput) {
      console.log(
        JSON.stringify(
          {
            success: true,
            entity_id: entityId,
            entity_type: entityType,
            provider: options.provider,
            external_id: options.externalId,
          },
          null,
          2
        )
      );
    } else {
      console.log(chalk.green("✓ Added external link"));
      console.log(
        chalk.cyan(entityId),
        "→",
        chalk.yellow(`${options.provider}:${options.externalId}`)
      );
    }
    await trackCommand(
      ctx.outputDir,
      "external-link-add",
      { entity_id: entityId, provider: options.provider, external_id: options.externalId },
      true,
      Date.now() - startTime
    );
  } catch (error) {
    await trackCommand(
      ctx.outputDir,
      "external-link-add",
      { entity_id: entityId, provider: options.provider, external_id: options.externalId },
      false,
      Date.now() - startTime
    );
    console.error(chalk.red("✗ Failed to add external link"));
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// ============================================================================
// UPDATE
// ============================================================================

export interface UpdateOptions {
  externalId: string;
  lastSyncedAt?: string;
  externalUpdatedAt?: string;
  syncEnabled?: boolean;
  contentHash?: string;
  metadata?: string;
  externalUrl?: string;
}

export async function handleExternalLinkUpdate(
  ctx: CommandContext,
  entityId: string,
  options: UpdateOptions
): Promise<void> {
  const startTime = Date.now();
  try {
    const entityType = inferEntityType(entityId);

    // Build updates object
    const updates: Partial<
      Pick<
        ExternalLink,
        | "last_synced_at"
        | "external_updated_at"
        | "sync_enabled"
        | "content_hash"
        | "metadata"
        | "external_url"
      >
    > = {};

    if (options.lastSyncedAt !== undefined) {
      updates.last_synced_at = options.lastSyncedAt;
    }
    if (options.externalUpdatedAt !== undefined) {
      updates.external_updated_at = options.externalUpdatedAt;
    }
    if (options.syncEnabled !== undefined) {
      updates.sync_enabled = options.syncEnabled;
    }
    if (options.contentHash !== undefined) {
      updates.content_hash = options.contentHash;
    }
    if (options.externalUrl !== undefined) {
      updates.external_url = options.externalUrl;
    }
    if (options.metadata !== undefined) {
      updates.metadata = parseJsonOption(options.metadata, "--metadata");
    }

    // Update the link
    if (entityType === "spec") {
      updateSpecExternalLinkSync(ctx.outputDir, entityId, options.externalId, updates);
    } else {
      updateIssueExternalLinkSync(ctx.outputDir, entityId, options.externalId, updates);
    }

    // Sync JSONL to SQLite
    await importFromJSONL(ctx.db, { inputDir: ctx.outputDir });

    if (ctx.jsonOutput) {
      console.log(
        JSON.stringify(
          {
            success: true,
            entity_id: entityId,
            entity_type: entityType,
            external_id: options.externalId,
            updated_fields: Object.keys(updates),
          },
          null,
          2
        )
      );
    } else {
      console.log(chalk.green("✓ Updated external link"));
      console.log(
        chalk.cyan(entityId),
        "→",
        chalk.yellow(options.externalId),
        chalk.gray(`(${Object.keys(updates).join(", ")})`)
      );
    }
    await trackCommand(
      ctx.outputDir,
      "external-link-update",
      { entity_id: entityId, external_id: options.externalId },
      true,
      Date.now() - startTime
    );
  } catch (error) {
    await trackCommand(
      ctx.outputDir,
      "external-link-update",
      { entity_id: entityId, external_id: options.externalId },
      false,
      Date.now() - startTime
    );
    console.error(chalk.red("✗ Failed to update external link"));
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// ============================================================================
// LIST
// ============================================================================

export async function handleExternalLinkList(
  ctx: CommandContext,
  entityId: string
): Promise<void> {
  const startTime = Date.now();
  try {
    const entityType = inferEntityType(entityId);

    const links =
      entityType === "spec"
        ? getSpecExternalLinks(ctx.outputDir, entityId)
        : getIssueExternalLinks(ctx.outputDir, entityId);

    if (ctx.jsonOutput) {
      console.log(JSON.stringify(links, null, 2));
    } else {
      if (links.length === 0) {
        console.log(chalk.gray(`No external links for ${entityId}`));
      } else {
        console.log(chalk.bold(`External links for ${chalk.cyan(entityId)}:\n`));
        for (const link of links) {
          console.log(
            `  ${chalk.yellow(link.provider)}:${chalk.white(link.external_id)}`
          );
          if (link.external_url) {
            console.log(`    ${chalk.gray("URL:")} ${link.external_url}`);
          }
          console.log(
            `    ${chalk.gray("Sync:")} ${link.sync_enabled ? "enabled" : "disabled"} (${link.sync_direction})`
          );
          if (link.last_synced_at) {
            console.log(`    ${chalk.gray("Last synced:")} ${link.last_synced_at}`);
          }
          if (link.content_hash) {
            console.log(`    ${chalk.gray("Content hash:")} ${link.content_hash}`);
          }
          if (link.metadata) {
            console.log(
              `    ${chalk.gray("Metadata:")} ${JSON.stringify(link.metadata)}`
            );
          }
          console.log();
        }
      }
    }
    await trackCommand(
      ctx.outputDir,
      "external-link-list",
      { entity_id: entityId },
      true,
      Date.now() - startTime
    );
  } catch (error) {
    await trackCommand(
      ctx.outputDir,
      "external-link-list",
      { entity_id: entityId },
      false,
      Date.now() - startTime
    );
    console.error(chalk.red("✗ Failed to list external links"));
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// ============================================================================
// REMOVE
// ============================================================================

export interface RemoveOptions {
  externalId: string;
}

export async function handleExternalLinkRemove(
  ctx: CommandContext,
  entityId: string,
  options: RemoveOptions
): Promise<void> {
  const startTime = Date.now();
  try {
    const entityType = inferEntityType(entityId);

    if (entityType === "spec") {
      removeExternalLinkFromSpec(ctx.outputDir, entityId, options.externalId);
    } else {
      removeExternalLinkFromIssue(ctx.outputDir, entityId, options.externalId);
    }

    // Sync JSONL to SQLite
    await importFromJSONL(ctx.db, { inputDir: ctx.outputDir });

    if (ctx.jsonOutput) {
      console.log(
        JSON.stringify(
          {
            success: true,
            entity_id: entityId,
            entity_type: entityType,
            external_id: options.externalId,
          },
          null,
          2
        )
      );
    } else {
      console.log(chalk.green("✓ Removed external link"));
      console.log(
        chalk.cyan(entityId),
        "←✗→",
        chalk.yellow(options.externalId)
      );
    }
    await trackCommand(
      ctx.outputDir,
      "external-link-remove",
      { entity_id: entityId, external_id: options.externalId },
      true,
      Date.now() - startTime
    );
  } catch (error) {
    await trackCommand(
      ctx.outputDir,
      "external-link-remove",
      { entity_id: entityId, external_id: options.externalId },
      false,
      Date.now() - startTime
    );
    console.error(chalk.red("✗ Failed to remove external link"));
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// ============================================================================
// FIND
// ============================================================================

export interface FindOptions {
  provider: string;
  externalId: string;
}

export async function handleExternalLinkFind(
  ctx: CommandContext,
  options: FindOptions
): Promise<void> {
  const startTime = Date.now();
  try {
    const result = findEntitiesByExternalLink(
      ctx.outputDir,
      options.provider,
      options.externalId
    );

    if (ctx.jsonOutput) {
      console.log(
        JSON.stringify(
          {
            specs: result.specs.map((s) => ({ id: s.id, title: s.title })),
            issues: result.issues.map((i) => ({ id: i.id, title: i.title })),
          },
          null,
          2
        )
      );
    } else {
      const total = result.specs.length + result.issues.length;
      if (total === 0) {
        console.log(
          chalk.gray(
            `No entities found for ${options.provider}:${options.externalId}`
          )
        );
      } else {
        console.log(
          chalk.bold(
            `Entities linked to ${chalk.yellow(options.provider)}:${chalk.white(options.externalId)}:\n`
          )
        );
        for (const spec of result.specs) {
          console.log(`  ${chalk.cyan(spec.id)} ${chalk.gray("(spec)")}  ${spec.title}`);
        }
        for (const issue of result.issues) {
          console.log(`  ${chalk.cyan(issue.id)} ${chalk.gray("(issue)")} ${issue.title}`);
        }
      }
    }
    await trackCommand(
      ctx.outputDir,
      "external-link-find",
      { provider: options.provider, external_id: options.externalId },
      true,
      Date.now() - startTime
    );
  } catch (error) {
    await trackCommand(
      ctx.outputDir,
      "external-link-find",
      { provider: options.provider, external_id: options.externalId },
      false,
      Date.now() - startTime
    );
    console.error(chalk.red("✗ Failed to find entities by external link"));
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
