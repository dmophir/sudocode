/**
 * Resilience Layer Exports
 *
 * Layer 3: Task Execution Layer - Resilience & Retry
 *
 * @module execution/resilience
 */

// Types
export type {
  RetryPolicy,
  CircuitState,
  CircuitBreaker,
  ExecutionAttempt,
  ResilientExecutionResult,
  RetryMetrics,
  RetryAttemptHandler,
  CircuitOpenHandler,
} from './types.js';

export { DEFAULT_RETRY_POLICY } from './types.js';

// Interface
export type { IResilientExecutor } from './executor.js';
