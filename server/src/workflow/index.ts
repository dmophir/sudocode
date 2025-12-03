/**
 * Workflow System Module
 *
 * Provides multi-issue orchestration capabilities for sudocode.
 */

// Dependency analysis
export {
  analyzeDependencies,
  buildDependencyGraph,
  topologicalSort,
  findParallelGroups,
} from "./dependency-analyzer.js";

// Workflow engine interface and errors
export {
  type IWorkflowEngine,
  WorkflowCycleError,
  WorkflowNotFoundError,
  WorkflowStepNotFoundError,
  WorkflowStateError,
  DEFAULT_WORKFLOW_CONFIG,
} from "./workflow-engine.js";

// Workflow event emitter
export {
  WorkflowEventEmitter,
  type WorkflowEventPayload,
  type WorkflowEventListener,
  WorkflowEventType,
  // Event interfaces
  type StepStartedEvent,
  type StepCompletedEvent,
  type StepFailedEvent,
  type StepSkippedEvent,
  type WorkflowStartedEvent,
  type WorkflowPausedEvent,
  type WorkflowResumedEvent,
  type WorkflowCompletedEvent,
  type WorkflowFailedEvent,
  type WorkflowCancelledEvent,
  // Helper functions
  createStepStartedEvent,
  createStepCompletedEvent,
  createStepFailedEvent,
  createStepSkippedEvent,
  createWorkflowStartedEvent,
  createWorkflowPausedEvent,
  createWorkflowResumedEvent,
  createWorkflowCompletedEvent,
  createWorkflowFailedEvent,
  createWorkflowCancelledEvent,
} from "./workflow-event-emitter.js";

// Base workflow engine
export { BaseWorkflowEngine } from "./base-workflow-engine.js";
