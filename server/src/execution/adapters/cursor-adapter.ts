/**
 * Cursor Agent Adapter
 *
 * Implements the IAgentAdapter interface for Cursor CLI (cursor-agent).
 * Provides agent-specific configuration building and metadata.
 *
 * Based on agent-execution-engine implementation.
 */

import type {
  IAgentAdapter,
  AgentMetadata,
} from "agent-execution-engine/agents";
import type { ProcessConfig } from "agent-execution-engine/process";
import type { CursorConfig } from "@sudocode-ai/types/agents";
import { buildCursorConfig } from "./cursor-config-builder.js";

/**
 * Cursor agent metadata
 */
const CURSOR_METADATA: AgentMetadata = {
  name: "cursor",
  displayName: "Cursor",
  version: ">=1.0.0",
  supportedModes: ["structured"], // Uses JSONL stream protocol
  supportsStreaming: true,
  supportsStructuredOutput: true, // stream-json format
};

/**
 * Cursor Agent Adapter
 *
 * Provides Cursor-specific configuration building and capabilities.
 *
 * @example
 * ```typescript
 * const adapter = new CursorAdapter();
 * const config = adapter.buildProcessConfig({
 *   workDir: '/path/to/project',
 *   force: true,
 *   model: 'sonnet-4.5',
 * });
 *
 * const processManager = createProcessManager(config);
 * ```
 */
export class CursorAdapter implements IAgentAdapter<CursorConfig> {
  readonly metadata = CURSOR_METADATA;

  /**
   * Build ProcessConfig from Cursor-specific configuration
   *
   * @param config - Cursor configuration
   * @returns Generic ProcessConfig
   */
  buildProcessConfig(config: CursorConfig): ProcessConfig {
    return buildCursorConfig(config);
  }

  /**
   * Validate Cursor configuration
   *
   * @param config - Configuration to validate
   * @returns Array of validation errors (empty if valid)
   */
  validateConfig(config: CursorConfig): string[] {
    const errors: string[] = [];

    if (!config.workDir) {
      errors.push("workDir is required");
    }

    // Validate model if specified
    const validModels = [
      "auto",
      "sonnet-4.5",
      "sonnet-4.5-thinking",
      "gpt-5",
      "opus-4.1",
      "grok",
    ];
    if (config.model && !validModels.includes(config.model)) {
      // Allow custom model strings, just warn
      console.warn(
        `Unknown model specified: ${config.model}. Known models: ${validModels.join(", ")}`
      );
    }

    return errors;
  }

  /**
   * Get default Cursor configuration
   *
   * @returns Default configuration values
   */
  getDefaultConfig(): Partial<CursorConfig> {
    return {
      cursorPath: "cursor-agent",
      force: true, // Auto-approve for automation
      model: "auto", // Let Cursor choose best model
    };
  }
}
