# Worktree Event Buffer System

## Problem Statement

When agents execute in isolated worktree environments, they make changes to issues and specs (via MCP tools) that modify the worktree's local database and JSONL files. However, these changes are invisible to the main repository's sudocode server and cannot be visualized in the frontend in real-time.

**Current Behavior:**
```
Main Repository                     Worktree
┌────────────────┐                 ┌────────────────┐
│ .sudocode/     │                 │ .sudocode/     │
│ ├─ cache.db    │                 │ ├─ cache.db    │  ← Agent modifies
│ ├─ issues.jsonl│                 │ ├─ issues.jsonl│  ← Agent writes here
│ └─ specs.jsonl │                 │ └─ specs.jsonl │  ← Agent writes here
│                │                 │                │
│ sudocode       │                 │ (no server)    │
│ server         │                 │                │
│ ↓              │                 │                │
│ Frontend       │  ✗ No visibility │                │
└────────────────┘                 └────────────────┘
```

**Problems:**
1. **No real-time feedback**: User cannot see agent progress while execution is running
2. **No provisional state**: Changes remain hidden until worktree is merged back
3. **Lost context**: If execution fails, user has no visibility into partial work completed
4. **No audit trail**: Cannot track what the agent changed during execution

**Constraints:**
- Worktrees do NOT run their own sudocode servers (lightweight, isolated environments)
- Main repository server has filesystem access to all worktree directories
- Changes in worktrees should NOT pollute main repository state until reviewed and accepted
- Must support multiple concurrent worktree executions without interference

## Architecture Overview

### Desired Behavior

```
Main Repository                          Worktree (Execution: abc-123)
┌──────────────────────────────────┐    ┌────────────────────────────┐
│ .sudocode/                       │    │ .sudocode/                 │
│ ├─ cache.db                      │    │ ├─ cache.db                │
│ ├─ issues.jsonl                  │    │ ├─ issues.jsonl  ← MODIFIED│
│ └─ specs.jsonl                   │    │ └─ specs.jsonl   ← MODIFIED│
│                                  │    │                            │
│ sudocode server                  │    │ MCP Tools (no server)      │
│ ├─ Worktree File Watcher ────────┼────┼──> Monitors JSONL files   │
│ │   (chokidar)                   │    │    Detects changes         │
│ │                                │    │                            │
│ │  Detects change event          │    │                            │
│ │         ↓                      │    │                            │
│ ├─ Worktree Mutation Tracker    │    └────────────────────────────┘
│ │   - Parses JSONL diffs         │
│ │   - Extracts mutation events   │
│ │   - Stores in event buffer     │
│ │         ↓                      │
│ ├─ Worktree Event Buffer         │
│ │   - In-memory event store      │
│ │   - Keyed by execution ID      │
│ │   - Sequence numbered          │
│ │         ↓                      │
│ ├─ Provisional State Manager     │
│ │   - Applies events on top of   │
│ │     main state (non-destructive)│
│ │   - Computes merged view       │
│ │         ↓                      │
│ ├─ WebSocket Broadcaster         │
│ │   - Broadcasts provisional     │
│ │     updates to frontend        │
│ │         ↓                      │
│ └─ REST API                      │
│     - Get provisional issues     │
│     - Get provisional specs      │
│     - Get execution mutations    │
│                                  │
└──────────────────────────────────┘
```

### Key Design Decisions

1. **File Watcher Approach**: Main server watches worktree JSONL files instead of MCP interception
   - **Why**: Worktrees don't run servers, file watching is simpler and more reliable
   - **Trade-off**: Slightly higher latency (~1-2s debounced) vs. immediate MCP hooks

2. **JSONL Diff-Based Event Reconstruction**: Parse JSONL file changes to extract mutation events
   - **Why**: JSONL is already the source of truth, diffing is straightforward
   - **Trade-off**: Cannot capture exact timestamp of each change, only when file is written

3. **In-Memory Event Buffer**: Store events in memory, not persisted to database
   - **Why**: Events are temporary (only during execution), no need for durable storage
   - **Trade-off**: Events lost on server restart, acceptable for short-lived executions

4. **Provisional State Pattern**: Apply events as patches on top of main state
   - **Why**: Don't pollute main database, changes are clearly marked as "provisional"
   - **Trade-off**: More complex query logic to merge main + provisional state

## Data Structures

### Worktree Mutation Event

```typescript
/**
 * Represents a single mutation that occurred in a worktree
 */
export interface WorktreeMutationEvent {
  /** Unique event ID (UUID) */
  id: string;

  /** Execution ID this mutation belongs to */
  executionId: string;

  /** Sequence number within this execution (for ordering) */
  sequenceNumber: number;

  /** Type of mutation */
  type: 'issue_created' | 'issue_updated' | 'issue_deleted'
      | 'spec_created' | 'spec_updated' | 'spec_deleted'
      | 'relationship_created' | 'relationship_deleted'
      | 'tag_added' | 'tag_removed';

  /** Entity type being mutated */
  entityType: 'issue' | 'spec';

  /** Entity ID being mutated */
  entityId: string;

  /** Previous state (null for creates) */
  oldValue: Issue | Spec | null;

  /** New state (null for deletes) */
  newValue: Issue | Spec | null;

  /** Delta/patch (for updates, optional optimization) */
  delta?: Partial<Issue | Spec>;

  /** When this mutation was detected (server time) */
  detectedAt: number;

  /** Source of the mutation (extracted from JSONL or inferred) */
  source: 'jsonl_diff' | 'direct_observation';

  /** Optional metadata */
  metadata?: {
    /** Actor who made the change (extracted from updated_by field) */
    actor?: string;

    /** Worktree-local timestamp (from entity's updated_at) */
    updatedAt?: string;

    /** Whether this was an initial state snapshot */
    isSnapshot?: boolean;
  };
}
```

### Worktree Event Buffer

```typescript
/**
 * In-memory buffer for storing worktree mutation events
 * Similar to existing EventBuffer (event-buffer.ts) but for worktree mutations
 */
export interface WorktreeEventBuffer {
  /** Execution ID */
  executionId: string;

  /** All mutation events in sequence order */
  events: WorktreeMutationEvent[];

  /** Next sequence number to assign */
  nextSequence: number;

  /** When the buffer was created */
  createdAt: number;

  /** When the buffer was last updated */
  lastUpdatedAt: number;

  /** Initial snapshot of worktree state (captured at execution start) */
  initialSnapshot: {
    issues: Record<string, Issue>;
    specs: Record<string, Spec>;
  };
}
```

### Provisional State

```typescript
/**
 * Represents the merged view of main state + worktree mutations
 */
export interface ProvisionalState {
  /** Base state from main repository */
  base: {
    issues: Issue[];
    specs: Spec[];
  };

  /** Overlay of worktree mutations */
  provisional: {
    /** Issues created in worktree */
    issuesCreated: Issue[];

    /** Issues updated in worktree (patches) */
    issuesUpdated: Array<{
      id: string;
      baseIssue: Issue;
      updatedIssue: Issue;
      delta: Partial<Issue>;
    }>;

    /** Issue IDs deleted in worktree */
    issuesDeleted: string[];

    /** Specs created in worktree */
    specsCreated: Spec[];

    /** Specs updated in worktree (patches) */
    specsUpdated: Array<{
      id: string;
      baseSpec: Spec;
      updatedSpec: Spec;
      delta: Partial<Spec>;
    }>;

    /** Spec IDs deleted in worktree */
    specsDeleted: string[];
  };

  /** Execution metadata */
  execution: {
    id: string;
    issueId: string;
    status: 'running' | 'completed' | 'failed' | 'stopped';
    startedAt: string;
    updatedAt: string;
  };

  /** When this provisional state was computed */
  computedAt: number;
}
```

## Core Components

### 1. Worktree File Watcher

**Location**: `server/src/execution/worktree/file-watcher.ts`

**Purpose**: Monitor JSONL files in active worktrees and emit change events

```typescript
export class WorktreeFileWatcher {
  private watchers: Map<string, FSWatcher> = new Map();
  private eventEmitter: EventEmitter;

  /**
   * Start watching a worktree's JSONL files
   *
   * @param executionId - Execution ID
   * @param worktreePath - Path to worktree directory
   */
  watchWorktree(executionId: string, worktreePath: string): void {
    const sudocodePath = path.join(worktreePath, '.sudocode');

    const watcher = chokidar.watch(
      [
        path.join(sudocodePath, 'issues.jsonl'),
        path.join(sudocodePath, 'specs.jsonl'),
      ],
      {
        persistent: true,
        ignoreInitial: false, // Capture initial snapshot
        awaitWriteFinish: {
          stabilityThreshold: 500, // Wait 500ms after write
          pollInterval: 100,
        },
      }
    );

    watcher.on('add', (filePath) => {
      this.handleFileChange(executionId, filePath, 'initial');
    });

    watcher.on('change', (filePath) => {
      this.handleFileChange(executionId, filePath, 'change');
    });

    this.watchers.set(executionId, watcher);
  }

  /**
   * Stop watching a worktree
   */
  async unwatchWorktree(executionId: string): Promise<void> {
    const watcher = this.watchers.get(executionId);
    if (watcher) {
      await watcher.close();
      this.watchers.delete(executionId);
    }
  }

  private handleFileChange(
    executionId: string,
    filePath: string,
    eventType: 'initial' | 'change'
  ): void {
    // Emit event for mutation tracker to process
    this.eventEmitter.emit('worktree-file-changed', {
      executionId,
      filePath,
      eventType,
      timestamp: Date.now(),
    });
  }
}
```

**Configuration:**
- **Debouncing**: Use `awaitWriteFinish` to avoid processing partial writes
- **Initial capture**: Set `ignoreInitial: false` to capture starting state
- **File types**: Only watch `issues.jsonl` and `specs.jsonl` (not markdown files)

### 2. JSONL Diff Parser

**Location**: `server/src/execution/worktree/jsonl-diff-parser.ts`

**Purpose**: Parse JSONL file changes and extract mutation events

```typescript
export class JSONLDiffParser {
  /**
   * Parse a JSONL file and extract entities
   */
  parseJSONL(filePath: string): Map<string, Issue | Spec> {
    const entities = new Map<string, Issue | Spec>();
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.trim());

    for (const line of lines) {
      try {
        const entity = JSON.parse(line);
        entities.set(entity.id, entity);
      } catch (error) {
        console.error(`Failed to parse JSONL line: ${line}`, error);
      }
    }

    return entities;
  }

  /**
   * Compute diff between two JSONL snapshots
   *
   * @returns Array of mutation events
   */
  computeDiff(
    entityType: 'issue' | 'spec',
    oldEntities: Map<string, Issue | Spec>,
    newEntities: Map<string, Issue | Spec>
  ): Array<Omit<WorktreeMutationEvent, 'id' | 'executionId' | 'sequenceNumber' | 'detectedAt'>> {
    const events: Array<any> = [];

    // Detect creates and updates
    for (const [id, newEntity] of newEntities) {
      const oldEntity = oldEntities.get(id);

      if (!oldEntity) {
        // Created
        events.push({
          type: `${entityType}_created`,
          entityType,
          entityId: id,
          oldValue: null,
          newValue: newEntity,
          delta: null,
          source: 'jsonl_diff',
          metadata: {
            actor: newEntity.updated_by || newEntity.created_by,
            updatedAt: newEntity.updated_at,
          },
        });
      } else if (!isEqual(oldEntity, newEntity)) {
        // Updated
        const delta = computeDelta(oldEntity, newEntity);
        events.push({
          type: `${entityType}_updated`,
          entityType,
          entityId: id,
          oldValue: oldEntity,
          newValue: newEntity,
          delta,
          source: 'jsonl_diff',
          metadata: {
            actor: newEntity.updated_by,
            updatedAt: newEntity.updated_at,
          },
        });
      }
    }

    // Detect deletes
    for (const [id, oldEntity] of oldEntities) {
      if (!newEntities.has(id)) {
        events.push({
          type: `${entityType}_deleted`,
          entityType,
          entityId: id,
          oldValue: oldEntity,
          newValue: null,
          delta: null,
          source: 'jsonl_diff',
        });
      }
    }

    return events;
  }
}

/**
 * Compute delta/patch between two entities
 */
function computeDelta<T extends Record<string, any>>(
  oldEntity: T,
  newEntity: T
): Partial<T> {
  const delta: Partial<T> = {};

  for (const key in newEntity) {
    if (!isEqual(oldEntity[key], newEntity[key])) {
      delta[key] = newEntity[key];
    }
  }

  return delta;
}

/**
 * Deep equality check
 */
function isEqual(a: any, b: any): boolean {
  // Use fast-deep-equal or lodash.isEqual
  return JSON.stringify(a) === JSON.stringify(b); // Simple version
}
```

### 3. Worktree Mutation Tracker

**Location**: `server/src/execution/worktree/mutation-tracker.ts`

**Purpose**: Coordinate between file watcher and event buffer

```typescript
export class WorktreeMutationTracker {
  private fileWatcher: WorktreeFileWatcher;
  private diffParser: JSONLDiffParser;
  private eventBuffer: WorktreeMutationEventBuffer;

  // Track previous state for diffing
  private previousSnapshots: Map<string, {
    issues: Map<string, Issue>;
    specs: Map<string, Spec>;
  }> = new Map();

  constructor(
    fileWatcher: WorktreeFileWatcher,
    diffParser: JSONLDiffParser,
    eventBuffer: WorktreeMutationEventBuffer
  ) {
    this.fileWatcher = fileWatcher;
    this.diffParser = diffParser;
    this.eventBuffer = eventBuffer;

    // Subscribe to file change events
    this.fileWatcher.on('worktree-file-changed', this.handleFileChanged.bind(this));
  }

  /**
   * Start tracking mutations for an execution
   */
  startTracking(executionId: string, worktreePath: string): void {
    this.fileWatcher.watchWorktree(executionId, worktreePath);
  }

  /**
   * Stop tracking mutations for an execution
   */
  async stopTracking(executionId: string): Promise<void> {
    await this.fileWatcher.unwatchWorktree(executionId);
    this.previousSnapshots.delete(executionId);
  }

  /**
   * Handle file change event
   */
  private handleFileChanged(event: {
    executionId: string;
    filePath: string;
    eventType: 'initial' | 'change';
    timestamp: number;
  }): void {
    const { executionId, filePath, eventType, timestamp } = event;

    // Determine entity type from file path
    const entityType = filePath.includes('issues.jsonl') ? 'issue' : 'spec';

    // Parse current JSONL file
    const newEntities = this.diffParser.parseJSONL(filePath);

    // Get previous snapshot
    const snapshot = this.previousSnapshots.get(executionId) || { issues: new Map(), specs: new Map() };
    const oldEntities = entityType === 'issue' ? snapshot.issues : snapshot.specs;

    // Compute diff
    const mutationEvents = this.diffParser.computeDiff(entityType, oldEntities, newEntities);

    // Add events to buffer
    for (const event of mutationEvents) {
      this.eventBuffer.addEvent(executionId, {
        ...event,
        id: randomUUID(),
        executionId,
        sequenceNumber: -1, // Buffer will assign sequence
        detectedAt: timestamp,
      } as WorktreeMutationEvent);
    }

    // Update snapshot for next diff
    if (entityType === 'issue') {
      snapshot.issues = newEntities as Map<string, Issue>;
    } else {
      snapshot.specs = newEntities as Map<string, Spec>;
    }
    this.previousSnapshots.set(executionId, snapshot);

    // Capture initial snapshot in buffer
    if (eventType === 'initial') {
      this.eventBuffer.captureInitialSnapshot(executionId, {
        issues: entityType === 'issue' ? Object.fromEntries(newEntities) : {},
        specs: entityType === 'spec' ? Object.fromEntries(newEntities) : {},
      });
    }
  }
}
```

### 4. Worktree Mutation Event Buffer

**Location**: `server/src/execution/worktree/mutation-event-buffer.ts`

**Purpose**: In-memory storage for worktree mutation events (similar to existing `event-buffer.ts`)

```typescript
export class WorktreeMutationEventBuffer {
  private buffers = new Map<string, WorktreeEventBuffer>();
  private readonly MAX_EVENTS_PER_EXECUTION = 10000;
  private readonly RETENTION_MS = 1000 * 60 * 60 * 2; // 2 hours

  /**
   * Add a mutation event to the buffer
   */
  addEvent(executionId: string, event: Omit<WorktreeMutationEvent, 'sequenceNumber'>): void {
    let buffer = this.buffers.get(executionId);

    if (!buffer) {
      buffer = {
        executionId,
        events: [],
        nextSequence: 0,
        createdAt: Date.now(),
        lastUpdatedAt: Date.now(),
        initialSnapshot: { issues: {}, specs: {} },
      };
      this.buffers.set(executionId, buffer);
    }

    // Add event with sequence number
    const sequencedEvent: WorktreeMutationEvent = {
      ...event,
      sequenceNumber: buffer.nextSequence++,
    };

    buffer.events.push(sequencedEvent);
    buffer.lastUpdatedAt = Date.now();

    // Enforce max events limit (ring buffer behavior)
    if (buffer.events.length > this.MAX_EVENTS_PER_EXECUTION) {
      const toRemove = Math.floor(this.MAX_EVENTS_PER_EXECUTION * 0.1);
      buffer.events.splice(0, toRemove);
      console.warn(
        `[WorktreeMutationEventBuffer] Buffer size limit reached for ${executionId}, removed ${toRemove} events`
      );
    }
  }

  /**
   * Get all events for an execution
   */
  getEvents(executionId: string, fromSequence?: number): WorktreeMutationEvent[] {
    const buffer = this.buffers.get(executionId);
    if (!buffer) return [];

    if (fromSequence !== undefined) {
      return buffer.events.filter(e => e.sequenceNumber >= fromSequence);
    }

    return [...buffer.events];
  }

  /**
   * Capture initial snapshot of worktree state
   */
  captureInitialSnapshot(
    executionId: string,
    snapshot: { issues: Record<string, Issue>; specs: Record<string, Spec> }
  ): void {
    const buffer = this.buffers.get(executionId);
    if (buffer) {
      buffer.initialSnapshot = snapshot;
    }
  }

  /**
   * Get initial snapshot
   */
  getInitialSnapshot(executionId: string): { issues: Record<string, Issue>; specs: Record<string, Spec> } | null {
    const buffer = this.buffers.get(executionId);
    return buffer ? buffer.initialSnapshot : null;
  }

  /**
   * Remove buffer for an execution
   */
  removeBuffer(executionId: string): boolean {
    return this.buffers.delete(executionId);
  }

  /**
   * Prune stale buffers
   */
  pruneStale(): number {
    const now = Date.now();
    const threshold = now - this.RETENTION_MS;
    let pruned = 0;

    for (const [executionId, buffer] of this.buffers.entries()) {
      if (buffer.lastUpdatedAt < threshold) {
        this.buffers.delete(executionId);
        pruned++;
      }
    }

    return pruned;
  }

  /**
   * Get statistics
   */
  getStats(): {
    bufferCount: number;
    totalEvents: number;
    avgEventsPerBuffer: number;
  } {
    const bufferCount = this.buffers.size;
    let totalEvents = 0;

    for (const buffer of this.buffers.values()) {
      totalEvents += buffer.events.length;
    }

    return {
      bufferCount,
      totalEvents,
      avgEventsPerBuffer: bufferCount > 0 ? totalEvents / bufferCount : 0,
    };
  }
}
```

### 5. Provisional State Manager

**Location**: `server/src/execution/worktree/provisional-state-manager.ts`

**Purpose**: Apply mutation events on top of main repository state (non-destructive)

```typescript
export class ProvisionalStateManager {
  private db: Database.Database;
  private eventBuffer: WorktreeMutationEventBuffer;

  /**
   * Compute provisional state for an execution
   *
   * Applies worktree mutations on top of main repository state
   * without modifying the main database.
   */
  computeProvisionalState(executionId: string): ProvisionalState {
    // Get base state from main repository
    const baseIssues = getAllIssues(this.db);
    const baseSpecs = getAllSpecs(this.db);

    // Get mutation events from buffer
    const events = this.eventBuffer.getEvents(executionId);

    // Apply events to compute provisional state
    const provisional = this.applyEvents(
      { issues: baseIssues, specs: baseSpecs },
      events
    );

    return {
      base: { issues: baseIssues, specs: baseSpecs },
      provisional,
      execution: this.getExecutionMetadata(executionId),
      computedAt: Date.now(),
    };
  }

  /**
   * Apply mutation events to compute provisional overlays
   */
  private applyEvents(
    base: { issues: Issue[]; specs: Spec[] },
    events: WorktreeMutationEvent[]
  ) {
    const issuesCreated: Issue[] = [];
    const issuesUpdated: Array<any> = [];
    const issuesDeleted: string[] = [];
    const specsCreated: Spec[] = [];
    const specsUpdated: Array<any> = [];
    const specsDeleted: string[] = [];

    // Build maps for efficient lookup
    const baseIssuesMap = new Map(base.issues.map(i => [i.id, i]));
    const baseSpecsMap = new Map(base.specs.map(s => [s.id, s]));

    // Apply events in sequence order
    for (const event of events) {
      if (event.entityType === 'issue') {
        const baseIssue = baseIssuesMap.get(event.entityId);

        switch (event.type) {
          case 'issue_created':
            issuesCreated.push(event.newValue as Issue);
            break;

          case 'issue_updated':
            if (baseIssue) {
              issuesUpdated.push({
                id: event.entityId,
                baseIssue,
                updatedIssue: event.newValue as Issue,
                delta: event.delta || {},
              });
            }
            break;

          case 'issue_deleted':
            issuesDeleted.push(event.entityId);
            break;
        }
      } else if (event.entityType === 'spec') {
        const baseSpec = baseSpecsMap.get(event.entityId);

        switch (event.type) {
          case 'spec_created':
            specsCreated.push(event.newValue as Spec);
            break;

          case 'spec_updated':
            if (baseSpec) {
              specsUpdated.push({
                id: event.entityId,
                baseSpec,
                updatedSpec: event.newValue as Spec,
                delta: event.delta || {},
              });
            }
            break;

          case 'spec_deleted':
            specsDeleted.push(event.entityId);
            break;
        }
      }
    }

    return {
      issuesCreated,
      issuesUpdated,
      issuesDeleted,
      specsCreated,
      specsUpdated,
      specsDeleted,
    };
  }

  /**
   * Get merged view of issues (base + provisional)
   */
  getMergedIssues(executionId: string): Issue[] {
    const provisionalState = this.computeProvisionalState(executionId);

    // Start with base issues
    const merged = [...provisionalState.base.issues];

    // Apply updates
    for (const update of provisionalState.provisional.issuesUpdated) {
      const index = merged.findIndex(i => i.id === update.id);
      if (index >= 0) {
        merged[index] = update.updatedIssue;
      }
    }

    // Add created issues
    merged.push(...provisionalState.provisional.issuesCreated);

    // Remove deleted issues
    return merged.filter(i => !provisionalState.provisional.issuesDeleted.includes(i.id));
  }

  /**
   * Get merged view of specs (base + provisional)
   */
  getMergedSpecs(executionId: string): Spec[] {
    const provisionalState = this.computeProvisionalState(executionId);

    // Start with base specs
    const merged = [...provisionalState.base.specs];

    // Apply updates
    for (const update of provisionalState.provisional.specsUpdated) {
      const index = merged.findIndex(s => s.id === update.id);
      if (index >= 0) {
        merged[index] = update.updatedSpec;
      }
    }

    // Add created specs
    merged.push(...provisionalState.provisional.specsCreated);

    // Remove deleted specs
    return merged.filter(s => !provisionalState.provisional.specsDeleted.includes(s.id));
  }

  private getExecutionMetadata(executionId: string) {
    const execution = getExecution(this.db, executionId);
    return {
      id: execution.id,
      issueId: execution.issue_id,
      status: execution.status,
      startedAt: execution.started_at,
      updatedAt: execution.updated_at,
    };
  }
}
```

## Integration with Execution Lifecycle

### Execution Start

```typescript
// server/src/services/execution-lifecycle.ts

async createExecutionWithWorktree(params: CreateExecutionWithWorktreeParams) {
  // ... existing worktree creation logic ...

  // Start tracking worktree mutations
  const mutationTracker = getMutationTracker(); // Singleton
  mutationTracker.startTracking(executionId, worktreePath);

  return { execution, worktreePath, branchName };
}
```

### Execution Completion

```typescript
// server/src/services/execution-lifecycle.ts

async cleanupExecution(executionId: string): Promise<void> {
  // Stop tracking mutations
  const mutationTracker = getMutationTracker();
  await mutationTracker.stopTracking(executionId);

  // Optionally: keep event buffer for review
  // Or: remove buffer immediately
  // const eventBuffer = getEventBuffer();
  // eventBuffer.removeBuffer(executionId);

  // ... existing cleanup logic ...
}
```

## REST API Endpoints

### GET /api/executions/:executionId/provisional-state

Get the provisional state for an execution (base + worktree mutations)

```typescript
router.get('/api/executions/:executionId/provisional-state', (req, res) => {
  const { executionId } = req.params;

  const provisionalStateManager = getProvisionalStateManager();
  const state = provisionalStateManager.computeProvisionalState(executionId);

  res.json({
    success: true,
    data: state,
  });
});
```

### GET /api/executions/:executionId/mutations

Get raw mutation events for an execution

```typescript
router.get('/api/executions/:executionId/mutations', (req, res) => {
  const { executionId } = req.params;
  const { fromSequence } = req.query;

  const eventBuffer = getEventBuffer();
  const events = eventBuffer.getEvents(
    executionId,
    fromSequence ? parseInt(fromSequence as string) : undefined
  );

  res.json({
    success: true,
    data: {
      executionId,
      events,
      totalEvents: events.length,
    },
  });
});
```

### GET /api/executions/:executionId/merged-issues

Get merged view of issues (base + provisional)

```typescript
router.get('/api/executions/:executionId/merged-issues', (req, res) => {
  const { executionId } = req.params;

  const provisionalStateManager = getProvisionalStateManager();
  const issues = provisionalStateManager.getMergedIssues(executionId);

  res.json({
    success: true,
    data: issues,
  });
});
```

### GET /api/executions/:executionId/merged-specs

Get merged view of specs (base + provisional)

```typescript
router.get('/api/executions/:executionId/merged-specs', (req, res) => {
  const { executionId } = req.params;

  const provisionalStateManager = getProvisionalStateManager();
  const specs = provisionalStateManager.getMergedSpecs(executionId);

  res.json({
    success: true,
    data: specs,
  });
});
```

## WebSocket Integration

### Broadcast Provisional Updates

```typescript
// server/src/services/worktree-websocket-broadcaster.ts

export class WorktreeWebSocketBroadcaster {
  private websocketManager: WebSocketManager;
  private eventBuffer: WorktreeMutationEventBuffer;

  constructor(websocketManager: WebSocketManager, eventBuffer: WorktreeMutationEventBuffer) {
    this.websocketManager = websocketManager;
    this.eventBuffer = eventBuffer;

    // Subscribe to event buffer additions
    this.eventBuffer.on('event-added', this.handleEventAdded.bind(this));
  }

  private handleEventAdded(event: WorktreeMutationEvent): void {
    // Broadcast to all clients subscribed to this execution
    const message = {
      type: 'worktree_mutation' as const,
      data: {
        executionId: event.executionId,
        mutationType: event.type,
        entityType: event.entityType,
        entityId: event.entityId,
        sequenceNumber: event.sequenceNumber,
        provisional: true, // Mark as provisional
        event,
      },
    };

    // Use execution-specific subscription
    this.websocketManager.broadcast(
      'execution',
      event.executionId,
      message
    );
  }
}
```

### Update WebSocket Message Types

```typescript
// server/src/services/websocket.ts

export interface ServerMessage {
  type:
    | "issue_created"
    | "issue_updated"
    | "issue_deleted"
    | "spec_created"
    | "spec_updated"
    | "spec_deleted"
    | "worktree_mutation"  // NEW: Provisional mutation from worktree
    | "pong"
    | "error"
    | "subscribed"
    | "unsubscribed";
  data?: any;
  message?: string;
  subscription?: string;
}
```

## Library Considerations

### Event Sourcing Libraries

Based on research, existing libraries like **wolkenkit**, **reSolve**, and **evtstore** are heavyweight frameworks designed for full-stack CQRS/Event Sourcing architectures. They would be overkill for our use case.

**Recommendation**: Implement a lightweight custom solution similar to the existing `EventBuffer` class, tailored to our specific needs:

- Simple in-memory storage (no persistent event store needed)
- Sequence-based ordering
- File watcher integration (not network-based)
- Direct integration with existing sudocode architecture

### File Watching Library

**Recommendation**: Use **chokidar** (already widely used in Node.js ecosystem)

```bash
npm install chokidar @types/chokidar
```

**Why chokidar**:
- Battle-tested, widely used (webpack, vite, etc.)
- Cross-platform (macOS, Linux, Windows)
- Efficient (uses native fs.watch when available)
- Debouncing support via `awaitWriteFinish`
- Good TypeScript support

### Diff/Patch Library

For computing deltas between entities, we can use:

**Option 1**: Simple JSON comparison (recommended for MVP)
```typescript
// Custom implementation (shown above in JSONLDiffParser)
function computeDelta<T>(old: T, new: T): Partial<T>
```

**Option 2**: **fast-json-patch** (RFC 6902 JSON Patch)
```bash
npm install fast-json-patch
```
```typescript
import { compare } from 'fast-json-patch';

const delta = compare(oldIssue, newIssue);
// Returns: [{ op: 'replace', path: '/status', value: 'closed' }, ...]
```

**Recommendation**: Start with simple custom diff (Option 1), consider `fast-json-patch` later if we need standardized patch format.

## Implementation Phases

### Phase 1: Core Event Buffer (Week 1)

**Goal**: Basic infrastructure for capturing and storing worktree mutations

- [ ] Implement `WorktreeMutationEvent` types
- [ ] Implement `WorktreeMutationEventBuffer` class
- [ ] Add unit tests for event buffer operations
- [ ] Implement `JSONLDiffParser` for JSONL diffing
- [ ] Add unit tests for diff computation

**Deliverables**:
- `server/src/execution/worktree/types.ts` - Type definitions
- `server/src/execution/worktree/mutation-event-buffer.ts` - Event buffer
- `server/src/execution/worktree/jsonl-diff-parser.ts` - Diff parser
- `server/tests/unit/execution/worktree/mutation-event-buffer.test.ts`
- `server/tests/unit/execution/worktree/jsonl-diff-parser.test.ts`

### Phase 2: File Watcher Integration (Week 2)

**Goal**: Detect JSONL changes in worktrees and emit events

- [ ] Install and configure chokidar
- [ ] Implement `WorktreeFileWatcher` class
- [ ] Implement `WorktreeMutationTracker` to coordinate watcher + diff parser
- [ ] Add unit tests with mocked file system
- [ ] Add integration tests with real worktree

**Deliverables**:
- `server/src/execution/worktree/file-watcher.ts` - File watcher
- `server/src/execution/worktree/mutation-tracker.ts` - Mutation tracker
- `server/tests/unit/execution/worktree/file-watcher.test.ts`
- `server/tests/integration/execution/worktree-mutation-tracking.test.ts`

### Phase 3: Provisional State Manager (Week 3)

**Goal**: Apply mutation events on top of main state (non-destructive)

- [ ] Implement `ProvisionalStateManager` class
- [ ] Add methods for computing provisional state
- [ ] Add methods for merged views (base + provisional)
- [ ] Add unit tests for state application logic
- [ ] Add integration tests with real database

**Deliverables**:
- `server/src/execution/worktree/provisional-state-manager.ts`
- `server/tests/unit/execution/worktree/provisional-state-manager.test.ts`
- `server/tests/integration/execution/provisional-state-integration.test.ts`

### Phase 4: REST API & Lifecycle Integration (Week 4)

**Goal**: Expose provisional state via REST API, integrate with execution lifecycle

- [ ] Add REST endpoints for provisional state queries
- [ ] Integrate with `ExecutionLifecycleService` (start/stop tracking)
- [ ] Add API tests
- [ ] Update execution routes to include provisional state links
- [ ] Add documentation for new endpoints

**Deliverables**:
- `server/src/routes/provisional-state.ts` - New routes
- Updated `server/src/services/execution-lifecycle.ts`
- `server/tests/integration/routes/provisional-state.test.ts`
- API documentation updates

### Phase 5: WebSocket Broadcasting (Week 5)

**Goal**: Real-time updates via WebSocket for provisional mutations

- [ ] Implement `WorktreeWebSocketBroadcaster` class
- [ ] Extend WebSocket message types
- [ ] Add subscription support for execution-specific updates
- [ ] Add integration tests for WebSocket broadcasting
- [ ] Test with multiple concurrent executions

**Deliverables**:
- `server/src/execution/worktree/websocket-broadcaster.ts`
- Updated `server/src/services/websocket.ts` (message types)
- `server/tests/integration/execution/worktree-websocket.test.ts`

### Phase 6: Cleanup & Optimization (Week 6)

**Goal**: Robustness, performance, and documentation

- [ ] Add buffer pruning (stale execution cleanup)
- [ ] Add metrics and monitoring (buffer size, event counts)
- [ ] Performance testing (1000+ events, multiple executions)
- [ ] Memory profiling (check for leaks)
- [ ] Add operational documentation
- [ ] Add troubleshooting guide

**Deliverables**:
- Performance benchmarks
- Monitoring dashboard (optional)
- Documentation updates
- Deployment guide

## Trade-offs and Alternatives

### File Watcher vs. MCP Interception

| Approach | Pros | Cons |
|----------|------|------|
| **File Watcher** (chosen) | - No changes to MCP tools<br>- Works even if MCP bypasses normal paths<br>- Simpler implementation<br>- Worktrees don't need servers | - Slightly higher latency (~1-2s debounced)<br>- Cannot capture exact mutation timestamp<br>- File I/O overhead |
| **MCP Interception** | - Immediate event capture<br>- Exact timestamps<br>- Can capture more metadata (e.g., actor) | - Requires modifying all MCP tools<br>- Tight coupling with MCP implementation<br>- Needs network communication from MCP → server<br>- More complex to maintain |

**Decision**: File watcher is simpler, more reliable, and doesn't require worktrees to run servers.

### In-Memory Buffer vs. Persistent Storage

| Approach | Pros | Cons |
|----------|------|------|
| **In-Memory Buffer** (chosen) | - Fast reads/writes<br>- Simple implementation<br>- No disk I/O overhead<br>- Events are temporary anyway | - Lost on server restart<br>- Memory limits (10k events per execution) |
| **Persistent Storage** (SQLite) | - Survives server restarts<br>- No memory limits<br>- Can query with SQL | - Slower (disk I/O)<br>- Adds complexity<br>- Cleanup more complex<br>- Overkill for temporary events |

**Decision**: In-memory buffer is sufficient since executions are typically short-lived (<1 hour). If server restarts, executions are terminated anyway.

### JSONL Diff vs. Database Triggers

| Approach | Pros | Cons |
|----------|------|------|
| **JSONL Diff** (chosen) | - Works with existing JSONL architecture<br>- No changes to database layer<br>- Easy to test and debug | - Slightly higher latency<br>- Need to parse entire JSONL files<br>- Cannot capture sub-transaction changes |
| **Database Triggers** | - Immediate event capture<br>- Fine-grained (per-row changes)<br>- Exact timestamps | - Requires intercepting SQLite operations<br>- Complex to implement (hook into better-sqlite3)<br>- Tight coupling with DB layer |

**Decision**: JSONL diff aligns with existing architecture and doesn't require invasive changes to database layer.

## Success Criteria

### Functional Requirements

- [x] Track all issue and spec mutations in worktrees
- [x] Compute provisional state (main + worktree mutations)
- [x] Expose provisional state via REST API
- [x] Broadcast mutations via WebSocket in real-time
- [x] Support multiple concurrent worktree executions without interference
- [x] Clean up event buffers when executions complete

### Non-Functional Requirements

- **Latency**: Mutation detection within 2 seconds of JSONL write
- **Throughput**: Support 100+ mutations per execution
- **Concurrency**: Support 10+ concurrent executions
- **Memory**: Event buffer ≤ 100MB per execution (10k events × ~10KB each)
- **Reliability**: No crashes or memory leaks during 8-hour execution sessions

### Acceptance Tests

1. **Single execution**: Agent creates issue → mutation detected → API returns provisional state
2. **Multiple concurrent executions**: Two agents modifying different worktrees → no interference
3. **Large execution**: 1000+ mutations → all captured, buffer pruned correctly
4. **Server restart**: Event buffer cleared, no stale data on restart
5. **Cleanup**: Execution completes → watcher stopped, buffer removed

## Future Enhancements

### Event Replay and Debugging

Add ability to replay mutation events for debugging failed executions:

```typescript
// POST /api/executions/:executionId/replay
// Applies mutation events to a debug database
```

### Conflict Detection

Detect when worktree mutations conflict with main repository changes:

```typescript
// Check if worktree modified an entity that was also modified in main repo
function detectConflicts(provisionalState: ProvisionalState): Conflict[]
```

### Provisional Spec/Issue References

Support provisional entities in worktree referencing other provisional entities:

```
Worktree creates ISSUE-NEW-001 and ISSUE-NEW-002
ISSUE-NEW-002 has relationship "blocks" → ISSUE-NEW-001
Both are provisional, references should resolve correctly
```

### Event Compression

Compress sequential updates to same entity into single delta:

```typescript
// Instead of: created → updated → updated → updated
// Store as: created → final_state + delta
```

### Persistent Event Log (Optional)

If needed for audit/compliance, add optional persistent storage:

```typescript
// config.json
{
  "worktree": {
    "persistMutationEvents": true,
    "eventLogPath": ".sudocode/execution-events/"
  }
}
```

## Open Questions

1. **Snapshot Timing**: Should we capture initial snapshot before or after worktree setup completes?
   - **Recommendation**: After setup, so we capture the synced state

2. **Buffer Retention**: How long should we keep event buffers after execution completes?
   - **Recommendation**: 2 hours (configurable), then prune

3. **Memory Limits**: What's the max memory budget for all buffers combined?
   - **Recommendation**: 1GB total (10 concurrent executions × 100MB each)

4. **Conflict Resolution**: Should we detect conflicts between worktree mutations and concurrent main repo changes?
   - **Recommendation**: Phase 2 feature, start without conflict detection

5. **Event Ordering**: Should we use wall-clock time or JSONL update timestamps?
   - **Recommendation**: Use detection time (wall-clock) for ordering, include entity updated_at as metadata

## References

- Existing implementation: `server/src/execution/transport/event-buffer.ts` (AG-UI event buffer)
- Worktree management: `server/src/execution/worktree/manager.ts`
- WebSocket system: `server/src/services/websocket.ts`
- chokidar documentation: https://github.com/paulmillr/chokidar
- Event Sourcing patterns: https://martinfowler.com/eaaDev/EventSourcing.html
