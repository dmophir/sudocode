# Sudocode Architecture Analysis

## Executive Summary

Sudocode is a **git-native spec and issue management system** designed for AI-assisted development. It uses a **distributed, decentralized architecture** where git is the source of truth, local SQLite caches provide fast queries, and multiple interfaces (CLI, REST API, MCP, WebSocket) enable different interaction patterns.

The core design principle: **Store specifications and work items in git, distribute via git, let AI handle merge conflicts.**

---

## 1. Git-Native Storage Structure

### Directory Layout

```
.sudocode/
├── specs/
│   ├── spec-001-auth-system.md      # Human-editable markdown with YAML frontmatter
│   ├── spec-002-database-design.md
│   └── specs.jsonl                  # Source of truth (git-tracked)
├── issues/
│   ├── ISSUE-001.md                 # Human-editable issue markdown
│   ├── ISSUE-002.md
│   └── issues.jsonl                 # Source of truth (git-tracked)
├── cache.db                         # SQLite cache (gitignored, rebuilt from JSONL)
├── config.json                      # Configuration
├── meta.json                        # ID counters, last sync time
└── .gitignore
```

### File Formats

**Specs JSONL** (one JSON object per line, each is a complete snapshot):
```json
{
  "id": "SPEC-001",
  "uuid": "37d447c6-5f01-435d-b7e8-99d689e597f8",
  "title": "Authentication System",
  "file_path": "specs/auth-system.md",
  "content": "# Full markdown content...",
  "priority": 0,
  "archived": 0,
  "created_at": "2025-10-24 09:53:37",
  "updated_at": "2025-11-03T03:10:12.642Z",
  "parent_id": null,
  "parent_uuid": null,
  "relationships": [
    {"from": "SPEC-001", "from_type": "spec", "to": "ISSUE-001", "to_type": "issue", "type": "implements"}
  ],
  "tags": ["auth", "security"]
}
```

**Issues JSONL** (similar structure):
```json
{
  "id": "ISSUE-001",
  "uuid": "6a41fb64-d043-415d-911d-76f2536795f4",
  "title": "Implement OAuth 2.0 token endpoint",
  "content": "Create REST endpoint for OAuth token exchange...",
  "status": "open",
  "priority": 1,
  "assignee": "agent-backend-dev",
  "archived": 0,
  "created_at": "2025-10-24 09:53:37",
  "updated_at": "2025-11-03T03:10:12.641Z",
  "closed_at": null,
  "parent_id": null,
  "parent_uuid": null,
  "relationships": [
    {"from": "ISSUE-001", "from_type": "issue", "to": "ISSUE-002", "to_type": "issue", "type": "blocks"}
  ],
  "tags": ["auth", "backend"]
}
```

**Markdown Files** (human-editable with frontmatter):
```markdown
---
id: SPEC-001
title: Authentication System
priority: 0
created_at: 2025-10-24 09:53:37
updated_at: 2025-11-03T03:10:12.642Z
created_by: alice
updated_by: alice
parent: null
tags:
  - auth
  - security
---

# Authentication System

## Overview
This spec defines the authentication system design...

## Requirements
- Support OAuth 2.0 [[ISSUE-001]]
- Multi-factor authentication [[ISSUE-002]]
```

**Cross-references in Markdown**:
- Issue references: `[[@issue-001]]` or `[[ISSUE-001]]`
- Spec references: `[[spec-010]]` or `[[SPEC-010]]`
- These are extracted and converted to relationship edges

### Immutable IDs with UUIDs

**Both ID and UUID are maintained**:
- `id`: Sequential, human-readable (SPEC-001, ISSUE-042)
- `uuid`: Immutable, never changes even if ID collision resolved
- Both tracked in relationships table for future-proof distributed scenarios

```sql
-- Issues table
CREATE TABLE issues (
    id TEXT PRIMARY KEY,
    uuid TEXT NOT NULL UNIQUE,
    ...
);

-- Relationships table
CREATE TABLE relationships (
    from_id TEXT NOT NULL,
    from_uuid TEXT NOT NULL,          -- Tracks UUID alongside ID
    from_type TEXT NOT NULL,
    to_id TEXT NOT NULL,
    to_uuid TEXT NOT NULL,            -- Tracks UUID alongside ID
    to_type TEXT NOT NULL,
    relationship_type TEXT NOT NULL,
    ...
    PRIMARY KEY (from_id, from_type, to_id, to_type, relationship_type)
);
```

---

## 2. Sync Architecture

### Three-Way Sync: Markdown ↔ JSONL ↔ SQLite

```
                  User Edits
                      │
                      ▼
              ┌─────────────────┐
              │  Markdown Files │  (human-readable)
              │  .sudocode/     │
              │  specs/*.md     │
              └────────┬────────┘
                       │
                       ↓
              ┌─────────────────┐
              │   JSONL Files   │  (source of truth, git-tracked)
              │  specs.jsonl    │
              │  issues.jsonl   │
              └────────┬────────┘
                       │
            ┌──────────┴──────────┐
            │                     │
            ▼                     ▼
    ┌─────────────────┐   ┌──────────────────┐
    │  SQLite Cache   │   │  Git Distribution│
    │  cache.db       │   │  (via git push/  │
    │  (gitignored)   │   │   git pull)      │
    └─────────────────┘   └──────────────────┘
    (fast queries)        (distributed sync)
```

### Sync Triggers

1. **Markdown → JSONL**: File watcher detects `.md` changes
   - Parse frontmatter + content
   - Extract IDs and relationships
   - Update JSONL line
   - Export to SQLite
   - **Debounce**: 2 seconds

2. **SQLite → JSONL**: CLI commands modify database
   - Update SQLite row
   - Queue export (debounced, 5 seconds)
   - Write to JSONL
   - Optionally update markdown frontmatter

3. **JSONL → SQLite**: After git pull
   - Detect JSONL changes
   - Diff with SQLite
   - Auto-resolve collisions (by reference count)
   - Merge conflicts: handled by git + AI

### Collision Resolution

When merging JSONL after git conflicts:

1. **ID Collision** (same ID, different content)
   - Score by reference count (how many entities reference it)
   - Renumber entity with fewer references
   - Update all references via regex `\b{old-id}\b`
   - Log mapping in `meta.json`

2. **Concurrent Updates** (both sides modified same entity)
   - Timestamp-based: newest wins
   - Or: Mark as conflict for manual resolution

3. **Reference Breaks** (referenced ID doesn't exist)
   - Create placeholder entity
   - Or: Remove dangling reference

---

## 3. Data Model

### Core Entities

#### Specs Table
```sql
CREATE TABLE specs (
    id TEXT PRIMARY KEY,              -- SPEC-001
    uuid TEXT NOT NULL UNIQUE,        -- 37d447c6-...
    title TEXT NOT NULL,
    file_path TEXT NOT NULL,          -- specs/auth-system.md
    content TEXT,                     -- Markdown content (no frontmatter)
    priority INTEGER DEFAULT 2,       -- 0-4
    archived INTEGER DEFAULT 0,
    archived_at DATETIME,
    created_at DATETIME,
    updated_at DATETIME,
    parent_id TEXT,                   -- Hierarchical specs
    parent_uuid TEXT,
    FOREIGN KEY (parent_id) REFERENCES specs(id)
);
```

**Fields**:
- `id`: Sequential, human-readable (SPEC-001)
- `uuid`: Immutable for cross-repo scenarios
- `status`: None in current schema (TODO: draft, review, approved, deprecated)
- `priority`: 0-4 (0 = highest)
- `archived`: Soft delete flag
- `parent_id`: For hierarchical specs

#### Issues Table
```sql
CREATE TABLE issues (
    id TEXT PRIMARY KEY,              -- ISSUE-001
    uuid TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    content TEXT,                     -- Markdown content (no frontmatter)
    status TEXT DEFAULT 'open',       -- open, in_progress, blocked, closed
    priority INTEGER DEFAULT 2,       -- 0-4
    assignee TEXT,                    -- Agent or human
    archived INTEGER DEFAULT 0,
    archived_at DATETIME,
    created_at DATETIME,
    updated_at DATETIME,
    closed_at DATETIME,
    parent_id TEXT,                   -- Parent issue (for subtasks)
    parent_uuid TEXT,
    FOREIGN KEY (parent_id) REFERENCES issues(id)
);
```

**Status Lifecycle**:
```
open → in_progress → closed
open → blocked → in_progress → closed
closed → open (reopen)
```

#### Relationships Table (Polymorphic)
```sql
CREATE TABLE relationships (
    from_id TEXT NOT NULL,
    from_uuid TEXT NOT NULL,
    from_type TEXT NOT NULL,          -- 'spec' or 'issue'
    to_id TEXT NOT NULL,
    to_uuid TEXT NOT NULL,
    to_type TEXT NOT NULL,            -- 'spec' or 'issue'
    relationship_type TEXT NOT NULL,  -- See types below
    created_at DATETIME,
    metadata TEXT,                    -- JSON blob for extensibility
    PRIMARY KEY (from_id, from_type, to_id, to_type, relationship_type)
);
```

**Relationship Types**:

| Type | Direction | Meaning | Example |
|------|-----------|---------|---------|
| `blocks` | A blocks B | A is a blocker for B; B cannot proceed until A completes | ISSUE-001 blocks ISSUE-002 |
| `implements` | Issue implements Spec | This issue fulfills a spec requirement | ISSUE-001 implements SPEC-001 |
| `references` | Soft link | Contextual reference without blocking | ISSUE-001 references ISSUE-010 |
| `depends-on` | A depends on B | A requires B to be done first | ISSUE-001 depends-on ISSUE-002 |
| `parent-child` | Epic → Task | Hierarchical subtask relationship | EPIC-001 parent-child TASK-002 |
| `discovered-from` | Found during work | New issues discovered while working on another | ISSUE-003 discovered-from ISSUE-001 |
| `related` | Contextual | Soft relationship for organization | SPEC-001 related SPEC-010 |

#### Tags Table
```sql
CREATE TABLE tags (
    entity_id TEXT NOT NULL,
    entity_uuid TEXT NOT NULL,
    entity_type TEXT NOT NULL,        -- 'spec' or 'issue'
    tag TEXT NOT NULL,
    PRIMARY KEY (entity_id, entity_type, tag)
);
```

#### Events Table (Audit Trail)
```sql
CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id TEXT NOT NULL,
    entity_uuid TEXT NOT NULL,
    entity_type TEXT NOT NULL,        -- 'spec' or 'issue'
    event_type TEXT NOT NULL,         -- created, updated, status_changed, etc
    actor TEXT NOT NULL,              -- Username or agent ID
    old_value TEXT,                   -- JSON snapshot before change
    new_value TEXT,                   -- JSON snapshot after change
    created_at DATETIME,
    git_commit_sha TEXT,              -- Optional: which commit caused this
    source TEXT                       -- 'local' | 'git-reconstructed'
);
```

**Event Population**:
1. **Real-time**: When CLI commands execute, events inserted immediately
2. **Short history**: On import, reconstruct recent events by diffing JSONL
3. **Full git history**: (Future) Parse git commits for complete audit trail

#### Feedback Table (Issue → Spec)
```sql
CREATE TABLE issue_feedback (
    id TEXT PRIMARY KEY,
    issue_id TEXT NOT NULL,
    issue_uuid TEXT NOT NULL,
    spec_id TEXT NOT NULL,
    spec_uuid TEXT NOT NULL,
    feedback_type TEXT,               -- 'comment', 'suggestion', 'request'
    content TEXT NOT NULL,            -- Feedback text
    agent TEXT,                       -- Who provided it
    anchor TEXT,                      -- Anchor location in spec (smart relocation)
    dismissed INTEGER DEFAULT 0,
    created_at DATETIME,
    updated_at DATETIME,
    FOREIGN KEY (issue_id) REFERENCES issues(id),
    FOREIGN KEY (spec_id) REFERENCES specs(id)
);
```

**Feedback Anchoring**: Tracks specific line/text in spec with smart relocation when spec changes.

---

## 4. How Issues Reference Each Other

### Current References

1. **Explicit Relationships** (in relationships table)
   ```sql
   -- ISSUE-001 blocks ISSUE-002
   INSERT INTO relationships 
   VALUES ('ISSUE-001', 'uuid-1', 'issue', 'ISSUE-002', 'uuid-2', 'issue', 'blocks', ...)
   ```

2. **Hierarchical (Parent-Child)**
   ```sql
   -- ISSUE-003 is subtask of ISSUE-001
   INSERT INTO issues (id, parent_id, ...) VALUES ('ISSUE-003', 'ISSUE-001', ...)
   ```

3. **Markdown Cross-References**
   ```markdown
   ---
   id: ISSUE-001
   ---
   
   This issue depends on [[ISSUE-002]] and [[ISSUE-003]]
   See also [[SPEC-010]] for more context.
   ```
   - Extracted via regex `\[\[([A-Z0-9-]+)\]\]`
   - Converted to relationship edges
   - Bidirectional: both forward and back links tracked

4. **Within Spec Content**
   ```markdown
   # Authentication System Requirements
   
   - Implement OAuth 2.0 [[ISSUE-001]]
   - Add MFA support [[ISSUE-002]]
   ```
   - Links to specific issues implementing the requirement
   - Spec → Issue references (via relationships table)

### Query Patterns

**Find all blockers for an issue**:
```sql
SELECT blocker.* FROM issues blocker
JOIN relationships r ON blocker.id = r.to_id
WHERE r.from_id = 'ISSUE-001' AND r.relationship_type = 'blocks'
```

**Find all issues blocking an issue**:
```sql
SELECT r.from_id FROM relationships r
WHERE r.to_id = 'ISSUE-001' AND r.relationship_type = 'blocks'
```

**Ready Work View** (issues with no blocking dependencies):
```sql
CREATE VIEW ready_issues AS
SELECT i.* FROM issues i
WHERE i.status = 'open'
  AND NOT EXISTS (
    SELECT 1 FROM relationships r
    WHERE r.to_id = i.id 
      AND r.relationship_type = 'blocks'
      AND EXISTS (
        SELECT 1 FROM issues blocker 
        WHERE blocker.id = r.from_id 
        AND blocker.status IN ('open', 'in_progress', 'blocked')
      )
  );
```

---

## 5. Communication Patterns & Protocols

### Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                    User Interfaces                        │
├──────────────────────────────────────────────────────────┤
│  CLI  │  Web UI  │  Text Editor  │  Claude Code (MCP)    │
└────┬──────────┬──────────────────┬────────────────┬──────┘
     │          │                  │                │
     ▼          ▼                  ▼                ▼
┌──────────────────────────────────────────────────────────┐
│                  Communication Layer                      │
├──────────────────────────────────────────────────────────┤
│  REST API      │  MCP Server   │  WebSocket    │  File   │
│  (Express)     │  (Node.js)    │  (Real-time)  │ Watcher │
└────┬──────────┬──────────────────┬────────────┬──────────┘
     │          │                  │            │
     └──────────┴──────────────────┴────────────┘
                      │
     ┌────────────────▼────────────────┐
     │      CLI Operations Layer       │
     │  (Unified business logic)       │
     └────────────────┬────────────────┘
                      │
     ┌────────────────▼────────────────┐
     │   SQLite Database + Sync        │
     │   - JSONL ↔ SQLite              │
     │   - Markdown ↔ JSONL            │
     └────────────────┬────────────────┘
                      │
     ┌────────────────▼────────────────┐
     │   Git Repository (JSONL)        │
     │   - Source of truth             │
     │   - Distributed via git         │
     └─────────────────────────────────┘
```

### 1. REST API (Server)

**Endpoints** (`src/server/routes/`):

```
GET    /api/issues                 # List issues with filters
GET    /api/issues/:id             # Get specific issue
POST   /api/issues                 # Create issue
PUT    /api/issues/:id             # Update issue
DELETE /api/issues/:id             # Delete issue

GET    /api/specs                  # List specs
GET    /api/specs/:id              # Get spec
POST   /api/specs                  # Create spec
PUT    /api/specs/:id              # Update spec

GET    /api/relationships          # Query relationships
POST   /api/relationships          # Create relationship

GET    /api/executions/:id         # Get execution status
POST   /api/executions             # Start execution
WS     /api/executions/:id/stream  # WebSocket: real-time trajectory
```

**Request/Response Format**:
```typescript
interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error_data?: any;
  message?: string;
}

GET /api/issues?status=open&priority=1&limit=10

Response:
{
  "success": true,
  "data": [
    { "id": "ISSUE-001", "title": "...", "status": "open", ... },
    ...
  ]
}
```

### 2. MCP Server (for Claude Code)

**MCP Tools** (`src/mcp/tools/`):

Core tools for AI agents to interact with sudocode:

```typescript
// Issue Management
- ready(limit, priority, assignee, show_specs, show_issues)
- list_issues(status, type, priority, assignee)
- show_issue(issue_id)
- upsert_issue(title, description, status, priority, ...)
- close_issue(issue_ids, reason)
- update_issue(issue_id, updates)

// Spec Management
- list_specs(status, type, priority)
- show_spec(spec_id)
- upsert_spec(title, type, priority, description, ...)

// Relationships
- link(from_id, to_id, type)
- add_reference(from_id, to_id, type, line_or_text)

// Feedback
- upsert_feedback(issue_id, spec_id, content, type, anchor)
- list_feedback(issue_id, spec_id, type, status)
- acknowledge_feedback(feedback_id)
- resolve_feedback(feedback_id, comment)

// Analytics
- ready() -> { specs, issues } (ready to work)
- stats() -> { specs: {...}, issues: {...}, relationships: {...} }
- blocked_issues() -> issues with blockers
```

**MCP Client Architecture**:
```typescript
class SudocodeClient {
  async exec(args: string[], options?): Promise<any>
    // Spawns: sudocode [args...] --json
    // Parses JSON output
    // Handles errors
}
```

**Tool Flow**:
```
Claude Code (agent)
        │
        │ MCP Protocol
        ▼
  MCP Server (Node.js)
        │
        └─ Spawn: sudocode --json
        │  (CLI with JSON output)
        ▼
  CLI Operations
        │
        ├─ SQLite queries
        ├─ JSONL updates
        └─ Markdown sync
        ▼
  Response (JSON)
        │
        └─ Back to Claude
```

### 3. WebSocket (Real-Time)

**Endpoints**:
```
WS /api/executions/:executionId/trajectory

Messages:
{
  "type": "entry",
  "data": {
    "index": 5,
    "type": "tool_use",      // tool_use | thinking | assistant_msg | etc
    "content": "...",
    "timestamp": "2025-01-26T10:01:23Z",
    "metadata": { ... }
  }
}

{
  "type": "session_id",
  "data": { "sessionId": "claude-session-abc" }
}

{
  "type": "finished",
  "data": { "exitCode": 0 }
}
```

### 4. File Watcher & Git Sync

**Automatic Sync**:
```typescript
// chokidar watches .sudocode/
const watcher = chokidar.watch(['.sudocode/specs', '.sudocode/issues']);

watcher.on('change', debounce(async (path) => {
  // 1. Parse markdown
  // 2. Merge with JSONL
  // 3. Update SQLite
  // 4. Export to JSONL
  // 5. Broadcast via WebSocket
}, 2000));
```

**Git Integration**:
```bash
# After git pull
sudocode sync --from-git
  # 1. Detect JSONL changes
  # 2. Diff with SQLite
  # 3. Apply updates (with collision resolution)
  # 4. Broadcast changes
```

### 5. CLI-First Design

**All changes flow through CLI operations**:

```typescript
// server/src/services/issues.ts
import { updateIssue } from '@sudocode/cli/operations/issues'

export function updateIssueViaAPI(id: string, updates: any) {
  // Use CLI operation (ensures JSONL consistency)
  const updated = await updateIssue(db, id, updates);
  
  // Broadcast to connected clients
  broadcastIssueUpdate(updated);
  
  return updated;
}
```

**Benefits**:
- Single source of logic (CLI)
- Consistent JSONL updates
- Same behavior CLI, API, MCP
- Easier to test

---

## 6. Current Communication Constraints

### Single-Repository Design

Currently, sudocode assumes:
- **One `.sudocode/` directory per repository**
- Issues/specs stored together
- All entities have unique IDs within that repo
- Git distribution handles multi-repo via git pull/push

### ID Collision Handling

When merging from different repos:
1. Same ID in both repos → collision detected
2. Resolve by reference count (keep ID with more references)
3. Renumber the other
4. Update all references
5. Log mapping

**Limitation**: This works for simple merges, but breaks for:
- Complex cross-repo references
- Ambiguous conflicts (both sides equal references)
- Concurrent editing across repos

### No Global Namespace

- Each repo has its own ID sequence: SPEC-001, SPEC-002, ...
- No global authority for ID uniqueness
- UUIDs provide identity, but still sequential IDs within each repo

---

## 7. Architecture for Future Cross-Repo Communication

### Key Design Patterns Ready

1. **UUID Dualism** (already implemented):
   - Both ID and UUID tracked
   - UUID immutable across merges
   - Ready for global registry

2. **Polymorphic Relationships** (already implemented):
   - Relationships can span spec ↔ issue
   - Can be extended to cross-repo

3. **Metadata Field** in relationships:
   ```sql
   metadata TEXT  -- JSON blob for extensibility
   ```
   Can store: `{ "source_repo": "...", "pull_url": "..." }`

4. **JSONL Append-Friendly**:
   - Perfect for federation (just append new lines)
   - No schema migrations needed

5. **Event Trail** (audit trail structure exists):
   ```sql
   git_commit_sha TEXT  -- Track source commit
   source TEXT          -- 'local' | 'git-reconstructed' | 'federated'
   ```

### Potential Extension Points

**For cross-repo linking**:
```sql
-- Extended metadata in relationships
{
  "source_repo": "https://github.com/org/other-repo",
  "source_uuid": "37d447c6-5f01-435d-b7e8-99d689e597f8",
  "federated": true,
  "last_synced": "2025-11-06T12:00:00Z"
}

-- Or new cross_repo_references table:
CREATE TABLE cross_repo_references (
  local_id TEXT,
  local_uuid TEXT,
  local_type TEXT,
  
  remote_repo_url TEXT,
  remote_id TEXT,
  remote_uuid TEXT,
  remote_type TEXT,
  
  relationship_type TEXT,
  created_at DATETIME,
  last_synced DATETIME,
  status TEXT  -- 'active' | 'stale' | 'broken'
);
```

**For federation**:
- Discover other repos via GitHub API or registry
- Sync JSONL from remote repos
- Merge with collision resolution
- Use UUID as canonical identity

---

## 8. Type System

### Core Types (in @sudocode-ai/types)

```typescript
type EntityType = 'spec' | 'issue';
type RelationshipType = 
  | 'blocks' 
  | 'implements' 
  | 'references' 
  | 'depends-on'
  | 'parent-child'
  | 'discovered-from'
  | 'related';

type IssueStatus = 
  | 'open'
  | 'in_progress'
  | 'blocked'
  | 'needs_review'
  | 'closed';

type SpecStatus = 'draft' | 'review' | 'approved' | 'deprecated';  // Not yet in DB

type IssueType = 'bug' | 'feature' | 'task' | 'epic' | 'chore';   // Not yet in DB
type SpecType = 'architecture' | 'api' | 'database' | 'feature' | 'research';

// Core domain models
interface Spec {
  id: string;
  uuid: string;
  title: string;
  content: string;
  priority: number;
  archived: boolean;
  created_at: Date;
  updated_at: Date;
  parent_id?: string;
  relationships: Relationship[];
  tags: string[];
}

interface Issue {
  id: string;
  uuid: string;
  title: string;
  content: string;
  status: IssueStatus;
  priority: number;
  assignee?: string;
  archived: boolean;
  created_at: Date;
  updated_at: Date;
  closed_at?: Date;
  parent_id?: string;
  relationships: Relationship[];
  tags: string[];
}

interface Relationship {
  from_id: string;
  from_uuid: string;
  from_type: EntityType;
  to_id: string;
  to_uuid: string;
  to_type: EntityType;
  relationship_type: RelationshipType;
  created_at: Date;
  metadata?: Record<string, any>;
}

interface IssueFeedback {
  id: string;
  issue_id: string;
  spec_id: string;
  content: string;
  type: 'comment' | 'suggestion' | 'request';
  anchor?: FeedbackAnchor;
}

interface FeedbackAnchor {
  line?: number;
  text?: string;
  status: 'valid' | 'stale';
}
```

---

## Summary: Data Flow

### Creating an Issue

```
1. User/Agent calls MCP: upsert_issue(title, description, ...)
   │
2. MCP Client spawns: sudocode issue create "title" --json
   │
3. CLI Operations (in-process):
   a. Generate ID: ISSUE-042
   b. Insert into SQLite issues table
   c. Insert event record (created)
   │
4. CLI Export (debounced, 5 seconds):
   a. Read from SQLite
   b. Append to issues.jsonl
   │
5. Server (if running):
   a. File watcher detects issues.jsonl change
   b. Broadcast via WebSocket
   c. Update connected UI clients
   │
6. Git Distribution:
   a. User commits: git add .sudocode/issues.jsonl
   b. Git push to remote
   c. Other machines: git pull
   d. Sync service: sudocode sync --from-git
   e. Merged into their SQLite cache
   f. (UUID prevents duplicate creation)
```

### Linking Two Issues

```
1. Agent calls MCP: link(from_id="ISSUE-001", to_id="ISSUE-002", type="blocks")
   │
2. CLI: addRelationship(db, { from_id, to_id, relationship_type })
   │
3. SQLite:
   INSERT INTO relationships (from_id, from_uuid, from_type, to_id, to_uuid, to_type, relationship_type)
   │
4. Auto-update issue status:
   UPDATE issues SET status='blocked' WHERE id='ISSUE-002'
   │
5. Export → JSONL → Git → Distributed
```

---

## Key Architectural Insights

### Strengths

1. **Git-native**: Source of truth is git; perfect for CI/CD integration
2. **Distributed**: No central server; each machine has full state
3. **Decentralized**: Works offline; syncs when connected
4. **AI-Friendly**: CLI + MCP + JSON make it agent-operable
5. **Flexible**: Markdown content is user-structured (no enforced schema)
6. **Audit Trail**: Events table tracks all changes
7. **Smart Anchoring**: Feedback relocates automatically when specs change

### Limitations (for cross-repo scenarios)

1. **No Global ID Authority**: Each repo has own SPEC-001, ISSUE-001
2. **UUID-Based, ID-Queried**: Systems built around sequential IDs
3. **Collision Resolution**: Reference count heuristic may be ambiguous
4. **No Remote Tracking**: JSONL has no "this came from repo X" metadata
5. **Merge Conflict Policy**: "AI handles it" - but no structured conflict resolution

### Ready for Extension

- UUID infrastructure
- Polymorphic relationships
- Metadata blobs in relationships
- Event sourcing foundation
- JSONL append-friendly format

---

## File References

- **Docs**: `/docs/overview.md`, `/docs/data-model.md`, `/docs/storage.md`, `/docs/mcp.md`
- **Types**: `/types/src/schema.ts`
- **CLI**: `/cli/src/operations/` (specs, issues, relationships, feedback)
- **MCP**: `/mcp/src/` (client, server, tools)
- **Server**: `/server/src/` (routes, services, database)
- **Real Data**: `.sudocode/specs.jsonl`, `.sudocode/issues.jsonl`

