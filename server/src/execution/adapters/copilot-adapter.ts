/**
 * GitHub Copilot Agent Adapter
 *
 * Adapter implementation for GitHub Copilot CLI integration.
 * Uses CopilotExecutor from agent-execution-engine for actual execution.
 *
 * @module execution/adapters/copilot
 */

import type { CopilotConfig } from '@sudocode-ai/types/agents';
import type {
  IAgentAdapter,
  AgentMetadata,
} from 'agent-execution-engine/agents';
import type { ProcessConfig } from 'agent-execution-engine/process';
import {
  buildCopilotProcessConfig,
  validateCopilotConfig,
} from './copilot-config-builder.js';

/**
 * GitHub Copilot Agent Adapter
 *
 * Implements the IAgentAdapter interface for GitHub Copilot CLI.
 * Copilot uses a plain text streaming protocol with session ID discovery
 * via log file polling. The CopilotExecutor from agent-execution-engine
 * handles output normalization to NormalizedEntry format.
 *
 * **Key Features:**
 * - Plain text output → NormalizedEntry conversion via PlainTextLogProcessor
 * - Session ID discovery through log directory polling
 * - Native MCP support
 * - Fine-grained tool permissions
 * - Multiple model support (GPT, Claude, etc.)
 *
 * @example
 * ```typescript
 * const adapter = new CopilotAdapter();
 * const config: CopilotConfig = {
 *   workDir: '/path/to/project',
 *   model: 'gpt-4o',
 *   allowAllTools: true,
 * };
 *
 * const processConfig = adapter.buildProcessConfig(config);
 * const errors = adapter.validateConfig(config);
 * if (errors.length === 0) {
 *   // Execute with CopilotExecutor
 * }
 * ```
 */
export class CopilotAdapter implements IAgentAdapter<CopilotConfig> {
  /**
   * Agent metadata
   */
  readonly metadata: AgentMetadata = {
    name: 'copilot',
    displayName: 'GitHub Copilot',
    version: '1.0.0',
    supportedModes: ['structured', 'interactive'],
    supportsStreaming: true,
    supportsStructuredOutput: true, // Via NormalizedEntry conversion
  };

  /**
   * Build ProcessConfig from CopilotConfig
   *
   * Constructs command and arguments for spawning the Copilot CLI process.
   *
   * @param config - Copilot-specific configuration
   * @returns ProcessConfig for process spawning
   */
  buildProcessConfig(config: CopilotConfig): ProcessConfig {
    return buildCopilotProcessConfig(config);
  }

  /**
   * Validate CopilotConfig
   *
   * Checks for required fields, conflicting options, and invalid values.
   *
   * @param config - Configuration to validate
   * @returns Array of validation error messages (empty if valid)
   */
  validateConfig(config: CopilotConfig): string[] {
    return validateCopilotConfig(config);
  }

  /**
   * Get default CopilotConfig
   *
   * Returns sensible defaults for Copilot execution.
   * Users should override workDir and other fields as needed.
   *
   * @returns Default configuration
   */
  getDefaultConfig(): Partial<CopilotConfig> {
    return {
      copilotPath: 'copilot',
      allowAllTools: true, // Auto-approve for automation
      model: undefined, // Use account default
    };
  }
}

/**
 * Singleton instance of CopilotAdapter
 */
export const copilotAdapter = new CopilotAdapter();
