/**
 * CLI handlers for remote repository commands
 */

import chalk from "chalk";
import type Database from "better-sqlite3";
import Table from "cli-table3";
import axios from "axios";
import {
  addRemoteRepo,
  getRemoteRepo,
  listRemoteRepos,
  updateRemoteRepo,
  removeRemoteRepo,
  type TrustLevel,
  type RemoteRepo,
} from "../operations/federation.js";

export interface CommandContext {
  db: Database.Database;
  outputDir: string;
  jsonOutput: boolean;
}

// ============================================================================
// Remote Add
// ============================================================================

export interface RemoteAddOptions {
  displayName?: string;
  trustLevel: string;
  restEndpoint?: string;
  wsEndpoint?: string;
  gitUrl?: string;
  description?: string;
  autoSync?: string;
  syncInterval?: string;
  addedBy: string;
}

export async function handleRemoteAdd(
  ctx: CommandContext,
  url: string,
  options: RemoteAddOptions
): Promise<void> {
  try {
    const trustLevel = options.trustLevel as TrustLevel;
    if (!["trusted", "verified", "untrusted"].includes(trustLevel)) {
      throw new Error(`Invalid trust level: ${trustLevel}`);
    }

    const remote = addRemoteRepo(ctx.db, {
      url,
      display_name: options.displayName || url,
      description: options.description,
      trust_level: trustLevel,
      rest_endpoint: options.restEndpoint,
      ws_endpoint: options.wsEndpoint,
      git_url: options.gitUrl,
      auto_sync: options.autoSync === "true",
      sync_interval_minutes: options.syncInterval
        ? parseInt(options.syncInterval)
        : 60,
      added_by: options.addedBy,
    });

    if (ctx.jsonOutput) {
      console.log(JSON.stringify(remote, null, 2));
    } else {
      console.log(chalk.green("✓ Added remote repository"), chalk.cyan(url));
      console.log(chalk.gray(`  Display Name: ${remote.display_name}`));
      console.log(chalk.gray(`  Trust Level: ${remote.trust_level}`));
      if (remote.rest_endpoint) {
        console.log(chalk.gray(`  REST Endpoint: ${remote.rest_endpoint}`));
      }
    }
  } catch (error) {
    console.error(chalk.red("✗ Failed to add remote repository"));
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// ============================================================================
// Remote List
// ============================================================================

export interface RemoteListOptions {
  trustLevel?: string;
  syncStatus?: string;
}

export async function handleRemoteList(
  ctx: CommandContext,
  options: RemoteListOptions
): Promise<void> {
  try {
    const remotes = listRemoteRepos(ctx.db, {
      trust_level: options.trustLevel as TrustLevel,
      sync_status: options.syncStatus as any,
    });

    if (ctx.jsonOutput) {
      console.log(JSON.stringify(remotes, null, 2));
      return;
    }

    if (remotes.length === 0) {
      console.log(chalk.yellow("No remote repositories configured"));
      console.log(
        chalk.gray(
          "Use 'sudocode remote add <url>' to add a remote repository"
        )
      );
      return;
    }

    const table = new Table({
      head: [
        chalk.cyan("URL"),
        chalk.cyan("Display Name"),
        chalk.cyan("Trust Level"),
        chalk.cyan("Sync Status"),
        chalk.cyan("REST Endpoint"),
      ],
      colWidths: [30, 20, 15, 15, 40],
      wordWrap: true,
    });

    for (const remote of remotes) {
      const trustColor =
        remote.trust_level === "trusted"
          ? chalk.green
          : remote.trust_level === "verified"
          ? chalk.blue
          : chalk.yellow;

      const syncColor =
        remote.sync_status === "synced"
          ? chalk.green
          : remote.sync_status === "stale"
          ? chalk.yellow
          : remote.sync_status === "unreachable"
          ? chalk.red
          : chalk.gray;

      table.push([
        remote.url,
        remote.display_name,
        trustColor(remote.trust_level),
        syncColor(remote.sync_status),
        remote.rest_endpoint || chalk.gray("(none)"),
      ]);
    }

    console.log(table.toString());
    console.log(chalk.gray(`\nTotal: ${remotes.length} remote(s)`));
  } catch (error) {
    console.error(chalk.red("✗ Failed to list remote repositories"));
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// ============================================================================
// Remote Show
// ============================================================================

export async function handleRemoteShow(
  ctx: CommandContext,
  url: string
): Promise<void> {
  try {
    const remote = getRemoteRepo(ctx.db, url);

    if (!remote) {
      console.error(chalk.red(`✗ Remote repository not found: ${url}`));
      process.exit(1);
    }

    if (ctx.jsonOutput) {
      console.log(JSON.stringify(remote, null, 2));
      return;
    }

    console.log(chalk.bold("\nRemote Repository Details"));
    console.log(chalk.gray("─".repeat(50)));
    console.log(chalk.cyan("URL:"), remote.url);
    console.log(chalk.cyan("Display Name:"), remote.display_name);

    if (remote.description) {
      console.log(chalk.cyan("Description:"), remote.description);
    }

    const trustColor =
      remote.trust_level === "trusted"
        ? chalk.green
        : remote.trust_level === "verified"
        ? chalk.blue
        : chalk.yellow;
    console.log(chalk.cyan("Trust Level:"), trustColor(remote.trust_level));

    const syncColor =
      remote.sync_status === "synced"
        ? chalk.green
        : remote.sync_status === "stale"
        ? chalk.yellow
        : remote.sync_status === "unreachable"
        ? chalk.red
        : chalk.gray;
    console.log(chalk.cyan("Sync Status:"), syncColor(remote.sync_status));

    if (remote.rest_endpoint) {
      console.log(chalk.cyan("REST Endpoint:"), remote.rest_endpoint);
    }
    if (remote.ws_endpoint) {
      console.log(chalk.cyan("WebSocket Endpoint:"), remote.ws_endpoint);
    }
    if (remote.git_url) {
      console.log(chalk.cyan("Git URL:"), remote.git_url);
    }

    console.log(
      chalk.cyan("Auto Sync:"),
      remote.auto_sync ? chalk.green("enabled") : chalk.gray("disabled")
    );
    console.log(
      chalk.cyan("Sync Interval:"),
      `${remote.sync_interval_minutes} minutes`
    );

    console.log(chalk.cyan("Added By:"), remote.added_by);
    console.log(
      chalk.cyan("Added At:"),
      new Date(remote.added_at).toLocaleString()
    );

    if (remote.last_synced_at) {
      console.log(
        chalk.cyan("Last Synced:"),
        new Date(remote.last_synced_at).toLocaleString()
      );
    }

    console.log(chalk.gray("─".repeat(50)));
  } catch (error) {
    console.error(chalk.red("✗ Failed to show remote repository"));
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// ============================================================================
// Remote Update
// ============================================================================

export interface RemoteUpdateOptions {
  displayName?: string;
  description?: string;
  trustLevel?: string;
  restEndpoint?: string;
  wsEndpoint?: string;
  gitUrl?: string;
  autoSync?: string;
  syncInterval?: string;
}

export async function handleRemoteUpdate(
  ctx: CommandContext,
  url: string,
  options: RemoteUpdateOptions
): Promise<void> {
  try {
    const updates: any = {};

    if (options.displayName) updates.display_name = options.displayName;
    if (options.description) updates.description = options.description;
    if (options.trustLevel) {
      const trustLevel = options.trustLevel as TrustLevel;
      if (!["trusted", "verified", "untrusted"].includes(trustLevel)) {
        throw new Error(`Invalid trust level: ${trustLevel}`);
      }
      updates.trust_level = trustLevel;
    }
    if (options.restEndpoint) updates.rest_endpoint = options.restEndpoint;
    if (options.wsEndpoint) updates.ws_endpoint = options.wsEndpoint;
    if (options.gitUrl) updates.git_url = options.gitUrl;
    if (options.autoSync) updates.auto_sync = options.autoSync === "true";
    if (options.syncInterval)
      updates.sync_interval_minutes = parseInt(options.syncInterval);

    const remote = updateRemoteRepo(ctx.db, url, updates);

    if (ctx.jsonOutput) {
      console.log(JSON.stringify(remote, null, 2));
    } else {
      console.log(
        chalk.green("✓ Updated remote repository"),
        chalk.cyan(url)
      );
    }
  } catch (error) {
    console.error(chalk.red("✗ Failed to update remote repository"));
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// ============================================================================
// Remote Remove
// ============================================================================

export async function handleRemoteRemove(
  ctx: CommandContext,
  url: string
): Promise<void> {
  try {
    const removed = removeRemoteRepo(ctx.db, url);

    if (!removed) {
      console.error(chalk.red(`✗ Remote repository not found: ${url}`));
      process.exit(1);
    }

    if (ctx.jsonOutput) {
      console.log(JSON.stringify({ removed: true }, null, 2));
    } else {
      console.log(
        chalk.green("✓ Removed remote repository"),
        chalk.cyan(url)
      );
    }
  } catch (error) {
    console.error(chalk.red("✗ Failed to remove remote repository"));
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// ============================================================================
// Remote Discover
// ============================================================================

export async function handleRemoteDiscover(
  ctx: CommandContext,
  url: string
): Promise<void> {
  try {
    const remote = getRemoteRepo(ctx.db, url);

    if (!remote || !remote.rest_endpoint) {
      console.error(
        chalk.red(
          `✗ Remote repository not found or has no REST endpoint: ${url}`
        )
      );
      process.exit(1);
    }

    console.log(chalk.blue(`Discovering capabilities of ${url}...`));

    const response = await axios.get(
      `${remote.rest_endpoint}/federation/info`,
      {
        params: { from: "local" },
        timeout: 10000,
      }
    );

    const capabilities = response.data;

    // Update capabilities in database
    updateRemoteRepo(ctx.db, url, {
      capabilities: JSON.stringify(capabilities.capabilities),
      sync_status: "synced",
      last_synced_at: new Date().toISOString(),
    });

    if (ctx.jsonOutput) {
      console.log(JSON.stringify(capabilities, null, 2));
    } else {
      console.log(chalk.green("✓ Discovery successful"));
      console.log(chalk.cyan("\nCapabilities:"));
      console.log(
        chalk.gray("  Protocols:"),
        capabilities.capabilities.protocols.join(", ")
      );
      console.log(
        chalk.gray("  Operations:"),
        capabilities.capabilities.operations.join(", ")
      );
      console.log(
        chalk.gray("  Entity Types:"),
        capabilities.capabilities.entity_types.join(", ")
      );
    }
  } catch (error) {
    console.error(chalk.red("✗ Failed to discover remote capabilities"));
    if (axios.isAxiosError(error)) {
      if (error.code === "ECONNREFUSED") {
        console.error(
          chalk.gray("  Remote server is not reachable or not running")
        );
      } else if (error.response) {
        console.error(
          chalk.gray(`  HTTP ${error.response.status}: ${error.response.statusText}`)
        );
      } else {
        console.error(chalk.gray(`  ${error.message}`));
      }
    } else {
      console.error(error instanceof Error ? error.message : String(error));
    }

    // Update sync status to unreachable
    try {
      updateRemoteRepo(ctx.db, url, {
        sync_status: "unreachable",
      });
    } catch (e) {
      // Ignore update errors
    }

    process.exit(1);
  }
}

// ============================================================================
// Remote Query
// ============================================================================

export interface RemoteQueryOptions {
  entity: string;
  status?: string;
  priority?: string;
  limit?: string;
}

export async function handleRemoteQuery(
  ctx: CommandContext,
  url: string,
  options: RemoteQueryOptions
): Promise<void> {
  try {
    const remote = getRemoteRepo(ctx.db, url);

    if (!remote || !remote.rest_endpoint) {
      console.error(
        chalk.red(
          `✗ Remote repository not found or has no REST endpoint: ${url}`
        )
      );
      process.exit(1);
    }

    console.log(chalk.blue(`Querying ${options.entity}s from ${url}...`));

    const filters: any = {};
    if (options.status) filters.status = options.status;
    if (options.priority) filters.priority = parseInt(options.priority);

    const response = await axios.post(
      `${remote.rest_endpoint}/federation/query`,
      {
        type: "query",
        from: "local",
        to: url,
        timestamp: new Date().toISOString(),
        query: {
          entity: options.entity,
          filters,
          limit: options.limit ? parseInt(options.limit) : 50,
        },
      },
      {
        timeout: 10000,
      }
    );

    const results = response.data.results;

    if (ctx.jsonOutput) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      console.log(chalk.green(`✓ Found ${results.length} ${options.entity}(s)`));

      if (results.length > 0) {
        const table = new Table({
          head: [
            chalk.cyan("ID"),
            chalk.cyan("Title"),
            chalk.cyan("Status"),
            chalk.cyan("Priority"),
          ],
          colWidths: [20, 40, 15, 10],
          wordWrap: true,
        });

        for (const item of results) {
          table.push([
            item.id,
            item.title,
            item.status || "N/A",
            item.priority !== undefined ? item.priority.toString() : "N/A",
          ]);
        }

        console.log("\n" + table.toString());
      }
    }
  } catch (error) {
    console.error(chalk.red("✗ Failed to query remote repository"));
    if (axios.isAxiosError(error)) {
      if (error.response) {
        console.error(
          chalk.gray(`  HTTP ${error.response.status}: ${error.response.data?.detail || error.response.statusText}`)
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
