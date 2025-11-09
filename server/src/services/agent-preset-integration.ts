/**
 * Agent Preset Integration for Execution Service
 *
 * Provides functionality to load, apply, and execute agent presets
 * within the execution lifecycle.
 */

import * as fs from "fs";
import * as path from "path";
import type { AgentConfig, AgentPreset, HookEvent } from "@sudocode-ai/types";
import type Database from "better-sqlite3";
import { getAgentPreset } from "../../../cli/src/operations/agents.js";
import {
  executeHooksForEvent,
  type HookExecutionContext
} from "../../../cli/src/operations/hooks.js";
import {
  selectAgent,
  type SelectionContext,
  type SelectionResult
} from "../../../cli/src/operations/agent-selection.js";
import {
  recordExecution,
  type ExecutionRecord
} from "../../../cli/src/operations/agent-metrics.js";
import {
  getWorkflow,
  type AgentWorkflow
} from "../../../cli/src/operations/workflows.js";

/**
 * Extended execution config with agent preset support
 */
export interface AgentExecutionConfig {
  // Existing config
  mode?: "worktree" | "local";
  model?: string;
  timeout?: number;
  baseBranch?: string;
  branchName?: string;
  checkpointInterval?: number;
  continueOnStepFailure?: boolean;
  captureFileChanges?: boolean;
  captureToolCalls?: boolean;

  // Agent preset config
  presetId?: string; // Use specific preset
  workflowId?: string; // Use workflow instead of single agent
  autoSelect?: boolean; // Use dynamic agent selection
  agentConfig?: Partial<AgentConfig>; // Override preset config
}

/**
 * Result from loading agent preset
 */
export interface LoadedAgentPreset {
  preset: AgentPreset;
  systemPrompt: string;
  model: string;
  tools?: string[];
  mcpServers?: string[];
  maxContextTokens?: number;
  hooks?: AgentConfig["hooks"];
}

/**
 * Get sudocode directory from repository path
 */
function getSudocodeDir(repoPath: string): string {
  const sudocodeDir = path.join(repoPath, ".sudocode");
  if (!fs.existsSync(sudocodeDir)) {
    throw new Error(`No .sudocode directory found at ${repoPath}`);
  }
  return sudocodeDir;
}

/**
 * Load agent preset and return configuration
 */
export function loadAgentPreset(
  repoPath: string,
  presetId: string
): LoadedAgentPreset {
  const sudocodeDir = getSudocodeDir(repoPath);
  const preset = getAgentPreset(sudocodeDir, presetId);

  if (!preset) {
    throw new Error(`Agent preset not found: ${presetId}`);
  }

  return {
    preset,
    systemPrompt: preset.system_prompt,
    model: preset.config.model || "claude-sonnet-4-5",
    tools: preset.config.tools,
    mcpServers: preset.config.mcp_servers,
    maxContextTokens: preset.config.max_context_tokens,
    hooks: preset.config.hooks,
  };
}

/**
 * Select agent dynamically based on issue context
 */
export function selectAgentForIssue(
  repoPath: string,
  db: Database.Database,
  issueId: string
): SelectionResult {
  const sudocodeDir = getSudocodeDir(repoPath);

  // Load issue
  const issue = db
    .prepare("SELECT * FROM issues WHERE id = ?")
    .get(issueId) as
    | {
        id: string;
        title: string;
        content: string;
        status: string;
        priority: number;
      }
    | undefined;

  if (!issue) {
    throw new Error(`Issue ${issueId} not found`);
  }

  // Load tags
  const tags = db
    .prepare("SELECT tag FROM tags WHERE entity_id = ? AND entity_type = 'issue'")
    .all(issueId) as Array<{ tag: string }>;

  // Build selection context
  const context: SelectionContext = {
    issue_id: issueId,
    title: issue.title,
    description: issue.content,
    status: issue.status,
    priority: issue.priority,
    tags: tags.map((t) => t.tag),
  };

  return selectAgent(sudocodeDir, context);
}

/**
 * Load workflow
 */
export function loadWorkflow(
  repoPath: string,
  workflowId: string
): AgentWorkflow {
  const sudocodeDir = getSudocodeDir(repoPath);
  const workflow = getWorkflow(sudocodeDir, workflowId);

  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  return workflow;
}

/**
 * Execute hooks for a specific event
 */
export async function executeAgentHooks(
  repoPath: string,
  event: HookEvent,
  context: Partial<HookExecutionContext>
): Promise<void> {
  const sudocodeDir = getSudocodeDir(repoPath);

  try {
    const results = await executeHooksForEvent(sudocodeDir, event, context);

    // Check if any hooks failed
    for (const result of results) {
      if (!result.success) {
        console.warn(`[AgentPresetIntegration] Hook failed:`, {
          hookId: result.hookId,
          event,
          error: result.error,
        });
        // If it's an error result, throw to halt execution
        if (result.error?.includes("Required")) {
          throw new Error(`Hook failed: ${result.hookId} - ${result.error}`);
        }
      }
    }
  } catch (error) {
    console.error(`[AgentPresetIntegration] Error executing hooks:`, {
      event,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Record execution metrics
 */
export function recordExecutionMetrics(
  repoPath: string,
  record: ExecutionRecord
): void {
  const sudocodeDir = getSudocodeDir(repoPath);

  try {
    recordExecution(sudocodeDir, record);
  } catch (error) {
    console.error(`[AgentPresetIntegration] Error recording metrics:`, {
      executionId: record.execution_id,
      error: error instanceof Error ? error.message : String(error),
    });
    // Don't throw - metrics recording is non-critical
  }
}

/**
 * Apply agent preset configuration to execution config
 */
export function applyPresetToConfig(
  loadedPreset: LoadedAgentPreset,
  baseConfig: AgentExecutionConfig,
  overrides?: Partial<AgentConfig>
): AgentExecutionConfig {
  return {
    ...baseConfig,
    model: overrides?.model || loadedPreset.model || baseConfig.model,
    timeout:
      overrides?.max_context_tokens || loadedPreset.maxContextTokens
        ? undefined // Let it be calculated from context tokens
        : baseConfig.timeout,
    // Other fields from baseConfig are preserved
  };
}

/**
 * Build prompt with agent preset system prompt
 */
export function buildPromptWithPreset(
  loadedPreset: LoadedAgentPreset,
  basePrompt: string
): string {
  // Prepend system prompt to the base prompt
  return `${loadedPreset.systemPrompt}

---

${basePrompt}`;
}

/**
 * Validate agent preset exists
 */
export function validatePreset(repoPath: string, presetId: string): boolean {
  const sudocodeDir = getSudocodeDir(repoPath);
  const preset = getAgentPreset(sudocodeDir, presetId);
  return preset !== null;
}
