/**
 * Executor Factory
 *
 * Factory functions for creating the appropriate executor wrapper based on agent type.
 * Routes to AcpExecutorWrapper for ACP-native agents (claude-code, codex, gemini, opencode)
 * or AgentExecutorWrapper for legacy agents (copilot, cursor).
 *
 * @module execution/executors/executor-factory
 */

import type { AgentType, BaseAgentConfig } from "@sudocode-ai/types/agents";
import type Database from "better-sqlite3";
import type { ExecutionLifecycleService } from "../../services/execution-lifecycle.js";
import type { ExecutionLogsStore } from "../../services/execution-logs-store.js";
import type { TransportManager } from "../transport/transport-manager.js";
import {
  agentRegistryService,
  AgentNotImplementedError,
} from "../../services/agent-registry.js";
import {
  AgentExecutorWrapper,
  type AgentExecutorWrapperConfig,
} from "./agent-executor-wrapper.js";
import {
  AcpExecutorWrapper,
  type AcpExecutorWrapperConfig,
} from "./acp-executor-wrapper.js";
import type { NarrationConfig } from "../../services/narration-service.js";

/**
 * Error thrown when agent configuration validation fails
 */
export class AgentConfigValidationError extends Error {
  constructor(
    public agentType: string,
    public validationErrors: string[]
  ) {
    super(
      `Agent '${agentType}' configuration validation failed: ${validationErrors.join(", ")}`
    );
    this.name = "AgentConfigValidationError";
  }
}

/**
 * Common configuration for all executor wrappers
 */
export interface ExecutorFactoryConfig {
  workDir: string;
  lifecycleService: ExecutionLifecycleService;
  logsStore: ExecutionLogsStore;
  projectId: string;
  db: Database.Database;
  transportManager?: TransportManager;
  /** Voice narration configuration for this execution */
  narrationConfig?: Partial<NarrationConfig>;
}

/**
 * Union type of all possible executor wrapper types
 */
export type ExecutorWrapper = AgentExecutorWrapper<any> | AcpExecutorWrapper;

/**
 * Create an executor wrapper for the specified agent type
 *
 * Routes to specialized wrappers for certain agents (like Claude Code)
 * or creates a generic AgentExecutorWrapper for others.
 *
 * @param agentType - The type of agent to create an executor for
 * @param agentConfig - Agent-specific configuration
 * @param factoryConfig - Common configuration for all executors
 * @returns Appropriate executor wrapper instance
 * @throws {AgentNotFoundError} If agent type is not registered
 * @throws {AgentNotImplementedError} If agent is a stub
 * @throws {AgentConfigValidationError} If agent configuration is invalid
 *
 * @example
 * ```typescript
 * const executor = createExecutorForAgent(
 *   'claude-code',
 *   { workDir: '/tmp', print: true, outputFormat: 'stream-json' },
 *   {
 *     workDir: '/tmp',
 *     lifecycleService,
 *     logsStore,
 *     projectId: 'my-project',
 *     db,
 *     transportManager,
 *   }
 * );
 *
 * await executor.executeWithLifecycle(executionId, task, workDir);
 * ```
 */
export function createExecutorForAgent<TConfig extends BaseAgentConfig>(
  agentType: AgentType,
  agentConfig: TConfig,
  factoryConfig: ExecutorFactoryConfig
): ExecutorWrapper {
  console.log("[ExecutorFactory] Creating executor", {
    agentType,
    workDir: factoryConfig.workDir,
  });

  // Check if agent is ACP-native (registered in AgentFactory)
  if (AcpExecutorWrapper.isAcpSupported(agentType)) {
    console.log(`[ExecutorFactory] Using AcpExecutorWrapper for ${agentType}`);

    const acpConfig: AcpExecutorWrapperConfig = {
      agentType,
      acpConfig: {
        agentType,
        // Extract MCP servers from agent config if present
        mcpServers: (agentConfig as any).mcpServers,
        // Default to auto-approve, but respect config if set
        permissionMode: (agentConfig as any).dangerouslySkipPermissions
          ? "auto-approve"
          : "auto-approve", // TODO: Make configurable
        env: (agentConfig as any).env,
        mode: (agentConfig as any).mode,
      },
      lifecycleService: factoryConfig.lifecycleService,
      logsStore: factoryConfig.logsStore,
      projectId: factoryConfig.projectId,
      db: factoryConfig.db,
      transportManager: factoryConfig.transportManager,
    };

    return new AcpExecutorWrapper(acpConfig);
  }

  // Fall back to legacy AgentExecutorWrapper for non-ACP agents
  console.log(`[ExecutorFactory] Using AgentExecutorWrapper for ${agentType}`);

  // Get adapter from registry (will throw if not found)
  const adapter = agentRegistryService.getAdapter(agentType);

  // Merge adapter defaults with provided config
  // Filter undefined values so they don't override defaults
  const defaults = adapter.getDefaultConfig?.() || {};
  const filteredConfig = Object.fromEntries(
    Object.entries(agentConfig).filter(([_, v]) => v !== undefined)
  );
  const mergedConfig = {
    ...defaults,
    ...filteredConfig,
  } as TConfig;

  // Validate merged configuration
  if (adapter.validateConfig) {
    const validationErrors = adapter.validateConfig(mergedConfig);
    if (validationErrors.length > 0) {
      throw new AgentConfigValidationError(agentType, validationErrors);
    }
  }

  // Check if agent is implemented
  if (!agentRegistryService.isAgentImplemented(agentType)) {
    // This will throw AgentNotImplementedError when buildProcessConfig is called
    // But we want to throw it earlier for better error messages
    throw new AgentNotImplementedError(agentType);
  }

  const wrapperConfig: AgentExecutorWrapperConfig<any> = {
    adapter,
    agentConfig: mergedConfig,
    agentType,
    lifecycleService: factoryConfig.lifecycleService,
    logsStore: factoryConfig.logsStore,
    projectId: factoryConfig.projectId,
    db: factoryConfig.db,
    transportManager: factoryConfig.transportManager,
    narrationConfig: factoryConfig.narrationConfig,
  };

  return new AgentExecutorWrapper(wrapperConfig);
}

/**
 * Validate agent configuration without creating an executor
 *
 * Useful for pre-flight validation before execution creation.
 *
 * @param agentType - The type of agent to validate config for
 * @param agentConfig - Agent-specific configuration to validate
 * @returns Array of validation errors (empty if valid)
 * @throws {AgentNotFoundError} If agent type is not registered
 *
 * @example
 * ```typescript
 * const errors = validateAgentConfig('claude-code', {
 *   workDir: '/tmp',
 *   print: true,
 *   outputFormat: 'stream-json',
 * });
 *
 * if (errors.length > 0) {
 *   console.error('Invalid config:', errors);
 * }
 * ```
 */
export function validateAgentConfig<TConfig extends BaseAgentConfig>(
  agentType: AgentType,
  agentConfig: TConfig
): string[] {
  const adapter = agentRegistryService.getAdapter(agentType);

  if (!adapter.validateConfig) {
    return []; // No validation implemented for this agent
  }

  return adapter.validateConfig(agentConfig);
}

/**
 * Check if an agent type uses ACP (Agent Client Protocol)
 *
 * ACP-native agents use the new unified AcpExecutorWrapper which provides:
 * - Direct SessionUpdate streaming
 * - Unified agent lifecycle management
 * - Support for session resume and forking
 *
 * @param agentType - The type of agent to check
 * @returns true if the agent uses ACP, false for legacy agents
 *
 * @example
 * ```typescript
 * if (isAcpAgent('claude-code')) {
 *   // Agent uses ACP protocol
 * }
 * ```
 */
export function isAcpAgent(agentType: string): boolean {
  return AcpExecutorWrapper.isAcpSupported(agentType);
}

/**
 * List all available ACP-native agents
 *
 * @returns Array of agent type names that support ACP
 */
export function listAcpAgents(): string[] {
  return AcpExecutorWrapper.listAcpAgents();
}
