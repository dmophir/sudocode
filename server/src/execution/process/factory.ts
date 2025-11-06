/**
 * Process Manager Factory
 *
 * Creates the appropriate process manager based on execution mode.
 * Enables seamless switching between structured (stdio) and interactive (PTY) execution.
 *
 * @module execution/process/factory
 */

import type { IProcessManager } from './manager.js';
import type { ProcessConfig, ExecutionMode } from './types.js';
import { SimpleProcessManager } from './simple-manager.js';
import { PtyProcessManager } from './pty-manager.js';

/**
 * Create a process manager based on execution mode
 *
 * Factory function that selects the appropriate ProcessManager implementation
 * based on the requested execution mode:
 *
 * - **structured**: Uses SimpleProcessManager with stdio pipes for JSON output
 * - **interactive**: Uses PtyProcessManager for terminal interaction
 * - **hybrid**: Uses PtyProcessManager (can parse output in real-time)
 *
 * @param config - Process configuration with mode
 * @returns Appropriate process manager instance
 *
 * @example
 * ```typescript
 * // Structured mode (current behavior)
 * const manager = createProcessManager({
 *   executablePath: 'claude',
 *   args: ['--print', '--output-format', 'stream-json'],
 *   workDir: '/path/to/project',
 *   mode: 'structured',
 * });
 *
 * // Interactive mode (new)
 * const interactiveManager = createProcessManager({
 *   executablePath: 'claude',
 *   args: [],
 *   workDir: '/path/to/project',
 *   mode: 'interactive',
 *   terminal: { cols: 80, rows: 24 },
 * });
 *
 * // Hybrid mode (terminal + structured parsing)
 * const hybridManager = createProcessManager({
 *   executablePath: 'claude',
 *   args: ['--output-format', 'stream-json'],
 *   workDir: '/path/to/project',
 *   mode: 'hybrid',
 *   terminal: { cols: 80, rows: 24 },
 * });
 * ```
 */
export function createProcessManager(config: ProcessConfig): IProcessManager {
  const mode = config.mode || 'structured';

  switch (mode) {
    case 'interactive':
    case 'hybrid':
      // Use PTY for interactive and hybrid modes
      return new PtyProcessManager();

    case 'structured':
    default:
      // Use stdio pipes for structured mode
      return new SimpleProcessManager();
  }
}

/**
 * Create a process manager with explicit mode override
 *
 * Convenience function for cases where you want to override the config's mode.
 *
 * @param mode - Execution mode to use
 * @param config - Process configuration
 * @returns Appropriate process manager instance
 *
 * @example
 * ```typescript
 * const manager = createProcessManagerWithMode('interactive', config);
 * ```
 */
export function createProcessManagerWithMode(
  mode: ExecutionMode,
  config: ProcessConfig
): IProcessManager {
  return createProcessManager({ ...config, mode });
}
