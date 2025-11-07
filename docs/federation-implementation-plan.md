# Federation Implementation Plan: API Boundaries & Architecture

**Last Updated**: 2025-11-07
**Status**: Planning Phase
**Target**: Complete Phase 1 - Production-Ready Federation

---

## Executive Summary

This document defines the architectural boundaries, API contracts, and implementation plan for completing the sudocode cross-repository federation system. We've implemented the core services and HTTP API. Remaining work includes CLI commands, cross-repo reference parsing, and integration with existing systems.

---

## System Architecture & Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACES                          │
├──────────────────────────┬──────────────────────────────────────┤
│    CLI Commands          │    Web UI (Future)                   │
│  - sudocode remote       │  - Remote repo management            │
│  - sudocode request      │  - Request approval dashboard        │
└────────────┬─────────────┴────────────┬─────────────────────────┘
             │                          │
             ▼                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API LAYER                                 │
├─────────────────────────┬───────────────────────────────────────┤
│  CLI Client Library     │   HTTP REST API                       │
│  (local function calls) │   /api/v1/federation/*                │
└────────────┬────────────┴────────────┬──────────────────────────┘
             │                         │
             ▼                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SERVICE LAYER                                 │
├─────────────────┬────────────────┬──────────────┬───────────────┤
│ Remote Repo     │ Request        │ A2A          │ Cross-Repo    │
│ Service         │ Approval       │ Handlers     │ Reference     │
│                 │ Service        │              │ Parser        │
└────────┬────────┴────────┬───────┴──────┬───────┴──────┬────────┘
         │                 │              │              │
         ▼                 ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DATA ACCESS LAYER                             │
├────────────────────────┬────────────────────────────────────────┤
│  SQLite Database       │   JSONL Files (CLI managed)            │
│  - Federation tables   │   - Issues/specs with cross-repo refs  │
└────────────────────────┴────────────────────────────────────────┘
```

---

## Component Boundaries

### 1. CLI Layer

**Responsibility**: User-facing command interface

**Boundaries**:
- **IN**: User input (commands, flags, arguments)
- **OUT**: Formatted console output (tables, JSON, errors)
- **Dependencies**: Service layer (direct function calls), HTTP API (for remote operations)

**Does NOT**:
- Directly access database (goes through services)
- Implement business logic (delegates to services)
- Handle HTTP requests (only makes them)

---

### 2. HTTP API Layer

**Responsibility**: HTTP transport for cross-repo communication

**Boundaries**:
- **IN**: HTTP requests (JSON bodies)
- **OUT**: HTTP responses (JSON, RFC 7807 errors)
- **Dependencies**: Service layer (handlers, client, approval)

**Does NOT**:
- Contain business logic (delegates to services)
- Directly access database (goes through services)
- Parse markdown (delegates to parser service)

**API Contract**:
```typescript
// All endpoints return RFC 7807 errors on failure
interface ErrorResponse {
  type: string;      // URI reference
  title: string;     // Human-readable title
  status: number;    // HTTP status code
  detail: string;    // Detailed error message
  instance: string;  // Request path
}

// All A2A messages follow this format
interface A2AMessage {
  type: string;
  from: string;
  to: string;
  timestamp: string;
}
```

---

### 3. Service Layer

**Responsibility**: Core business logic

#### 3.1 Remote Repository Service

**Boundary**:
```typescript
interface RemoteRepoService {
  // Create
  addRemoteRepo(config: RemoteRepoConfig): RemoteRepo;

  // Read
  getRemoteRepo(url: string): RemoteRepo | undefined;
  listRemoteRepos(filters?: RemoteRepoFilters): RemoteRepo[];
  remoteRepoExists(url: string): boolean;

  // Update
  updateRemoteRepo(url: string, updates: Partial<RemoteRepo>): RemoteRepo;

  // Delete
  removeRemoteRepo(url: string): boolean;
}
```

**Responsibilities**:
- Validate remote repo URLs
- Manage trust levels
- Track sync status
- Store capabilities

**Does NOT**:
- Make HTTP requests (uses A2A client)
- Parse markdown
- Approve requests

---

#### 3.2 Request Approval Service

**Boundary**:
```typescript
interface RequestApprovalService {
  // Read
  getRequest(requestId: string): CrossRepoRequest | undefined;
  listPendingRequests(direction?: Direction): CrossRepoRequest[];
  listRequests(filters: RequestFilters): CrossRepoRequest[];

  // Approve/Reject
  approveRequest(requestId: string, approver: string): CrossRepoRequest;
  rejectRequest(requestId: string, reason: string): CrossRepoRequest;

  // Execute
  executeApprovedRequest(requestId: string): CreatedEntity;

  // Update status
  completeRequest(requestId: string, result: any): CrossRepoRequest;
  failRequest(requestId: string, error: string): CrossRepoRequest;
}
```

**Responsibilities**:
- Manage request lifecycle
- Validate approval permissions
- Execute approved mutations
- Track request status

**Does NOT**:
- Create issues/specs directly (delegates to issue/spec services)
- Make HTTP requests
- Evaluate policies (delegates to policy engine)

---

#### 3.3 A2A Handler Service

**Boundary**:
```typescript
interface A2AHandlerService {
  // Incoming message handlers
  handleDiscover(message: A2ADiscoverMessage): A2ADiscoverResponse;
  handleQuery(message: A2AQueryMessage): A2AQueryResponse;
  handleMutate(message: A2AMutateMessage): A2AMutateResponse;

  // Policy evaluation
  shouldAutoApprove(remoteRepo: RemoteRepo, request: any): boolean;
}
```

**Responsibilities**:
- Process incoming A2A messages
- Validate permissions (trust levels)
- Create audit logs
- Queue mutation requests

**Does NOT**:
- Make outgoing HTTP requests (uses A2A client)
- Approve requests (creates pending requests)
- Store remote repo config

---

#### 3.4 A2A Client Service

**Boundary**:
```typescript
interface A2AClientService {
  // Outgoing requests
  discover(remoteUrl: string): Promise<A2ADiscoverResponse>;
  query(remoteUrl: string, query: QueryParams): Promise<A2AQueryResponse>;
  mutate(remoteUrl: string, mutation: MutationParams): Promise<A2AMutateResponse>;

  // Configuration
  setAuthToken(remoteUrl: string, token: string): void;
  setTimeout(ms: number): void;
}
```

**Responsibilities**:
- Make HTTP requests to remote repos
- Handle authentication
- Retry logic and error handling
- Track outgoing requests in database

**Does NOT**:
- Validate business logic (assumes valid input)
- Approve requests
- Parse responses (returns raw A2A messages)

---

#### 3.5 Cross-Repo Reference Parser

**Boundary**:
```typescript
interface CrossRepoRefParser {
  // Parse references from markdown
  parseReferences(markdown: string): CrossRepoRef[];

  // Extract from entity
  extractFromIssue(issueId: string): CrossRepoRef[];
  extractFromSpec(specId: string): CrossRepoRef[];

  // Resolve references
  resolveReference(displayRef: string): ResolvedRef | null;

  // Cache management
  cacheRemoteEntity(ref: CrossRepoRef, data: any): void;
  invalidateCache(ref: CrossRepoRef): void;
}

interface CrossRepoRef {
  displayRef: string;        // "org/repo#issue-042"
  remoteRepo: string;        // "github.com/org/repo"
  entityType: "issue" | "spec";
  entityId: string;          // "issue-042"
  relationshipType: RelationshipType;
}
```

**Responsibilities**:
- Parse `[[org/repo#issue-042]]` syntax
- Extract all cross-repo refs from markdown
- Store in `cross_repo_references` table
- Generate backlinks
- Cache remote entity data

**Does NOT**:
- Fetch remote data (uses A2A client)
- Update markdown (read-only)
- Validate permissions

---

#### 3.6 Audit Service

**Boundary**:
```typescript
interface AuditService {
  // Create logs
  createAuditLog(log: AuditLogInput): Promise<string>;

  // Query logs
  getAuditLogs(remoteRepo: string, limit?: number): AuditLog[];
  getAuditLogsByRequest(requestId: string): AuditLog[];

  // Statistics
  getAuditStats(remoteRepo?: string, since?: string): AuditStats;
}
```

**Responsibilities**:
- Log all cross-repo operations
- Track operation duration
- Generate statistics

**Does NOT**:
- Make decisions based on logs
- Delete logs (append-only)

---

### 4. Data Access Layer

**Boundary**:
```typescript
interface DatabaseAccess {
  // Direct SQL access (used by services only)
  prepare(sql: string): Statement;
  exec(sql: string): void;

  // Transactions
  transaction(callback: () => void): void;
}
```

**Responsibilities**:
- Store data in SQLite
- Enforce schema constraints
- Manage indexes

**Does NOT**:
- Contain business logic
- Validate beyond schema constraints
- Make HTTP requests

---

## Data Flow Diagrams

### Flow 1: User Adds Remote Repository

```
User
  │
  │ sudocode remote add <url>
  ▼
CLI Command
  │
  │ addRemoteRepo(config)
  ▼
RemoteRepoService
  │
  │ INSERT INTO remote_repos
  ▼
Database
  │
  │ RemoteRepo
  ▼
CLI Command
  │
  │ Display success
  ▼
User
```

### Flow 2: Remote Repo Queries Local Issues

```
Remote Repo
  │
  │ POST /api/v1/federation/query
  ▼
HTTP API
  │
  │ handleQuery(message)
  ▼
A2A Handler
  │
  ├─▶ Check trust level (RemoteRepoService)
  │
  ├─▶ Query issues (SELECT FROM issues)
  │
  └─▶ Create audit log (AuditService)
  │
  │ A2AQueryResponse
  ▼
HTTP API
  │
  │ JSON response
  ▼
Remote Repo
```

### Flow 3: User Requests Issue in Remote Repo

```
User
  │
  │ sudocode request create <remote> issue
  ▼
CLI Command
  │
  │ A2AClient.mutate(remote, data)
  ▼
A2A Client
  │
  ├─▶ Create outgoing request (INSERT)
  │
  ├─▶ POST /api/v1/federation/mutate → Remote
  │
  └─▶ Update request status
  │
  │ A2AMutateResponse
  ▼
CLI Command
  │
  │ Display request ID
  ▼
User
  │
  │ sudocode request show <id>
  ▼
CLI Command
  │
  │ RequestApprovalService.getRequest(id)
  ▼
Database
```

### Flow 4: User Approves Incoming Request

```
User
  │
  │ sudocode request pending
  ▼
CLI Command
  │
  │ RequestApprovalService.listPendingRequests()
  ▼
Database
  │
  │ List of pending requests
  ▼
User
  │
  │ sudocode request approve <id>
  ▼
CLI Command
  │
  │ RequestApprovalService.approveRequest(id, user)
  ▼
RequestApprovalService
  │
  ├─▶ Update status to 'approved'
  │
  ├─▶ executeApprovedRequest(id)
  │   │
  │   └─▶ IssueService.createIssue(data)
  │       │
  │       └─▶ INSERT INTO issues
  │
  └─▶ Update status to 'completed'
  │
  │ CreatedEntity
  ▼
CLI Command
  │
  │ Display created issue ID
  ▼
User
```

### Flow 5: Cross-Repo Reference Resolution

```
Markdown File
  │
  │ [[org/repo#issue-042]]
  ▼
File Watcher (detects change)
  │
  │ CrossRepoRefParser.parseReferences(markdown)
  ▼
CrossRepoRefParser
  │
  ├─▶ Extract refs with regex
  │
  ├─▶ For each ref:
  │   │
  │   ├─▶ Parse display ref
  │   │
  │   ├─▶ A2AClient.query(remote, {entity, id})
  │   │
  │   └─▶ cacheRemoteEntity(ref, data)
  │       │
  │       └─▶ INSERT INTO cross_repo_references
  │
  │ CrossRepoRef[]
  ▼
Database
```

---

## API Contracts

### 1. CLI ↔ Service Layer

**Contract**: Direct function calls (TypeScript interfaces)

**CLI responsibilities**:
- Parse user input
- Validate flags and arguments
- Format output (tables, JSON)
- Handle errors gracefully

**Service responsibilities**:
- Implement business logic
- Return structured data
- Throw typed errors

**Example**:
```typescript
// CLI
try {
  const remote = await remoteRepoService.addRemoteRepo({
    url: args.url,
    display_name: args.name,
    trust_level: args.trust || "untrusted",
    ...
  });

  console.log(`✓ Added remote: ${remote.display_name}`);
} catch (error) {
  console.error(`✗ Failed to add remote: ${error.message}`);
  process.exit(1);
}
```

---

### 2. HTTP API ↔ Service Layer

**Contract**: HTTP JSON (REST)

**API responsibilities**:
- Validate HTTP request format
- Map HTTP → service calls
- Map service responses → HTTP
- Return RFC 7807 errors

**Service responsibilities**:
- Accept structured TypeScript objects
- Return structured objects or throw
- No awareness of HTTP

**Example**:
```typescript
// API Route
router.post("/mutate", async (req, res) => {
  try {
    const message = req.body as A2AMutateMessage;

    // Validate (API responsibility)
    if (!message.type || !message.from) {
      return res.status(400).json({
        type: "https://sudocode.dev/errors/bad-request",
        title: "Bad Request",
        status: 400,
        detail: "Missing required fields",
        instance: req.path,
      });
    }

    // Call service
    const response = await a2aHandler.handleMutate(
      db,
      message,
      localRepoUrl
    );

    // Return response
    res.json(response);
  } catch (error) {
    // Map to HTTP error
    res.status(500).json({
      type: "https://sudocode.dev/errors/internal-error",
      title: "Internal Server Error",
      status: 500,
      detail: error.message,
      instance: req.path,
    });
  }
});
```

---

### 3. Service Layer ↔ Data Access

**Contract**: SQL + TypeScript types

**Service responsibilities**:
- Construct SQL queries
- Map database rows → TypeScript objects
- Handle transactions

**Database responsibilities**:
- Store data
- Enforce schema constraints
- Manage indexes

**Example**:
```typescript
// Service
export function getRemoteRepo(
  db: Database.Database,
  url: string
): RemoteRepo | undefined {
  const row = db
    .prepare<[string]>(`SELECT * FROM remote_repos WHERE url = ?`)
    .get(url) as any;

  if (!row) return undefined;

  // Map database row → TypeScript object
  return {
    ...row,
    auto_sync: Boolean(row.auto_sync), // SQLite stores as 0/1
  };
}
```

---

### 4. A2A Client ↔ Remote Repo

**Contract**: HTTP JSON (A2A Protocol)

**Client responsibilities**:
- Construct A2A messages
- Add authentication headers
- Handle timeouts and retries
- Log requests to database

**Remote repo responsibilities**:
- Implement A2A handlers
- Return A2A responses
- Validate trust levels

**Example**:
```typescript
// Client
async discover(remoteUrl: string): Promise<A2ADiscoverResponse> {
  const message: A2ADiscoverMessage = {
    type: "discover",
    from: this.localRepoUrl,
    to: remoteUrl,
    timestamp: new Date().toISOString(),
  };

  const remoteRepo = this.getRemoteRepo(remoteUrl);
  const endpoint = `${remoteRepo.rest_endpoint}/federation/info`;

  const response = await this.httpClient.post<A2ADiscoverResponse>(
    endpoint,
    message,
    {
      headers: this.getAuthHeaders(remoteRepo),
      timeout: this.timeout,
    }
  );

  // Log to audit
  await this.logRequest("discover", remoteUrl, message, response.data);

  return response.data;
}
```

---

## Integration Points

### 1. CLI ↔ Existing Issue/Spec Services

**Integration needed**:
- CLI commands call existing `IssueService` and `SpecService`
- Cross-repo parser integrates with existing markdown sync

**Files to modify**:
- `cli/src/operations/index.ts` - Add cross-repo awareness
- `cli/src/commands/issue.ts` - Show cross-repo relationships
- `cli/src/commands/spec.ts` - Show cross-repo relationships

**New files**:
- `cli/src/commands/remote.ts` - New command group
- `cli/src/commands/request.ts` - New command group

---

### 2. File Watcher ↔ Cross-Repo Parser

**Integration needed**:
- Extend existing file watcher to detect cross-repo refs
- Trigger parser when markdown changes

**Files to modify**:
- `server/src/services/watcher.ts` - Add cross-repo ref detection

**New files**:
- `server/src/services/crossRepoParser.ts` - New parser service

---

### 3. Request Approval ↔ Issue/Spec Creation

**Integration needed**:
- `executeApprovedRequest()` must call actual issue/spec creation
- Currently returns mock data

**Files to modify**:
- `server/src/services/requestApproval.ts` - Integrate with real services

**Dependencies**:
- Need to import `IssueService` and `SpecService` from CLI package
- Or duplicate creation logic in server

---

## Remaining Implementation Tasks

### Task 1: CLI Commands (Priority: HIGH)

**Estimate**: 2 days

**Files to create**:
```
cli/src/commands/remote.ts         (~300 lines)
cli/src/commands/request.ts        (~400 lines)
cli/src/lib/federationClient.ts    (~200 lines)
cli/src/lib/formatters.ts          (~150 lines)
```

**Commands to implement**:
```bash
# Remote management
sudocode remote add <url> [--trust=level] [--name=name] [--endpoint=url]
sudocode remote list [--trust=level] [--format=table|json]
sudocode remote show <url>
sudocode remote update <url> [--trust=level] [--name=name]
sudocode remote remove <url>
sudocode remote discover <url>
sudocode remote query <url> <entity> [--filters=json] [--format=table|json]

# Request management
sudocode request pending [--direction=incoming|outgoing] [--format=table|json]
sudocode request list [--status=status] [--limit=n]
sudocode request show <request-id>
sudocode request create <remote-url> issue --title=<title> [--description=<desc>] [--priority=n]
sudocode request create <remote-url> spec --title=<title> [--content=<path>]
sudocode request approve <request-id> [--comment=<text>]
sudocode request reject <request-id> --reason=<text>
```

**Dependencies**:
- Federation API (✅ complete)
- Remote repo service (✅ complete)
- Request approval service (✅ complete)

**API boundary**:
- CLI makes HTTP requests to local server OR direct service calls
- Decision: **Direct service calls** (same process, faster, simpler)

---

### Task 2: Cross-Repo Reference Parser (Priority: MEDIUM)

**Estimate**: 1 day

**Files to create**:
```
server/src/services/crossRepoParser.ts    (~300 lines)
server/tests/unit/services/crossRepoParser.test.ts  (~200 lines)
```

**Features**:
- Parse `[[org/repo#issue-042]]` syntax
- Support both issues and specs
- Extract relationship type from context
- Cache remote entity data
- Generate backlinks

**Regex pattern**:
```typescript
const CROSS_REPO_REF_PATTERN =
  /\[\[([a-zA-Z0-9-_]+\/[a-zA-Z0-9-_]+)#(issue|spec)-(\d+)\]\]/g;
```

**Integration with watcher**:
```typescript
// In watcher.ts
if (filePath.endsWith('.md')) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const refs = crossRepoParser.parseReferences(content);

  for (const ref of refs) {
    await crossRepoParser.resolveAndCache(ref);
  }
}
```

**Dependencies**:
- A2A client (✅ complete)
- File watcher (⚠️ needs modification)

---

### Task 3: Request Execution Integration (Priority: HIGH)

**Estimate**: 0.5 days

**Files to modify**:
```
server/src/services/requestApproval.ts    (update executeApprovedRequest)
```

**Current state**: Returns mock data
```typescript
const mockId = `${request.request_type === "create_issue" ? "issue" : "spec"}-${Date.now()}`;
```

**Target state**: Actually create issue/spec
```typescript
import { createIssue } from "@sudocode-ai/cli/dist/operations/index.js";

const data = JSON.parse(request.payload);

if (request.request_type === "create_issue") {
  const issue = await createIssue(db, {
    title: data.title,
    content: data.description,
    priority: data.priority,
    labels: data.labels,
  });

  return {
    id: issue.id,
    uuid: issue.uuid,
    canonical_ref: `${request.to_repo}#${issue.id}`,
  };
}
```

**Dependencies**:
- CLI operations (✅ already exist)
- Need to ensure CLI functions are importable by server

---

### Task 4: Documentation (Priority: MEDIUM)

**Estimate**: 1 day

**Files to create**:
```
docs/federation-user-guide.md      (~500 lines)
docs/federation-api-reference.md   (~400 lines)
docs/federation-examples.md        (~300 lines)
```

**Content**:
1. **User Guide**:
   - Quick start
   - Common workflows
   - Troubleshooting

2. **API Reference**:
   - All endpoints documented
   - Request/response examples
   - Error codes

3. **Examples**:
   - Microservices setup
   - Open source collaboration
   - Enterprise multi-team

---

## Implementation Order

### Week 1: Core CLI (Days 1-2)

1. **Day 1 Morning**: `cli/src/commands/remote.ts`
   - Implement all `sudocode remote` commands
   - Test with local server

2. **Day 1 Afternoon**: `cli/src/commands/request.ts` (Part 1)
   - Implement list/show commands
   - Format output nicely

3. **Day 2 Morning**: `cli/src/commands/request.ts` (Part 2)
   - Implement create/approve/reject commands
   - Add interactive confirmation

4. **Day 2 Afternoon**: Request execution integration
   - Fix `executeApprovedRequest()` to actually create issues/specs
   - Test end-to-end workflow

### Week 1: Parser & Docs (Days 3-5)

5. **Day 3**: Cross-repo reference parser
   - Implement parser service
   - Write unit tests
   - Integrate with file watcher

6. **Day 4**: Testing & polish
   - E2E test with two repos
   - Fix any bugs found
   - Performance testing

7. **Day 5**: Documentation
   - Write user guide
   - Write API reference
   - Create examples

---

## Success Criteria

Phase 1 is **production-ready** when:

### ✅ Functional Requirements
- [ ] Users can add/remove remote repos via CLI
- [ ] Users can query remote issues/specs via CLI
- [ ] Users can request issue/spec creation in remote repos via CLI
- [ ] Users can approve/reject incoming requests via CLI
- [ ] Cross-repo references like `[[org/repo#issue-042]]` are parsed and cached
- [ ] Remote entity data is displayed in issue/spec views
- [ ] All audit logs are captured

### ✅ Quality Requirements
- [ ] >80% test coverage on all new code
- [ ] All tests passing (unit, integration, E2E)
- [ ] No regressions in existing features
- [ ] API response time <500ms (p95)
- [ ] Documentation complete (user guide + API reference)

### ✅ Security Requirements
- [ ] Trust levels enforced
- [ ] Untrusted repos cannot mutate
- [ ] All cross-repo operations audited
- [ ] Secrets managed securely

### ✅ User Experience
- [ ] CLI commands intuitive and discoverable
- [ ] Error messages clear and actionable
- [ ] Help text comprehensive
- [ ] Output formatted nicely (tables, colors)

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| CLI performance slow for remote ops | Medium | Low | Add caching, async operations |
| Cross-repo ref parsing breaks existing markdown | High | Low | Extensive testing, safe regex |
| Issue/spec creation integration complex | Medium | Medium | Use existing CLI operations, well-tested |
| User confusion with trust levels | Medium | Medium | Good documentation, clear defaults |
| Network failures break UX | Medium | High | Timeouts, retries, graceful degradation |

---

## Open Questions

1. **CLI Architecture**: Should CLI commands make HTTP requests to local server or direct service calls?
   - **Recommendation**: Direct service calls (same process, faster)

2. **Cross-repo ref caching**: How long should cached data be valid?
   - **Recommendation**: 5 minutes TTL, manual refresh command

3. **Request notifications**: Should we notify users of incoming requests?
   - **Recommendation**: Phase 2 (email/Slack integration)

4. **Bulk operations**: Should we support approving multiple requests at once?
   - **Recommendation**: Yes, add `--all` flag

5. **Conflict resolution**: What happens if remote entity changes after being cached?
   - **Recommendation**: Show cache timestamp, allow manual refresh

---

## Next Steps

1. **Review this plan** - Any feedback/changes?
2. **Begin Task 1**: Implement CLI commands
3. **Daily check-ins**: Track progress, unblock issues
4. **End of Day 2**: Core CLI working
5. **End of Week**: Phase 1 production-ready

---

## Appendix: Example Workflows

### Workflow 1: Add Remote & Query Issues

```bash
# Add remote repository
$ sudocode remote add github.com/org/api-service \
    --name "API Service" \
    --trust verified \
    --endpoint https://api-service.dev/api/v1

✓ Added remote: API Service (github.com/org/api-service)
  Trust level: verified
  Endpoint: https://api-service.dev/api/v1

# List remotes
$ sudocode remote list

┌──────────────────────────────┬─────────────┬──────────┬────────────┐
│ URL                          │ Name        │ Trust    │ Status     │
├──────────────────────────────┼─────────────┼──────────┼────────────┤
│ github.com/org/api-service   │ API Service │ verified │ unknown    │
└──────────────────────────────┴─────────────┴──────────┴────────────┘

# Discover capabilities
$ sudocode remote discover github.com/org/api-service

✓ Discovered capabilities:
  Protocols: rest
  Operations: query_specs, query_issues, create_issues
  Version: 1.0

# Query open issues
$ sudocode remote query github.com/org/api-service issue \
    --filters '{"status":"open","priority":[0,1]}'

┌──────────┬─────────────────────────────────┬──────────┬──────────┐
│ ID       │ Title                           │ Status   │ Priority │
├──────────┼─────────────────────────────────┼──────────┼──────────┤
│ issue-42 │ Add authentication endpoint     │ open     │ 0        │
│ issue-50 │ Fix memory leak in handler      │ open     │ 1        │
└──────────┴─────────────────────────────────┴──────────┴──────────┘
```

### Workflow 2: Request Issue Creation

```bash
# Create request
$ sudocode request create github.com/org/api-service issue \
    --title "Add user profile endpoint" \
    --description "Frontend needs GET /api/users/:id" \
    --priority 2 \
    --labels "api,frontend-request"

✓ Request created: req-abc123
  Status: pending_approval
  Remote repo: github.com/org/api-service

  The API Service team will review your request.
  Track status: sudocode request show req-abc123

# Check status later
$ sudocode request show req-abc123

Request: req-abc123
  Direction: outgoing
  From: github.com/org/frontend
  To: github.com/org/api-service
  Type: create_issue
  Status: completed

  Created:
    ID: issue-084
    UUID: 7c9e6679-7425-40de-944b-e07fc1f90ae7
    Ref: org/api-service#issue-084
    URL: https://api-service.dev/issues/issue-084
```

### Workflow 3: Approve Incoming Request

```bash
# List pending requests
$ sudocode request pending --direction incoming

┌──────────────┬──────────────────────────────────┬───────────────────────┬─────────────┐
│ Request ID   │ Title                            │ From                  │ Created     │
├──────────────┼──────────────────────────────────┼───────────────────────┼─────────────┤
│ req-xyz789   │ Add user profile endpoint        │ github.com/org/frontend│ 2 mins ago  │
└──────────────┴──────────────────────────────────┴───────────────────────┴─────────────┘

# Show details
$ sudocode request show req-xyz789

Request: req-xyz789
  Direction: incoming
  From: github.com/org/frontend
  Type: create_issue
  Status: pending

  Data:
    Title: Add user profile endpoint
    Description: Frontend needs GET /api/users/:id
    Priority: 2
    Labels: api, frontend-request

  Commands:
    Approve: sudocode request approve req-xyz789
    Reject:  sudocode request reject req-xyz789 --reason "Out of scope"

# Approve
$ sudocode request approve req-xyz789

✓ Request approved and executed

  Created issue: issue-084
  UUID: 7c9e6679-7425-40de-944b-e07fc1f90ae7

  View: sudocode issue show issue-084
```

---

**End of Implementation Plan**
