/**
 * Worktree Layer - Public API
 *
 * Barrel export for the Worktree Layer of the execution system.
 * Exports all public types, interfaces, and implementations.
 *
 * @module execution/worktree
 */

// Core types
export type {
  WorktreeCreateParams,
  WorktreeInfo,
  WorktreeConfig,
} from './types.js';

export { WorktreeError, WorktreeErrorCode } from './types.js';

// Interface
export type { IWorktreeManager } from './manager.js';

// Implementation
export { WorktreeManager, DEFAULT_WORKTREE_CONFIG } from './manager.js';
