/**
 * MCP Server for Sudograph
 *
 * This module sets up the MCP server with tools and resources.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { SudographClient } from './client.js';

export class SudographMCPServer {
  private server: Server;
  private client: SudographClient;

  constructor() {
    this.server = new Server(
      {
        name: 'sudograph',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.client = new SudographClient();
    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // Placeholder - tools will be implemented in separate issues
          {
            name: 'ready',
            description: 'Find issues and specs ready to work on (no blockers)',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Max items to return',
                  default: 10,
                },
                priority: {
                  type: 'number',
                  description: 'Filter by priority (0-4)',
                },
                assignee: {
                  type: 'string',
                  description: 'Filter by assignee',
                },
                show_specs: {
                  type: 'boolean',
                  description: 'Include ready specs',
                  default: false,
                },
                show_issues: {
                  type: 'boolean',
                  description: 'Include ready issues',
                  default: true,
                },
              },
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Placeholder implementation
        if (name === 'ready') {
          const result = await this.client.exec(['ready']);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        throw new Error(`Unknown tool: ${name}`);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
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
            uri: 'sudograph://quickstart',
            name: 'Sudograph Quickstart Guide',
            description: 'Introduction to Sudograph workflow and best practices for agents',
            mimeType: 'text/markdown',
          },
        ],
      };
    });

    // Read resource content
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      if (uri === 'sudograph://quickstart') {
        return {
          contents: [
            {
              uri,
              mimeType: 'text/markdown',
              text: `# Sudograph Quickstart

Sudograph is a git-native spec and issue management system designed for AI-assisted development.

## Core Concepts

**Specs**: Technical specifications stored as markdown files
- Types: architecture, api, database, feature, research
- Status: draft → review → approved → deprecated
- Each spec has a unique ID (e.g., sg-spec-1) and file path

**Issues**: Work items tracked in the database
- Types: bug, feature, task, epic, chore
- Status: open → in_progress → blocked → closed
- Can reference and implement specs

**Feedback**: Issues can provide anchored feedback on specs
- Anchors track specific lines/sections in spec markdown
- Auto-relocates when specs change (smart anchoring)
- Types: ambiguity, missing_requirement, technical_constraint, suggestion, question

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
- \`parent-child\`: Epic/subtask hierarchy
- \`discovered-from\`: New work found during implementation
`,
            },
          ],
        };
      }

      throw new Error(`Unknown resource: ${uri}`);
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Sudograph MCP server running on stdio');
  }
}
