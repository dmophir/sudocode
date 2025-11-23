/**
 * Agent configuration types for sudocode
 *
 * Defines agent types and their specific configuration interfaces.
 * Each agent config extends BaseAgentConfig from agent-execution-engine.
 *
 * @example
 * ```typescript
 * // Import from main package
 * import type { AgentType, AgentConfig } from '@sudocode-ai/types';
 *
 * // Or import directly from agents
 * import type { ClaudeCodeConfig } from '@sudocode-ai/types/agents';
 *
 * const agentType: AgentType = 'claude-code';
 * const config: ClaudeCodeConfig = {
 *   workDir: '/path/to/project',
 *   claudePath: 'claude',
 *   print: true,
 *   outputFormat: 'stream-json',
 * };
 * ```
 *
 * @module @sudocode-ai/types/agents
 */

/**
 * Agent types supported for execution
 */
export type AgentType = "claude-code" | "codex" | "copilot" | "cursor";

/**
 * Execution modes supported by agents
 * Aligns with ExecutionMode from agent-execution-engine
 */
export type ExecutionMode = "structured" | "interactive" | "hybrid";

/**
 * Base configuration options that all agents should support
 * Aligns with BaseAgentConfig from agent-execution-engine
 */
export interface BaseAgentConfig {
  /** Path to the agent's CLI executable */
  executablePath?: string;
  /** Working directory for execution */
  workDir: string;
  /** Environment variables to pass to the process */
  env?: Record<string, string>;
  /** Maximum execution time in milliseconds */
  timeout?: number;
  /** Execution mode (if agent supports multiple modes) */
  mode?: ExecutionMode;
}

/**
 * Claude Code specific configuration
 */
export interface ClaudeCodeConfig extends BaseAgentConfig {
  /** Path to Claude Code CLI executable (default: 'claude') */
  claudePath?: string;
  /** Run in non-interactive print mode */
  print?: boolean;
  /** Output format (stream-json recommended for parsing) */
  outputFormat?: "stream-json" | "json" | "text";
  /** Enable verbose output (required for stream-json with print mode) */
  verbose?: boolean;
  /** Skip permission prompts */
  dangerouslySkipPermissions?: boolean;
  /** Permission mode setting */
  permissionMode?: string;
  /** Maximum idle time before cleanup (pool only) */
  idleTimeout?: number;
  /** Retry configuration for failed spawns */
  retry?: {
    maxAttempts: number;
    backoffMs: number;
  };
  /** Prompt to send to Claude Code */
  prompt?: string;
}

/**
 * OpenAI Codex specific configuration
 */
export interface CodexConfig extends BaseAgentConfig {
  /** OpenAI API key */
  apiKey?: string;
  /** Model to use (e.g., 'code-davinci-002') */
  model?: string;
  /** Temperature for generation (0-2) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Number of completions to generate */
  n?: number;
  /** Prompt to send to Codex */
  prompt?: string;
}

/**
 * GitHub Copilot specific configuration
 */
export interface CopilotConfig extends BaseAgentConfig {
  /** GitHub token for authentication */
  githubToken?: string;
  /** Model variant (if applicable) */
  modelVariant?: string;
  /** Prompt to send to Copilot */
  prompt?: string;
}

/**
 * Cursor specific configuration
 */
export interface CursorConfig extends BaseAgentConfig {
  /** Cursor-specific settings (TBD based on research) */
  settings?: Record<string, unknown>;
  /** Prompt to send to Cursor */
  prompt?: string;
}

/**
 * Discriminated union of all agent configurations
 */
export type AgentConfig =
  | ClaudeCodeConfig
  | CodexConfig
  | CopilotConfig
  | CursorConfig;
