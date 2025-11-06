# Agent Router & Orchestration System Design

## Overview

This document outlines the design for an intelligent Agent Router that manages multiple concurrent agent executions, surfaces user requests intelligently, and learns from historical patterns to minimize context switching and maintain developer flow state.

---

## Problem Statement

Currently:
- Only one agent execution can run per issue (backend constraint)
- When agents need user feedback, they block waiting for response
- No intelligent queueing or prioritization of user requests
- No pattern learning from historical user responses
- Each agent interaction is isolated

**Goal**: Enable multiple concurrent executions while intelligently managing the cognitive load on the user through smart routing, batching, and auto-response capabilities.

---

## UX Design

### 1. Visual Design: The Orchestration Hub

#### A. Global Orchestration Panel (New Component)

**Location**: Persistent panel accessible from anywhere (keyboard shortcut: `Ctrl+Shift+O`)

```
┌─────────────────────────────────────────────────────────────┐
│ 🎯 Agent Orchestrator                    [Auto-mode: ON] ⚙️│
├─────────────────────────────────────────────────────────────┤
│                                                               │
│ ⚡ Needs Attention (2)                           [Queue: 5]  │
│ ┌───────────────────────────────────────────────────────┐  │
│ │ 🔴 HIGH PRIORITY                                       │  │
│ │ Issue #123: Auth System                               │  │
│ │ Agent needs confirmation: Delete deprecated endpoint? │  │
│ │ [✓ Yes] [✗ No] [🤔 Let me review] [⏭️ Skip]          │  │
│ │ Similar decisions: 4x Yes, 0x No (Suggest: Yes)       │  │
│ └───────────────────────────────────────────────────────┘  │
│                                                               │
│ ┌───────────────────────────────────────────────────────┐  │
│ │ 🟡 MEDIUM PRIORITY                                     │  │
│ │ Issue #456: UI Components                             │  │
│ │ Agent requests guidance: Component structure approach?│  │
│ │ [📝 Provide input] [⏭️ Skip] [🤖 Auto-decide]         │  │
│ └───────────────────────────────────────────────────────┘  │
│                                                               │
│ 🔄 In Progress (3)                                           │
│ ├─ #123: Auth System (45% complete) [View]                  │
│ ├─ #456: UI Components (12% complete) [View]                │
│ └─ #789: Database Migration (78% complete) [View]           │
│                                                               │
│ ⏸️ Queued (5)                                                │
│ ├─ #234: API Refactor (waiting for user input)              │
│ ├─ #567: Test Coverage (paused - low priority)              │
│ └─ [Show all...]                                             │
│                                                               │
│ 💡 Smart Suggestions                                         │
│ ├─ Batch review available: 3 similar code review requests   │
│ └─ Auto-approved: 2 test file creations (pattern match)     │
└─────────────────────────────────────────────────────────────┘
```

#### B. In-Context Agent Cards (Enhanced ExecutionMonitor)

When viewing an issue, show mini-status cards:

```
┌──────────────────────────────────────────────────┐
│ 🤖 Agent Status: Running (2/5 tasks complete)    │
│                                                   │
│ Current: Refactoring authentication logic        │
│ Next: Update tests                               │
│                                                   │
│ ⚡ Attention needed in queue (Priority: Low)     │
│ Router will notify when higher priority cleared  │
│                                                   │
│ [View in Orchestrator] [Pause] [Cancel]          │
└──────────────────────────────────────────────────┘
```

#### C. Smart Notification System

**Notification Strategy**:
- **High Priority**: Immediate toast + sound (blocks progress)
- **Medium Priority**: Toast notification (groupable)
- **Low Priority**: Badge on orchestrator icon only
- **Batched**: "3 agents need review" (combined)

**Example Notification**:
```
┌────────────────────────────────────────────┐
│ 🎯 Agent Router                             │
│                                             │
│ 2 agents need your input (similar tasks)   │
│                                             │
│ Both asking about: Test file structure     │
│                                             │
│ [Review together] [Queue for later]        │
└────────────────────────────────────────────┘
```

### 2. User Flows

#### Flow 1: Starting Multiple Executions

```
User → Click "Execute" on Issue #1
  ↓
Frontend: Show execution config dialog
  ↓
User: Confirm execution
  ↓
Backend: Create execution, start agent
  ↓
User → (Without waiting) Click "Execute" on Issue #2
  ↓
Frontend: Show execution config dialog
  ↓
User: Confirm execution
  ↓
Backend: Create execution, start agent (concurrent!)
  ↓
Both agents run in parallel
  ↓
Agent #1 needs user input → Router queues request (Priority: HIGH)
  ↓
Agent #2 needs user input → Router queues request (Priority: MEDIUM)
  ↓
Router: Surfaces Agent #1 request first
  ↓
User: Responds to Agent #1
  ↓
Router: Agent #1 continues, surfaces Agent #2 request
  ↓
User: Responds to Agent #2
  ↓
Both agents continue execution
```

#### Flow 2: Auto-Response Based on Patterns

```
Agent needs confirmation: "Create test file for NewComponent?"
  ↓
Router: Check pattern history
  ↓
Router: Found 15 similar requests, user always said "Yes"
  ↓
Router: Confidence = 95%
  ↓
Router: Auto-respond "Yes" (with notification)
  ↓
Notification: "Auto-approved: Create test file (pattern match)"
  ↓
User: Can view decision in Orchestrator
  ↓
User: Can override if needed (rollback auto-decision)
```

#### Flow 3: Batched Context-Similar Requests

```
Agent #1: "Should I delete deprecated endpoint A?"
Agent #2: "Should I delete deprecated endpoint B?"
Agent #3: "Should I delete deprecated endpoint C?"
  ↓
Router: Detects similar context (keyword: "delete deprecated")
  ↓
Router: Batch together
  ↓
User sees single card:
"3 agents asking about deleting deprecated endpoints"
  ↓
User options:
  - [Apply to all: Yes]
  - [Apply to all: No]
  - [Review individually]
  ↓
User: "Apply to all: Yes"
  ↓
Router: Responds "Yes" to all 3 agents
  ↓
All 3 agents continue execution
```

#### Flow 4: Priority-Based Queuing

```
User working on Issue #1 (High priority)
  ↓
Agent for Issue #1 running
  ↓
User starts execution on Issue #2 (Low priority)
  ↓
Both agents run
  ↓
Agent #2 needs input first (timestamp: T1)
Agent #1 needs input second (timestamp: T2)
  ↓
Router: Check priority
  - Issue #1 priority: High
  - Issue #2 priority: Low
  ↓
Router: Surface Agent #1 request FIRST (despite T2 > T1)
  ↓
User responds to #1, then #2
  ↓
Maintains focus on high-priority work
```

### 3. Context Preservation Strategies

#### A. Intelligent Batching

**Group by**:
- **Similar actions**: "Create file", "Delete function", "Refactor code"
- **Same codebase area**: All requests about `src/auth/`
- **Issue relationships**: Parent/child issues, blocked/blocking
- **Time window**: Requests within 5 minutes

#### B. Context Switching Minimization

**Rules**:
1. Don't interrupt user if actively typing/editing
2. Defer low-priority requests if high-priority work active
3. Show "You can switch now" hints during natural breaks (test runs, builds)
4. Batch notifications: "3 requests pending" vs 3 separate interruptions

#### C. Flow State Protection

**Features**:
- **Do Not Disturb Mode**: Only critical requests interrupt
- **Focus Sessions**: User sets "working on Issue #X for 2 hours"
- **Smart Timing**: Detect idle periods (no keyboard/mouse for 30s)
- **Break Suggestions**: "5 agents in queue. Good time for a quick review?"

---

## System Architecture

### 1. Router Agent Component

#### A. Core Responsibilities

```typescript
class AgentRouter {
  // Queue management
  private requestQueue: PriorityQueue<AgentRequest>;

  // Pattern learning
  private patternMatcher: PatternMatcher;

  // Active monitoring
  private activeExecutions: Map<string, ExecutionContext>;

  // User state
  private userContext: UserContextTracker;

  async enqueueRequest(request: AgentRequest): Promise<void>;
  async processQueue(): Promise<void>;
  async routeToUser(request: AgentRequest): Promise<UserResponse>;
  async learnFromResponse(request: AgentRequest, response: UserResponse): Promise<void>;
  async autoRespond(request: AgentRequest): Promise<UserResponse | null>;
}
```

#### B. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        User Interface                        │
│  (Orchestration Hub, Notifications, In-Context Cards)       │
└───────────────┬─────────────────────────────────────────────┘
                │
                │ WebSocket + SSE
                │
┌───────────────▼─────────────────────────────────────────────┐
│                      Agent Router                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Request Queue (Priority-based)                       │   │
│  │ - High Priority Queue                                │   │
│  │ - Medium Priority Queue                              │   │
│  │ - Low Priority Queue                                 │   │
│  │ - Batching Engine                                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Pattern Learning & Auto-Response                     │   │
│  │ - Pattern Matcher (ML/heuristic)                     │   │
│  │ - Confidence Scorer                                  │   │
│  │ - Response Predictor                                 │   │
│  │ - Historical Data Store                              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ User Context Tracker                                 │   │
│  │ - Activity Monitor (keyboard, mouse, focus)          │   │
│  │ - Flow State Detector                                │   │
│  │ - Priority Manager                                   │   │
│  └─────────────────────────────────────────────────────┘   │
└───────────────┬─────────────────────────────────────────────┘
                │
                │ Request/Response
                │
┌───────────────▼─────────────────────────────────────────────┐
│              Execution Service (Modified)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │ Agent 1  │  │ Agent 2  │  │ Agent 3  │  ...              │
│  │ (Issue A)│  │ (Issue B)│  │ (Issue C)│                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

### 2. Request Queue System

#### A. AgentRequest Data Structure

```typescript
interface AgentRequest {
  id: string;
  executionId: string;
  issueId: string;
  issuePriority: 'critical' | 'high' | 'medium' | 'low';

  // Request details
  type: 'confirmation' | 'guidance' | 'choice' | 'input';
  message: string;
  context: RequestContext;

  // Timing
  createdAt: Date;
  expiresAt?: Date;

  // Batching hints
  batchingKey?: string; // For grouping similar requests
  keywords: string[]; // For similarity matching

  // Priority calculation
  urgency: 'blocking' | 'non-blocking';
  estimatedImpact: number; // 0-100

  // Response options
  options?: ResponseOption[];
  defaultResponse?: string;

  // Pattern matching
  patternSignature: string; // Hash for matching similar requests
}

interface RequestContext {
  file?: string;
  function?: string;
  codeArea?: string;
  relatedRequests?: string[]; // Other request IDs
}

interface ResponseOption {
  value: string;
  label: string;
  description?: string;
}
```

#### B. Priority Calculation Algorithm

```typescript
class PriorityCalculator {
  calculatePriority(request: AgentRequest): number {
    let score = 0;

    // Issue priority (weight: 40)
    score += this.issuePriorityScore(request.issuePriority) * 0.4;

    // Blocking vs non-blocking (weight: 30)
    score += (request.urgency === 'blocking' ? 100 : 50) * 0.3;

    // Wait time (weight: 15)
    const waitMinutes = (Date.now() - request.createdAt.getTime()) / 60000;
    score += Math.min(waitMinutes * 2, 100) * 0.15;

    // Estimated impact (weight: 15)
    score += request.estimatedImpact * 0.15;

    return score;
  }

  private issuePriorityScore(priority: string): number {
    const map = { critical: 100, high: 75, medium: 50, low: 25 };
    return map[priority] || 50;
  }
}
```

#### C. Batching Engine

```typescript
class BatchingEngine {
  // Find requests that can be batched together
  findBatchable(queue: AgentRequest[]): AgentRequest[][] {
    const batches: Map<string, AgentRequest[]> = new Map();

    for (const request of queue) {
      // Strategy 1: Explicit batching key
      if (request.batchingKey) {
        const existing = batches.get(request.batchingKey) || [];
        existing.push(request);
        batches.set(request.batchingKey, existing);
        continue;
      }

      // Strategy 2: Similarity matching
      const similarKey = this.findSimilarBatch(request, Array.from(batches.keys()));
      if (similarKey) {
        batches.get(similarKey)!.push(request);
        continue;
      }

      // Strategy 3: Context proximity
      const contextKey = this.getContextKey(request);
      const existing = batches.get(contextKey) || [];
      existing.push(request);
      batches.set(contextKey, existing);
    }

    // Return only batches with 2+ requests
    return Array.from(batches.values()).filter(batch => batch.length >= 2);
  }

  private findSimilarBatch(
    request: AgentRequest,
    existingKeys: string[]
  ): string | null {
    // Use keyword overlap to find similar requests
    for (const key of existingKeys) {
      const batch = this.batches.get(key);
      if (!batch || batch.length === 0) continue;

      const similarity = this.calculateSimilarity(request, batch[0]);
      if (similarity > 0.7) return key; // 70% similarity threshold
    }
    return null;
  }

  private calculateSimilarity(r1: AgentRequest, r2: AgentRequest): number {
    const k1 = new Set(r1.keywords);
    const k2 = new Set(r2.keywords);
    const intersection = new Set([...k1].filter(x => k2.has(x)));
    const union = new Set([...k1, ...k2]);
    return intersection.size / union.size; // Jaccard similarity
  }

  private getContextKey(request: AgentRequest): string {
    // Group by code area if available
    if (request.context.codeArea) {
      return `context:${request.context.codeArea}`;
    }
    // Otherwise use issue ID
    return `issue:${request.issueId}`;
  }
}
```

### 3. Pattern Learning System

#### A. Pattern Matcher

```typescript
interface Pattern {
  id: string;
  signature: string; // Hash of normalized request

  // Pattern characteristics
  requestType: string;
  keywords: string[];
  contextPatterns: string[];

  // Historical responses
  responses: PatternResponse[];

  // Statistics
  totalOccurrences: number;
  confidenceScore: number; // 0-100
  lastSeen: Date;

  // Auto-response
  suggestedResponse: string | null;
  autoResponseEnabled: boolean;
}

interface PatternResponse {
  response: string;
  timestamp: Date;
  userConfidence: 'certain' | 'uncertain'; // Inferred from response time
  wasOverridden: boolean;
}

class PatternMatcher {
  // Find matching pattern for request
  async findPattern(request: AgentRequest): Promise<Pattern | null> {
    const signature = this.generateSignature(request);

    // Exact match
    let pattern = await this.db.getPatternBySignature(signature);
    if (pattern) return pattern;

    // Fuzzy match
    const candidates = await this.db.searchSimilarPatterns(
      request.keywords,
      request.type
    );

    for (const candidate of candidates) {
      if (this.calculateSimilarity(request, candidate) > 0.8) {
        return candidate;
      }
    }

    return null;
  }

  // Learn from user response
  async learn(request: AgentRequest, response: UserResponse): Promise<void> {
    const signature = this.generateSignature(request);
    let pattern = await this.db.getPatternBySignature(signature);

    if (!pattern) {
      // Create new pattern
      pattern = {
        id: generateId(),
        signature,
        requestType: request.type,
        keywords: request.keywords,
        contextPatterns: this.extractContextPatterns(request),
        responses: [],
        totalOccurrences: 0,
        confidenceScore: 0,
        lastSeen: new Date(),
        suggestedResponse: null,
        autoResponseEnabled: false,
      };
    }

    // Add response
    pattern.responses.push({
      response: response.value,
      timestamp: new Date(),
      userConfidence: this.inferConfidence(response),
      wasOverridden: false,
    });

    // Update statistics
    pattern.totalOccurrences++;
    pattern.confidenceScore = this.calculateConfidence(pattern);
    pattern.suggestedResponse = this.determineConsensusResponse(pattern);
    pattern.lastSeen = new Date();

    // Enable auto-response if confidence high enough
    pattern.autoResponseEnabled =
      pattern.confidenceScore >= 90 &&
      pattern.totalOccurrences >= 5;

    await this.db.savePattern(pattern);
  }

  private generateSignature(request: AgentRequest): string {
    // Normalize and hash key components
    const normalized = {
      type: request.type,
      keywords: request.keywords.sort(),
      context: request.context.codeArea || 'unknown',
    };
    return hashObject(normalized);
  }

  private calculateConfidence(pattern: Pattern): number {
    if (pattern.responses.length < 2) return 0;

    // Calculate consensus
    const responseCounts = new Map<string, number>();
    for (const r of pattern.responses) {
      responseCounts.set(r.response, (responseCounts.get(r.response) || 0) + 1);
    }

    const maxCount = Math.max(...responseCounts.values());
    const consensus = maxCount / pattern.responses.length;

    // Adjust for recency (recent responses weighted more)
    const recencyFactor = this.calculateRecencyFactor(pattern.responses);

    // Adjust for user confidence (fast responses = higher confidence)
    const avgUserConfidence = pattern.responses.filter(
      r => r.userConfidence === 'certain'
    ).length / pattern.responses.length;

    return Math.min(100, consensus * 100 * recencyFactor * (1 + avgUserConfidence));
  }

  private calculateRecencyFactor(responses: PatternResponse[]): number {
    if (responses.length < 3) return 1;

    // Weight recent responses more heavily
    const recent = responses.slice(-5);
    const responseCounts = new Map<string, number>();

    for (const r of recent) {
      responseCounts.set(r.response, (responseCounts.get(r.response) || 0) + 1);
    }

    const maxCount = Math.max(...responseCounts.values());
    return maxCount / recent.length;
  }

  private determineConsensusResponse(pattern: Pattern): string | null {
    const responseCounts = new Map<string, number>();

    for (const r of pattern.responses) {
      responseCounts.set(r.response, (responseCounts.get(r.response) || 0) + 1);
    }

    const entries = Array.from(responseCounts.entries());
    entries.sort((a, b) => b[1] - a[1]);

    return entries[0]?.[0] || null;
  }

  private inferConfidence(response: UserResponse): 'certain' | 'uncertain' {
    // Fast response time = certain
    const responseTimeMs = response.timestamp.getTime() - response.requestTime.getTime();
    return responseTimeMs < 5000 ? 'certain' : 'uncertain';
  }
}
```

#### B. Auto-Response System

```typescript
class AutoResponder {
  constructor(
    private patternMatcher: PatternMatcher,
    private config: AutoResponseConfig
  ) {}

  async tryAutoRespond(request: AgentRequest): Promise<UserResponse | null> {
    if (!this.config.enabled) return null;

    // Find matching pattern
    const pattern = await this.patternMatcher.findPattern(request);
    if (!pattern || !pattern.autoResponseEnabled) return null;

    // Check confidence threshold
    if (pattern.confidenceScore < this.config.minConfidence) return null;

    // Check if user has overridden this pattern recently
    const recentOverrides = pattern.responses
      .filter(r => r.wasOverridden)
      .filter(r =>
        Date.now() - r.timestamp.getTime() < 7 * 24 * 60 * 60 * 1000 // 7 days
      );

    if (recentOverrides.length > 0) return null; // Don't auto-respond if recently overridden

    // Generate auto-response
    const autoResponse: UserResponse = {
      value: pattern.suggestedResponse!,
      timestamp: new Date(),
      requestTime: request.createdAt,
      auto: true,
      patternId: pattern.id,
      confidence: pattern.confidenceScore,
    };

    // Notify user
    await this.notifyAutoResponse(request, autoResponse);

    return autoResponse;
  }

  private async notifyAutoResponse(
    request: AgentRequest,
    response: UserResponse
  ): Promise<void> {
    // Send notification to user
    await this.sendNotification({
      type: 'auto-response',
      title: 'Auto-approved by pattern',
      message: `${request.message}\nResponse: ${response.value}`,
      actions: [
        { label: 'Override', action: 'override' },
        { label: 'View details', action: 'view' },
      ],
      metadata: {
        requestId: request.id,
        patternId: response.patternId,
        confidence: response.confidence,
      },
    });
  }
}

interface AutoResponseConfig {
  enabled: boolean;
  minConfidence: number; // 0-100
  minOccurrences: number; // Minimum pattern occurrences before auto-response
  notifyUser: boolean; // Show notification for auto-responses
}
```

### 4. User Context Tracker

```typescript
class UserContextTracker {
  private currentFocus: {
    issueId: string | null;
    file: string | null;
    activity: 'typing' | 'reading' | 'idle';
    lastActivity: Date;
  };

  private focusMode: {
    enabled: boolean;
    issueId?: string;
    duration?: number;
    allowInterruptions: 'none' | 'critical' | 'high' | 'all';
  };

  // Detect user activity state
  isUserBusy(): boolean {
    const idleThresholdMs = 30 * 1000; // 30 seconds
    const timeSinceActivity = Date.now() - this.currentFocus.lastActivity.getTime();

    if (this.currentFocus.activity === 'typing') return true;
    if (timeSinceActivity < idleThresholdMs) return true;

    return false;
  }

  // Check if interruption allowed
  canInterrupt(request: AgentRequest): boolean {
    if (!this.focusMode.enabled) return true;

    switch (this.focusMode.allowInterruptions) {
      case 'none':
        return false;
      case 'critical':
        return request.issuePriority === 'critical';
      case 'high':
        return ['critical', 'high'].includes(request.issuePriority);
      case 'all':
        return true;
      default:
        return true;
    }
  }

  // Get current context for smart routing
  getCurrentContext(): UserContext {
    return {
      focusedIssue: this.currentFocus.issueId,
      focusedFile: this.currentFocus.file,
      activity: this.currentFocus.activity,
      focusMode: this.focusMode,
    };
  }

  // Update activity (called by frontend)
  updateActivity(activity: ActivityUpdate): void {
    this.currentFocus.activity = activity.type;
    this.currentFocus.lastActivity = new Date();

    if (activity.issueId) {
      this.currentFocus.issueId = activity.issueId;
    }
    if (activity.file) {
      this.currentFocus.file = activity.file;
    }
  }
}
```

---

## Database Schema Changes

### New Tables

```sql
-- Agent requests queue
CREATE TABLE IF NOT EXISTS agent_requests (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  issue_id TEXT NOT NULL,

  -- Request details
  type TEXT NOT NULL CHECK(type IN ('confirmation', 'guidance', 'choice', 'input')),
  message TEXT NOT NULL,
  context TEXT, -- JSON: { file, function, codeArea }

  -- Priority and batching
  issue_priority TEXT CHECK(issue_priority IN ('critical', 'high', 'medium', 'low')),
  urgency TEXT CHECK(urgency IN ('blocking', 'non-blocking')),
  estimated_impact INTEGER DEFAULT 50,
  batching_key TEXT,
  keywords TEXT, -- JSON array
  pattern_signature TEXT,

  -- Response
  response_value TEXT,
  response_timestamp DATETIME,
  response_auto BOOLEAN DEFAULT FALSE,
  response_pattern_id TEXT,

  -- Status
  status TEXT NOT NULL CHECK(status IN ('queued', 'presented', 'responded', 'expired', 'cancelled')),

  -- Timing
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  presented_at DATETIME,
  responded_at DATETIME,
  expires_at DATETIME,

  FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE,
  FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
  FOREIGN KEY (response_pattern_id) REFERENCES agent_patterns(id)
);

CREATE INDEX idx_agent_requests_status ON agent_requests(status);
CREATE INDEX idx_agent_requests_execution ON agent_requests(execution_id);
CREATE INDEX idx_agent_requests_pattern ON agent_requests(pattern_signature);

-- Pattern learning
CREATE TABLE IF NOT EXISTS agent_patterns (
  id TEXT PRIMARY KEY,
  signature TEXT NOT NULL UNIQUE,

  -- Pattern characteristics
  request_type TEXT NOT NULL,
  keywords TEXT NOT NULL, -- JSON array
  context_patterns TEXT, -- JSON array

  -- Statistics
  total_occurrences INTEGER DEFAULT 0,
  confidence_score REAL DEFAULT 0,
  last_seen DATETIME NOT NULL,

  -- Auto-response
  suggested_response TEXT,
  auto_response_enabled BOOLEAN DEFAULT FALSE,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_agent_patterns_signature ON agent_patterns(signature);
CREATE INDEX idx_agent_patterns_confidence ON agent_patterns(confidence_score);

-- Pattern responses (historical)
CREATE TABLE IF NOT EXISTS agent_pattern_responses (
  id TEXT PRIMARY KEY,
  pattern_id TEXT NOT NULL,

  response_value TEXT NOT NULL,
  timestamp DATETIME NOT NULL,
  user_confidence TEXT CHECK(user_confidence IN ('certain', 'uncertain')),
  was_overridden BOOLEAN DEFAULT FALSE,

  FOREIGN KEY (pattern_id) REFERENCES agent_patterns(id) ON DELETE CASCADE
);

CREATE INDEX idx_pattern_responses_pattern ON agent_pattern_responses(pattern_id);
CREATE INDEX idx_pattern_responses_timestamp ON agent_pattern_responses(timestamp);

-- User context tracking
CREATE TABLE IF NOT EXISTS user_context_snapshots (
  id TEXT PRIMARY KEY,

  focused_issue_id TEXT,
  focused_file TEXT,
  activity TEXT CHECK(activity IN ('typing', 'reading', 'idle')),

  focus_mode_enabled BOOLEAN DEFAULT FALSE,
  focus_mode_issue_id TEXT,
  focus_mode_allow_interruptions TEXT CHECK(
    focus_mode_allow_interruptions IN ('none', 'critical', 'high', 'all')
  ),

  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (focused_issue_id) REFERENCES issues(id) ON DELETE SET NULL,
  FOREIGN KEY (focus_mode_issue_id) REFERENCES issues(id) ON DELETE SET NULL
);

CREATE INDEX idx_context_snapshots_timestamp ON user_context_snapshots(timestamp);
```

---

## Implementation Plan

### Phase 1: Foundation (Weeks 1-2)

**Goal**: Remove concurrency restriction, add basic queueing

1. **Remove Backend Concurrency Check**
   - Modify `execution-lifecycle.ts` to allow multiple concurrent executions per issue
   - Update worktree isolation to handle concurrent branches
   - Add execution_count tracking per issue

2. **Create AgentRouter Service**
   - New file: `server/src/services/agent-router.ts`
   - Implement basic request queueing (FIFO)
   - WebSocket connection for real-time updates

3. **Database Schema**
   - Add `agent_requests` table
   - Migration scripts

4. **Basic API Endpoints**
   ```
   POST /api/agent-requests/:requestId/respond
   GET /api/agent-requests/queue
   DELETE /api/agent-requests/:requestId
   ```

5. **Frontend: Orchestration Hub Component**
   - New component: `OrchestrationHub.tsx`
   - Basic queue visualization
   - Simple response UI

**Deliverable**: Multiple agents can run, user sees requests in queue, can respond

---

### Phase 2: Intelligent Routing (Weeks 3-4)

**Goal**: Add priority-based routing and batching

1. **Priority Calculator**
   - Implement priority scoring algorithm
   - Add issue priority to requests

2. **Batching Engine**
   - Detect similar requests
   - Group requests by context
   - Batch UI in frontend

3. **User Context Tracker**
   - Track user activity (frontend hook)
   - Implement focus mode
   - Activity-based interruption control

4. **Enhanced Notifications**
   - Priority-based notification strategy
   - Batched notifications
   - Smart timing

**Deliverable**: Requests are intelligently prioritized and batched, reducing context switches

---

### Phase 3: Pattern Learning (Weeks 5-6)

**Goal**: Auto-response based on patterns

1. **Pattern Matcher**
   - New service: `PatternMatcher`
   - Pattern signature generation
   - Similarity matching

2. **Database Schema**
   - Add `agent_patterns` and `agent_pattern_responses` tables
   - Migration scripts

3. **Learning System**
   - Capture user responses
   - Calculate confidence scores
   - Update patterns automatically

4. **Auto-Responder**
   - Auto-response logic
   - Confidence thresholds
   - User notification for auto-responses

5. **Frontend: Pattern Management**
   - View learned patterns
   - Enable/disable auto-response per pattern
   - Override auto-responses

**Deliverable**: System learns from user responses and auto-approves high-confidence requests

---

### Phase 4: Advanced Features (Weeks 7-8)

**Goal**: Polish and advanced UX

1. **Smart Suggestions**
   - "Good time for review" hints
   - Break time recommendations
   - Batch review opportunities

2. **Analytics Dashboard**
   - Pattern statistics
   - Time saved by auto-responses
   - Context switch reduction metrics

3. **Configuration UI**
   - Auto-response settings
   - Notification preferences
   - Priority customization

4. **Performance Optimization**
   - Request queue indexing
   - Pattern matching optimization
   - WebSocket connection pooling

**Deliverable**: Polished, production-ready system with analytics

---

## Key Integration Points

### 1. Agent Execution → Router

When agent needs user input:

```typescript
// In agent execution (MCP tool or similar)
async function requestUserFeedback(
  executionId: string,
  message: string,
  options?: ResponseOption[]
): Promise<string> {
  const request: AgentRequest = {
    id: generateId(),
    executionId,
    issueId: execution.issue_id,
    type: 'confirmation',
    message,
    context: getCurrentContext(),
    // ... other fields
  };

  // Send to router instead of blocking
  const response = await agentRouter.enqueueRequest(request);

  return response.value;
}
```

### 2. Router → User (WebSocket)

```typescript
// Server side
agentRouter.on('request_ready', (request: AgentRequest) => {
  wsServer.broadcast({
    type: 'agent_request',
    request,
  });
});

// Frontend side
useEffect(() => {
  const ws = new WebSocket('/api/agent-router/stream');

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'agent_request') {
      showNotification(data.request);
    }
  };
}, []);
```

### 3. User → Router → Agent

```typescript
// User responds via UI
async function handleUserResponse(requestId: string, response: string) {
  await api.post(`/api/agent-requests/${requestId}/respond`, { response });

  // Router forwards to waiting agent
  agentRouter.resolveRequest(requestId, response);
}
```

---

## Configuration

### Agent Router Config

```typescript
interface AgentRouterConfig {
  // Queue settings
  maxQueueSize: number; // Max pending requests
  requestTimeout: number; // Auto-expire after N seconds

  // Priority
  defaultPriority: 'high' | 'medium' | 'low';
  priorityWeights: {
    issuePriority: number;
    urgency: number;
    waitTime: number;
    impact: number;
  };

  // Batching
  batchingEnabled: boolean;
  batchTimeWindow: number; // Seconds
  minBatchSize: number;
  similarityThreshold: number; // 0-1

  // Auto-response
  autoResponse: {
    enabled: boolean;
    minConfidence: number; // 0-100
    minOccurrences: number;
    notifyUser: boolean;
  };

  // User context
  userContext: {
    idleThresholdSeconds: number;
    focusModeDefault: 'none' | 'critical' | 'high' | 'all';
  };

  // Notifications
  notifications: {
    highPrioritySound: boolean;
    batchNotifications: boolean;
    quietHoursStart?: number; // Hour (0-23)
    quietHoursEnd?: number;
  };
}
```

### User Preferences

```typescript
interface UserRouterPreferences {
  // Auto-response
  autoResponseEnabled: boolean;
  autoResponseMinConfidence: number;

  // Notifications
  notificationLevel: 'all' | 'high-only' | 'critical-only' | 'none';
  notificationSound: boolean;

  // Focus mode
  focusModeEnabled: boolean;
  focusModeDuration?: number; // Minutes
  focusModeAllowInterruptions: 'none' | 'critical' | 'high' | 'all';

  // Display
  showOrchestrationHub: boolean;
  showInContextCards: boolean;
}
```

---

## Success Metrics

### Quantitative

1. **Context Switch Reduction**: Measure time between mode switches
   - Target: 50% reduction in context switches per hour

2. **Response Time**: Time from request to user response
   - Target: <2 minutes for high priority
   - Target: <10 minutes for medium priority

3. **Auto-Response Rate**: % of requests auto-responded
   - Target: 30-40% of requests auto-approved

4. **Pattern Confidence**: Average confidence score
   - Target: >80% for auto-response patterns

5. **User Satisfaction**: Survey rating
   - Target: 8+ out of 10

### Qualitative

1. Users report maintaining flow state longer
2. Users feel less overwhelmed by multiple agents
3. Users trust auto-response suggestions
4. Users understand priority routing logic

---

## Future Enhancements

### Advanced ML Integration

- **LLM-based Pattern Matching**: Use Claude to understand semantic similarity between requests
- **Predictive Routing**: Predict which requests user will answer first
- **Smart Defaults**: Learn default responses for each user/project

### Collaborative Features

- **Team Patterns**: Share learned patterns across team
- **Delegation**: Route requests to other team members
- **Review Modes**: Batch review sessions with analytics

### Advanced UX

- **Voice Input**: Respond to agents via voice
- **Keyboard Shortcuts**: Quick response shortcuts (Y/N/S for Yes/No/Skip)
- **Mobile App**: Review queue on mobile

---

## Conclusion

This Agent Router system transforms concurrent agent execution from a liability into an asset by:

1. **Intelligently managing user attention** through priority-based routing
2. **Reducing cognitive load** via batching and auto-response
3. **Preserving flow state** through context-aware interruption control
4. **Learning from behavior** to automate repetitive decisions

The phased implementation allows incremental value delivery while maintaining system stability.

**Next Steps**:
1. Review and approve design
2. Create implementation issues for Phase 1
3. Set up metrics tracking infrastructure
4. Begin development
