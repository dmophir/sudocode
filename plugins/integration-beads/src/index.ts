/**
 * Beads Integration Plugin for sudocode
 *
 * Provides integration with Beads - a local file-based issue tracking format.
 * Beads stores issues in a .beads directory with JSONL files similar to sudocode.
 */

import type {
  IntegrationPlugin,
  IntegrationProvider,
  PluginValidationResult,
  PluginTestResult,
  PluginConfigSchema,
  ExternalEntity,
  ExternalChange,
  Spec,
  Issue,
} from "@sudocode-ai/types";
import { existsSync, readFileSync } from "fs";
import * as path from "path";

/**
 * Beads-specific configuration options
 */
export interface BeadsOptions {
  /** Path to the .beads directory (relative to project root) */
  path: string;
  /** Prefix for issue IDs imported from beads (default: "bd") */
  issue_prefix?: string;
}

/**
 * Beads integration plugin
 */
const beadsPlugin: IntegrationPlugin = {
  name: "beads",
  displayName: "Beads",
  version: "0.1.0",
  description: "Integration with Beads local file-based issue tracking",

  configSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        title: "Beads Path",
        description: "Path to the .beads directory (relative to project root)",
        required: true,
      },
      issue_prefix: {
        type: "string",
        title: "Issue Prefix",
        description: "Prefix for issue IDs imported from beads",
        default: "bd",
      },
    },
    required: ["path"],
  },

  validateConfig(options: Record<string, unknown>): PluginValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required path field
    if (!options.path || typeof options.path !== "string") {
      errors.push("beads.options.path is required");
    }

    // Validate issue_prefix if provided
    if (options.issue_prefix !== undefined) {
      if (typeof options.issue_prefix !== "string") {
        errors.push("beads.options.issue_prefix must be a string");
      } else if (!/^[a-z]{1,4}$/i.test(options.issue_prefix)) {
        warnings.push(
          "beads.options.issue_prefix should be 1-4 alphabetic characters"
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  },

  async testConnection(
    options: Record<string, unknown>,
    projectPath: string
  ): Promise<PluginTestResult> {
    const beadsPath = options.path as string;

    if (!beadsPath) {
      return {
        success: false,
        configured: true,
        enabled: true,
        error: "Beads path is not configured",
      };
    }

    const resolvedPath = path.resolve(projectPath, beadsPath);

    if (!existsSync(resolvedPath)) {
      return {
        success: false,
        configured: true,
        enabled: true,
        error: `Beads directory not found: ${resolvedPath}`,
        details: { path: beadsPath, resolvedPath },
      };
    }

    // Check for issues.jsonl in beads directory
    const issuesPath = path.join(resolvedPath, "issues.jsonl");
    const hasIssues = existsSync(issuesPath);

    // Try to count issues if file exists
    let issueCount = 0;
    if (hasIssues) {
      try {
        const content = readFileSync(issuesPath, "utf-8");
        issueCount = content.split("\n").filter((line) => line.trim()).length;
      } catch {
        // Ignore read errors
      }
    }

    return {
      success: true,
      configured: true,
      enabled: true,
      details: {
        path: beadsPath,
        resolvedPath,
        hasIssuesFile: hasIssues,
        issueCount,
      },
    };
  },

  createProvider(
    options: Record<string, unknown>,
    projectPath: string
  ): IntegrationProvider {
    return new BeadsProvider(options as unknown as BeadsOptions, projectPath);
  },
};

/**
 * Beads provider implementation
 */
class BeadsProvider implements IntegrationProvider {
  readonly name = "beads";
  readonly supportsWatch = true;
  readonly supportsPolling = true;

  private options: BeadsOptions;
  private projectPath: string;
  private resolvedPath: string;

  constructor(options: BeadsOptions, projectPath: string) {
    this.options = options;
    this.projectPath = projectPath;
    this.resolvedPath = path.resolve(projectPath, options.path);
  }

  async initialize(): Promise<void> {
    if (!existsSync(this.resolvedPath)) {
      throw new Error(`Beads directory not found: ${this.resolvedPath}`);
    }
  }

  async dispose(): Promise<void> {
    // No cleanup needed for file-based provider
  }

  async fetchEntity(externalId: string): Promise<ExternalEntity | null> {
    const issuesPath = path.join(this.resolvedPath, "issues.jsonl");
    if (!existsSync(issuesPath)) {
      return null;
    }

    try {
      const content = readFileSync(issuesPath, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        const issue = JSON.parse(line);
        if (issue.id === externalId) {
          return this.beadsToExternal(issue);
        }
      }
    } catch {
      // Ignore parse errors
    }

    return null;
  }

  async searchEntities(query?: string): Promise<ExternalEntity[]> {
    const issuesPath = path.join(this.resolvedPath, "issues.jsonl");
    if (!existsSync(issuesPath)) {
      return [];
    }

    try {
      const content = readFileSync(issuesPath, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());
      const entities: ExternalEntity[] = [];

      for (const line of lines) {
        try {
          const issue = JSON.parse(line);
          const entity = this.beadsToExternal(issue);

          // Filter by query if provided
          if (query) {
            const lowerQuery = query.toLowerCase();
            if (
              entity.title.toLowerCase().includes(lowerQuery) ||
              entity.description?.toLowerCase().includes(lowerQuery)
            ) {
              entities.push(entity);
            }
          } else {
            entities.push(entity);
          }
        } catch {
          // Skip invalid lines
        }
      }

      return entities;
    } catch {
      return [];
    }
  }

  async createEntity(entity: Partial<Spec | Issue>): Promise<string> {
    // TODO: Implement create in beads format
    throw new Error("Creating entities in Beads is not yet implemented");
  }

  async updateEntity(
    externalId: string,
    entity: Partial<Spec | Issue>
  ): Promise<void> {
    // TODO: Implement update in beads format
    throw new Error("Updating entities in Beads is not yet implemented");
  }

  async getChangesSince(timestamp: Date): Promise<ExternalChange[]> {
    // TODO: Implement change detection
    return [];
  }

  mapToSudocode(external: ExternalEntity): {
    spec?: Partial<Spec>;
    issue?: Partial<Issue>;
  } {
    if (external.type === "issue") {
      return {
        issue: {
          title: external.title,
          content: external.description || "",
          priority: external.priority ?? 2,
          status: this.mapStatus(external.status),
        },
      };
    }

    return {
      spec: {
        title: external.title,
        content: external.description || "",
        priority: external.priority ?? 2,
      },
    };
  }

  mapFromSudocode(entity: Spec | Issue): Partial<ExternalEntity> {
    const isIssue = "status" in entity;

    return {
      type: isIssue ? "issue" : "spec",
      title: entity.title,
      description: entity.content,
      priority: entity.priority,
      status: isIssue ? (entity as Issue).status : undefined,
    };
  }

  private beadsToExternal(beadsIssue: Record<string, unknown>): ExternalEntity {
    return {
      id: beadsIssue.id as string,
      type: "issue",
      title: (beadsIssue.title as string) || "",
      description: beadsIssue.content as string,
      status: beadsIssue.status as string,
      priority: beadsIssue.priority as number,
      created_at: beadsIssue.created_at as string,
      updated_at: beadsIssue.updated_at as string,
      raw: beadsIssue,
    };
  }

  private mapStatus(
    externalStatus?: string
  ): "open" | "in_progress" | "blocked" | "needs_review" | "closed" {
    if (!externalStatus) return "open";

    const statusMap: Record<
      string,
      "open" | "in_progress" | "blocked" | "needs_review" | "closed"
    > = {
      open: "open",
      in_progress: "in_progress",
      blocked: "blocked",
      needs_review: "needs_review",
      closed: "closed",
      done: "closed",
      completed: "closed",
    };

    return statusMap[externalStatus.toLowerCase()] || "open";
  }
}

export default beadsPlugin;
