/**
 * MCP Server for sudocode
 *
 * This module sets up the MCP server with tools and resources.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SudocodeClient } from "./client.js";
import * as issueTools from "./tools/issues.js";
import * as specTools from "./tools/specs.js";
import * as relationshipTools from "./tools/relationships.js";
import * as feedbackTools from "./tools/feedback.js";
import * as referenceTools from "./tools/references.js";
import * as federationTools from "./tools/federation.js";
import { SudocodeClientConfig } from "./types.js";
import { existsSync } from "fs";
import { join } from "path";

export class SudocodeMCPServer {
  private server: Server;
  private client: SudocodeClient;
  private config: SudocodeClientConfig;
  private isInitialized: boolean = false;

  constructor(config?: SudocodeClientConfig) {
    this.config = config || {};
    this.server = new Server(
      {
        name: "sudocode",
        version: "0.1.1",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.client = new SudocodeClient(config);
    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "ready",
            description:
              "Find issues ready to work on (no blockers) and gets project status.",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "list_issues",
            description: "List all issues with optional filters",
            inputSchema: {
              type: "object",
              properties: {
                status: {
                  type: "string",
                  enum: ["open", "in_progress", "blocked", "closed"],
                  description: "Filter by status (optional)",
                },
                priority: {
                  type: "number",
                  description: "Filter by priority (0-4) (optional)",
                },
                archived: {
                  type: "boolean",
                  description:
                    "Filter by archived status (optional, defaults to false to exclude archived)",
                },
                limit: {
                  type: "number",
                  description: "Max results (optional)",
                  default: 50,
                },
                search: {
                  type: "string",
                  description:
                    "Search issues by title or description (optional)",
                },
              },
            },
          },
          {
            name: "show_issue",
            description:
              "Show detailed issue information including relationships and feedback",
            inputSchema: {
              type: "object",
              properties: {
                issue_id: {
                  type: "string",
                  description: 'Issue ID (e.g., "i-x7k9")',
                },
              },
              required: ["issue_id"],
            },
          },
          {
            name: "upsert_issue",
            description:
              "Create or update an issue. If issue_id is provided, updates the issue; otherwise creates a new one. To close an issue, set status='closed'. To archive an issue, set archived=true.",
            inputSchema: {
              type: "object",
              properties: {
                issue_id: {
                  type: "string",
                  description:
                    "Issue ID (optional - if provided, updates the issue; if not, creates new)",
                },
                title: {
                  type: "string",
                  description:
                    "Issue title (required for create, optional for update)",
                },
                description: {
                  type: "string",
                  description:
                    "Issue descriptions. Supports inline references to other specs/issues by ID in Obsidian internal link format (e.g. `[[i-x7k9]]`).",
                },
                priority: {
                  type: "number",
                  description: "Priority (0-4, 0=highest) (optional)",
                },
                parent: {
                  type: "string",
                  description: "Parent issue ID (optional)",
                },
                tags: {
                  type: "array",
                  items: { type: "string" },
                  description: "Tags (optional)",
                },
                status: {
                  type: "string",
                  enum: ["open", "in_progress", "blocked", "closed"],
                  description: "Issue status (optional)",
                },
                archived: {
                  type: "boolean",
                  description: "Archive status (optional)",
                },
              },
            },
          },
          {
            name: "list_specs",
            description: "List all specs with optional filters",
            inputSchema: {
              type: "object",
              properties: {
                limit: {
                  type: "number",
                  description: "Max results (optional)",
                  default: 50,
                },
                search: {
                  type: "string",
                  description:
                    "Search specs by title or description (optional)",
                },
              },
            },
          },
          {
            name: "show_spec",
            description:
              "Show detailed spec information including all feedback anchored to the spec",
            inputSchema: {
              type: "object",
              properties: {
                spec_id: {
                  type: "string",
                  description: 'Spec ID (e.g., "s-14sh")',
                },
              },
              required: ["spec_id"],
            },
          },
          {
            name: "upsert_spec",
            description:
              "Create or update a spec. If spec_id is provided, updates the spec; otherwise creates a new one with a hash-based ID (e.g., s-14sh).",
            inputSchema: {
              type: "object",
              properties: {
                spec_id: {
                  type: "string",
                  description:
                    "Spec ID (optional - if provided, updates the spec; if not, creates new)",
                },
                title: {
                  type: "string",
                  description: "Spec title (required for create)",
                },
                priority: {
                  type: "number",
                  description: "Priority (0-4, 0=highest) (optional)",
                },
                description: {
                  type: "string",
                  description: "Spec description (optional)",
                },
                parent: {
                  type: "string",
                  description: "Parent spec ID (optional)",
                },
                tags: {
                  type: "array",
                  items: { type: "string" },
                  description: "Tags (optional)",
                },
              },
            },
          },
          {
            name: "link",
            description:
              "Create a relationship between two entities (specs or issues)",
            inputSchema: {
              type: "object",
              properties: {
                from_id: {
                  type: "string",
                  description: "Source entity ID",
                },
                to_id: {
                  type: "string",
                  description: "Target entity ID",
                },
                type: {
                  type: "string",
                  enum: [
                    "blocks",
                    "implements",
                    "references",
                    "depends-on",
                    "discovered-from",
                    "related",
                  ],
                  description: "Relationship type",
                },
              },
              required: ["from_id", "to_id"],
            },
          },
          {
            name: "add_reference",
            description:
              "Add an inline cross-reference/mention to a spec or issue using Obsidian-style [[ID]] syntax. References are inserted at a specific location in the markdown content. Use this to add references to an issue or spec without having to modify the content directly.",
            inputSchema: {
              type: "object",
              properties: {
                entity_id: {
                  type: "string",
                  description: "Target entity ID (where to add the reference)",
                },
                reference_id: {
                  type: "string",
                  description: "ID to reference (e.g., i-x7k9, s-14sh)",
                },
                display_text: {
                  type: "string",
                  description: "Display text (optional)",
                },
                relationship_type: {
                  type: "string",
                  enum: [
                    "blocks",
                    "implements",
                    "references",
                    "depends-on",
                    "discovered-from",
                    "related",
                  ],
                  description: "Relationship type (optional)",
                },
                line: {
                  type: "number",
                  description:
                    "Line number to insert reference (use line OR text, not both)",
                },
                text: {
                  type: "string",
                  description:
                    "Text to search for insertion point (use line OR text, not both)",
                },
                format: {
                  type: "string",
                  enum: ["inline", "newline"],
                  description:
                    "Format: inline (same line) or newline (new line)",
                  default: "inline",
                },
                // TODO: Add position handling later if needed.
              },
              required: ["entity_id", "reference_id"],
            },
          },
          {
            name: "add_feedback",
            description:
              "Provide anchored feedback to a spec. IMPORTANT: You MUST specify either 'line' OR 'text' to anchor the feedback to a specific location in the spec. ",
            inputSchema: {
              type: "object",
              properties: {
                issue_id: {
                  type: "string",
                  description:
                    "Issue ID providing feedback (required for create)",
                },
                spec_id: {
                  type: "string",
                  description:
                    "Spec ID receiving feedback (required for create)",
                },
                content: {
                  type: "string",
                  description: "Feedback content (required for create)",
                },
                type: {
                  type: "string",
                  enum: ["comment", "suggestion", "request"],
                  description: "Feedback type",
                },
                line: {
                  type: "number",
                  description:
                    "Line number to anchor feedback (REQUIRED: must use either 'line' OR 'text', not both). Use this if you know the exact line number in the spec markdown file.",
                },
                text: {
                  type: "string",
                  description:
                    "Text snippet to anchor feedback (REQUIRED: must use either 'line' OR 'text', not both). Must be an EXACT substring match from the spec content - case-sensitive and whitespace-sensitive. Use show_spec first to see the exact content and copy the text precisely.",
                },
                // TODO: Re-enable when the agent data structure is more developed.
                // agent: {
                //   type: "string",
                //   description: "Agent providing feedback",
                // },
              },
            },
          },
          {
            name: "query_remote_repo",
            description:
              "Query a remote repository for issues or specs via federation",
            inputSchema: {
              type: "object",
              properties: {
                remote_url: {
                  type: "string",
                  description: "Remote repository URL (e.g., github.com/org/repo)",
                },
                query: {
                  type: "object",
                  properties: {
                    entity_type: {
                      type: "string",
                      enum: ["issue", "spec"],
                      description: "Type of entity to query",
                    },
                    filters: {
                      type: "object",
                      properties: {
                        status: { type: "string" },
                        priority: { type: "number" },
                        archived: { type: "boolean" },
                      },
                    },
                  },
                  required: ["entity_type"],
                },
              },
              required: ["remote_url", "query"],
            },
          },
          {
            name: "create_cross_repo_request",
            description:
              "Create a cross-repository request (e.g., create/update issue in another repo)",
            inputSchema: {
              type: "object",
              properties: {
                remote_url: {
                  type: "string",
                  description: "Remote repository URL",
                },
                request_type: {
                  type: "string",
                  enum: [
                    "query_issue",
                    "query_spec",
                    "create_issue",
                    "update_issue",
                    "create_spec",
                    "update_spec",
                  ],
                  description: "Type of request",
                },
                payload: {
                  type: "object",
                  description: "Request payload (structure depends on request_type)",
                },
                metadata: {
                  type: "object",
                  properties: {
                    requester: { type: "string" },
                    priority: { type: "number" },
                    reason: { type: "string" },
                  },
                },
              },
              required: ["remote_url", "request_type", "payload"],
            },
          },
          {
            name: "list_cross_repo_requests",
            description: "List cross-repository requests (incoming or outgoing)",
            inputSchema: {
              type: "object",
              properties: {
                direction: {
                  type: "string",
                  enum: ["outgoing", "incoming"],
                  description: "Filter by direction (optional)",
                },
                status: {
                  type: "string",
                  enum: ["pending", "approved", "rejected", "completed", "failed"],
                  description: "Filter by status (optional)",
                },
                limit: {
                  type: "number",
                  description: "Max results (optional)",
                },
              },
            },
          },
          {
            name: "approve_cross_repo_request",
            description: "Approve an incoming cross-repository request",
            inputSchema: {
              type: "object",
              properties: {
                request_id: {
                  type: "string",
                  description: "Request ID to approve",
                },
                response_data: {
                  type: "object",
                  description: "Optional response data",
                },
              },
              required: ["request_id"],
            },
          },
          {
            name: "reject_cross_repo_request",
            description: "Reject an incoming cross-repository request",
            inputSchema: {
              type: "object",
              properties: {
                request_id: {
                  type: "string",
                  description: "Request ID to reject",
                },
                reason: {
                  type: "string",
                  description: "Reason for rejection (optional)",
                },
              },
              required: ["request_id"],
            },
          },
          {
            name: "list_subscriptions",
            description: "List active subscriptions to remote repositories",
            inputSchema: {
              type: "object",
              properties: {
                remote_repo: {
                  type: "string",
                  description: "Filter by remote repository (optional)",
                },
                active: {
                  type: "boolean",
                  description: "Filter by active status (optional)",
                },
              },
            },
          },
          {
            name: "create_subscription",
            description:
              "Create a subscription to receive events from a remote repository",
            inputSchema: {
              type: "object",
              properties: {
                remote_repo: {
                  type: "string",
                  description: "Remote repository URL",
                },
                entity_type: {
                  type: "string",
                  enum: ["issue", "spec", "*"],
                  description: "Entity type to watch (* for all)",
                },
                entity_id: {
                  type: "string",
                  description: "Specific entity ID to watch (optional)",
                },
                events: {
                  type: "array",
                  items: { type: "string" },
                  description: "Events to subscribe to (e.g., ['created', 'updated'])",
                },
                webhook_url: {
                  type: "string",
                  description: "Webhook URL for delivery (optional)",
                },
              },
              required: ["remote_repo", "entity_type", "events"],
            },
          },
          {
            name: "delete_subscription",
            description: "Delete a subscription",
            inputSchema: {
              type: "object",
              properties: {
                subscription_id: {
                  type: "string",
                  description: "Subscription ID to delete",
                },
              },
              required: ["subscription_id"],
            },
          },
          {
            name: "list_remote_repos",
            description: "List configured remote repositories",
            inputSchema: {
              type: "object",
              properties: {
                trust_level: {
                  type: "string",
                  enum: ["trusted", "verified", "untrusted"],
                  description: "Filter by trust level (optional)",
                },
              },
            },
          },
          {
            name: "add_remote_repo",
            description: "Add a new remote repository for federation",
            inputSchema: {
              type: "object",
              properties: {
                url: {
                  type: "string",
                  description: "Repository URL (e.g., github.com/org/repo)",
                },
                display_name: {
                  type: "string",
                  description: "Display name for the repository",
                },
                trust_level: {
                  type: "string",
                  enum: ["trusted", "verified", "untrusted"],
                  description: "Trust level (defaults to 'verified')",
                },
                auto_sync: {
                  type: "boolean",
                  description: "Enable auto-sync (optional)",
                },
              },
              required: ["url", "display_name"],
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!this.isInitialized) {
        const workingDir = this.client["workingDir"] || process.cwd();
        return {
          content: [
            {
              type: "text",
              text: `⚠️  sudocode is not initialized in this directory.\n\nWorking directory: ${workingDir}\n\nPlease run 'sudocode init' in your project root first.`,
            },
          ],
          isError: true,
        };
      }

      try {
        let result: any;

        switch (name) {
          case "ready":
            result = await issueTools.ready(this.client, args as any);
            break;

          case "list_issues":
            result = await issueTools.listIssues(this.client, args as any);
            break;

          case "show_issue":
            result = await issueTools.showIssue(this.client, args as any);
            break;

          case "upsert_issue":
            result = await issueTools.upsertIssue(this.client, args as any);
            break;

          case "list_specs":
            result = await specTools.listSpecs(this.client, args as any);
            break;

          case "show_spec":
            result = await specTools.showSpec(this.client, args as any);
            break;

          case "upsert_spec":
            result = await specTools.upsertSpec(this.client, args as any);
            break;

          case "link":
            result = await relationshipTools.link(this.client, args as any);
            break;

          case "add_reference":
            result = await referenceTools.addReference(
              this.client,
              args as any
            );
            break;

          case "add_feedback":
            result = await feedbackTools.addFeedback(this.client, args as any);
            break;

          case "query_remote_repo":
            result = await federationTools.queryRemoteRepo(
              this.client,
              args as any
            );
            break;

          case "create_cross_repo_request":
            result = await federationTools.createCrossRepoRequest(
              this.client,
              args as any
            );
            break;

          case "list_cross_repo_requests":
            result = await federationTools.listCrossRepoRequests(
              this.client,
              args as any
            );
            break;

          case "approve_cross_repo_request":
            result = await federationTools.approveCrossRepoRequest(
              this.client,
              args as any
            );
            break;

          case "reject_cross_repo_request":
            result = await federationTools.rejectCrossRepoRequest(
              this.client,
              args as any
            );
            break;

          case "list_subscriptions":
            result = await federationTools.listSubscriptions(
              this.client,
              args as any
            );
            break;

          case "create_subscription":
            result = await federationTools.createSubscription(
              this.client,
              args as any
            );
            break;

          case "delete_subscription":
            result = await federationTools.deleteSubscription(
              this.client,
              args as any
            );
            break;

          case "list_remote_repos":
            result = await federationTools.listRemoteRepos(
              this.client,
              args as any
            );
            break;

          case "add_remote_repo":
            result = await federationTools.addRemoteRepo(
              this.client,
              args as any
            );
            break;

          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        let errorText = `Error: ${
          error instanceof Error ? error.message : String(error)
        }`;

        // Include stderr if this is a sudocode error
        if (error instanceof Error && "stderr" in error && error.stderr) {
          errorText += `\n\nStderr:\n${error.stderr}`;
        }

        return {
          content: [
            {
              type: "text",
              text: errorText,
            },
          ],
          isError: true,
        };
      }
    });

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: "sudocode://quickstart",
            name: "sudocode Quickstart Guide",
            description:
              "Introduction to sudocode workflow and best practices for agents",
            mimeType: "text/markdown",
          },
        ],
      };
    });

    // Read resource content
    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        const { uri } = request.params;

        if (uri === "sudocode://quickstart") {
          return {
            contents: [
              {
                uri,
                mimeType: "text/markdown",
                text: `# sudocode Quickstart

sudocode is a git-native spec and issue management system designed for AI-assisted development.

## Core Concepts

**Specs**: Technical specifications stored as markdown files
- Types: architecture, api, database, feature, research
- Status: draft → review → approved → deprecated
- Each spec has a unique hash-based ID (e.g., s-14sh) and file path

**Issues**: Work items tracked in the database
- Types: bug, feature, task, epic, chore
- Status: open → in_progress → blocked → closed
- Can reference and implement specs
- Each issue has a unique hash-based ID (e.g., i-x7k9)

**Feedback**: Issues can provide anchored feedback on specs
- Anchors track specific lines/sections in spec markdown
- Auto-relocates when specs change (smart anchoring)
- Types: comment, suggestion, request

## Typical Workflow

1. **Check ready work**: \`ready\` tool to find tasks with no blockers
2. **Claim work**: \`update_issue\` with status=in_progress
3. **Review specs**: \`show_spec\` to understand requirements
4. **Provide feedback**: \`add_feedback\` when specs are unclear
5. **Complete work**: \`close_issue\` when done
6. **Link entities**: Use \`link\` to create relationships

## Relationship Types
- \`blocks\`: Hard blocker (to_id must complete before from_id)
- \`implements\`: Issue implements a spec
- \`references\`: Soft reference
- \`depends-on\`: General dependency
- \`discovered-from\`: New work found during implementation
- \`related\`: General relationship
`,
              },
            ],
          };
        }

        throw new Error(`Unknown resource: ${uri}`);
      }
    );
  }

  /**
   * Check for .sudocode directory and required files
   * Returns initialization status and handles auto-import if needed
   */
  private async checkForInit(): Promise<{
    initialized: boolean;
    sudocodeExists: boolean;
    message?: string;
  }> {
    const workingDir = this.client["workingDir"] || process.cwd();
    const sudocodeDir = join(workingDir, ".sudocode");
    const cacheDbPath = join(sudocodeDir, "cache.db");
    const issuesPath = join(sudocodeDir, "issues.jsonl");
    const specsPath = join(sudocodeDir, "specs.jsonl");

    // Check if .sudocode directory exists
    if (!existsSync(sudocodeDir)) {
      return {
        initialized: false,
        sudocodeExists: false,
        message: "No .sudocode directory found",
      };
    }

    // .sudocode exists, check for cache.db
    if (!existsSync(cacheDbPath)) {
      // Try to auto-import from JSONL files if they exist
      if (existsSync(issuesPath) || existsSync(specsPath)) {
        try {
          console.error(
            "Found .sudocode directory but no cache.db, running import..."
          );
          await this.client.exec(["import"]);
          console.error("✓ Successfully imported data to cache.db");
          return {
            initialized: true,
            sudocodeExists: true,
            message: "Auto-imported from JSONL files",
          };
        } catch (error) {
          return {
            initialized: false,
            sudocodeExists: true,
            message: `Failed to import: ${
              error instanceof Error ? error.message : String(error)
            }`,
          };
        }
      } else {
        try {
          console.error(
            "Found .sudocode directory but no issues.jsonl or specs.jsonl, running init..."
          );
          await this.client.exec(["init"]);
          console.error("✓ Successfully initialized sudocode");
          await this.client.exec(["import"]);
          return {
            initialized: true,
            sudocodeExists: true,
            message: "Initialized sudocode",
          };
        } catch (error) {
          return {
            initialized: false,
            sudocodeExists: true,
            message: `Failed to initialize: ${
              error instanceof Error ? error.message : String(error)
            }`,
          };
        }
      }
    }

    return {
      initialized: true,
      sudocodeExists: true,
    };
  }

  /**
   * Check if sudocode is initialized in the working directory
   * This provides early warning to users without blocking server startup
   */
  private async checkInitialization() {
    const initStatus = await this.checkForInit();
    const workingDir = this.client["workingDir"] || process.cwd();

    if (initStatus.initialized) {
      this.isInitialized = true;
      console.error("✓ sudocode initialized successfully");
      if (initStatus.message) {
        console.error(`  ${initStatus.message}`);
      }
    } else {
      this.isInitialized = false;
      console.error("");
      console.error("⚠️  WARNING: sudocode is not initialized");
      console.error(`   Working directory: ${workingDir}`);
      console.error("");

      if (!initStatus.sudocodeExists) {
        console.error("   No .sudocode directory found.");
        console.error("   To initialize, run:");
        console.error("   $ sudocode init");
      } else {
        console.error(`   Issue: ${initStatus.message}`);
        console.error("   The .sudocode directory exists but is incomplete.");
        console.error("   Try running:");
        console.error("   $ sudocode import");
      }
    }
  }

  async run() {
    // Check if sudocode is initialized (non-blocking warning)
    await this.checkInitialization();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("sudocode MCP server running on stdio");
  }
}
