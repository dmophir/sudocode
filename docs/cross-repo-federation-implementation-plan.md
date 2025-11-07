# Cross-Repo Federation: Phase 1 Implementation Plan

**Status**: Ready to implement
**Target**: Phase 1 - Read + Write Federation with Manual Approval
**Timeline**: 2-3 weeks
**Last Updated**: 2025-11-07

---

## Decisions Summary

All critical decisions have been made:

| Decision | Choice |
|----------|--------|
| Transport | HTTP REST API |
| Entity IDs | Hybrid (display refs + UUIDs) |
| Trust Model | Untrusted by default |
| Approval UI | CLI |
| A2A Scope | Discover + Query + Mutate |
| Primary Use Case | Microservices |
| Server Requirement | Express server OK |
| Agent Autonomy | Agents approve based on configured options |
| Migration | Support upgrading existing installations |

---

## Phase 1 Scope

### What's Included

✅ **Remote Repository Management**
- Register remote repos with trust levels
- Configure permissions per remote
- List, update, remove remotes

✅ **Cross-Repo References**
- Parse `[[org/repo#issue-042]]` syntax in markdown
- Resolve display refs to canonical UUIDs
- Cache remote entity data locally
- Display cross-repo relationships in CLI/UI

✅ **A2A Protocol (3 message types)**
- `discover`: Capability exchange
- `query`: Fetch remote issues/specs
- `mutate`: Request issue/spec creation in remote repo

✅ **Request/Approval Workflow**
- Incoming requests queued for approval
- CLI commands to approve/reject
- Policy-based auto-approval (configurable)
- Audit logging

✅ **API Endpoints**
- `POST /api/v1/federation/info` - Return capabilities
- `POST /api/v1/federation/query` - Query issues/specs
- `POST /api/v1/federation/mutate` - Create issue/spec
- `GET /api/v1/federation/requests` - List pending requests
- `POST /api/v1/federation/requests/:id/approve` - Approve request

✅ **Database Schema**
- `remote_repos` table
- `cross_repo_references` table
- `cross_repo_requests` table
- `cross_repo_audit_log` table

✅ **Migration Support**
- Schema migration for existing installations
- Backward-compatible changes
- Safe rollback path

### What's Deferred to Phase 2+

⏸️ Web UI for approvals (CLI only in Phase 1)
⏸️ WebSocket subscriptions (Phase 2)
⏸️ `subscribe` and `delegate` A2A messages (Phase 2-3)
⏸️ Background sync workers (Phase 2)
⏸️ Git-native transport (Phase 3)
⏸️ Federated search (Phase 3)

---

## Implementation Tasks

### 1. Database Schema (Week 1, Days 1-2)

#### 1.1 Create Migration File
**File**: `server/src/migrations/007_add_federation.ts`

**Tasks**:
- [ ] Create migration file following existing pattern
- [ ] Add `remote_repos` table with all columns
- [ ] Add `cross_repo_references` table
- [ ] Add `cross_repo_requests` table
- [ ] Add `cross_repo_audit_log` table
- [ ] Add indexes for performance
- [ ] Add down migration for rollback

**Acceptance Criteria**:
- Migration runs successfully on fresh DB
- Migration runs successfully on existing installation
- Down migration reverts all changes
- All foreign keys and constraints work

#### 1.2 Update DB Client Types
**File**: `server/src/db/types.ts`

**Tasks**:
- [ ] Add `RemoteRepo` interface
- [ ] Add `CrossRepoReference` interface
- [ ] Add `CrossRepoRequest` interface
- [ ] Add `CrossRepoAuditLog` interface
- [ ] Export all new types

---

### 2. Core Federation Logic (Week 1, Days 3-5)

#### 2.1 Remote Repository Service
**File**: `server/src/services/remoteRepo.ts`

**Tasks**:
- [ ] `addRemote(url, displayName, trustLevel, permissions)` - Register remote repo
- [ ] `getRemote(url)` - Get remote repo config
- [ ] `listRemotes()` - List all configured remotes
- [ ] `updateRemote(url, updates)` - Update remote config
- [ ] `removeRemote(url)` - Remove remote repo
- [ ] `checkPermission(remoteUrl, operation, context)` - Validate permissions

**Dependencies**: Database migration

#### 2.2 Cross-Repo Reference Service
**File**: `server/src/services/crossRepoRef.ts`

**Tasks**:
- [ ] `parseRef(text)` - Parse `[[org/repo#issue-042]]` → canonical format
- [ ] `resolveRef(displayRef)` - Fetch remote entity data
- [ ] `cacheRemoteEntity(entity, sourceRepo)` - Store in `cross_repo_references`
- [ ] `getRemoteEntity(displayRef)` - Get from cache or fetch
- [ ] `invalidateCache(displayRef)` - Clear cached data

**Dependencies**: Remote repo service

#### 2.3 A2A Message Handlers
**File**: `server/src/services/a2a/index.ts`

**Tasks**:
- [ ] Create base A2A message types (TypeScript interfaces)
- [ ] `handleDiscover(request)` - Return local capabilities
- [ ] `handleQuery(request)` - Query local issues/specs
- [ ] `handleMutate(request)` - Queue mutation request for approval
- [ ] `sendA2AMessage(remoteUrl, message)` - HTTP client for outgoing messages
- [ ] Authentication: Add bearer token to outgoing requests
- [ ] Validation: Verify incoming message signatures/tokens

**Dependencies**: Remote repo service, cross-repo ref service

**Files to create**:
- `server/src/services/a2a/types.ts` - Message type definitions
- `server/src/services/a2a/handlers.ts` - Message handlers
- `server/src/services/a2a/client.ts` - HTTP client for outgoing requests

#### 2.4 Request Approval Service
**File**: `server/src/services/requestApproval.ts`

**Tasks**:
- [ ] `createRequest(fromRepo, operation, payload)` - Create pending request
- [ ] `listPendingRequests()` - Get all pending requests
- [ ] `approveRequest(requestId, approver)` - Execute approved mutation
- [ ] `rejectRequest(requestId, reason, rejector)` - Reject and log
- [ ] `checkAutoApproval(request, policies)` - Check if auto-approve applies
- [ ] `executeApprovedMutation(request)` - Create issue/spec from request

**Dependencies**: A2A handlers, issue/spec services

---

### 3. API Endpoints (Week 2, Days 1-2)

#### 3.1 Federation API Router
**File**: `server/src/routes/federation.ts`

**Tasks**:
- [ ] Create Express router for `/api/v1/federation/*`
- [ ] Add authentication middleware (bearer token validation)
- [ ] Add rate limiting middleware
- [ ] Add audit logging middleware

#### 3.2 Implement Endpoints

**Endpoints to create**:
- [ ] `GET /api/v1/federation/info` → `handleDiscover()`
- [ ] `POST /api/v1/federation/query` → `handleQuery()`
- [ ] `POST /api/v1/federation/mutate` → `handleMutate()`
- [ ] `GET /api/v1/federation/requests` → List pending
- [ ] `GET /api/v1/federation/requests/:id` → Get request details
- [ ] `POST /api/v1/federation/requests/:id/approve` → Approve
- [ ] `POST /api/v1/federation/requests/:id/reject` → Reject

**Error Handling**:
- [ ] Implement RFC 7807 error format
- [ ] Add error codes for each failure type
- [ ] Return appropriate HTTP status codes

#### 3.3 Register Router
**File**: `server/src/index.ts`

**Tasks**:
- [ ] Import federation router
- [ ] Mount at `/api/v1/federation`
- [ ] Add CORS configuration for federation endpoints

---

### 4. CLI Commands (Week 2, Days 3-4)

#### 4.1 Remote Management Commands
**File**: `cli/src/commands/remote.ts`

**Commands to implement**:
```bash
sudocode remote add <url> [--trust=untrusted|verified|trusted] [--name=<name>]
sudocode remote list [--format=table|json]
sudocode remote show <url>
sudocode remote update <url> [--trust=<level>] [--permissions=<json>]
sudocode remote remove <url>
sudocode remote query <url> <entity> [--filters=<json>]
```

**Tasks**:
- [ ] Implement each command
- [ ] Add input validation
- [ ] Pretty-print output (tables, colors)
- [ ] Add `--help` text for each command

#### 4.2 Request Management Commands
**File**: `cli/src/commands/request.ts`

**Commands to implement**:
```bash
sudocode request pending [--format=table|json]
sudocode request show <request-id>
sudocode request approve <request-id> [--comment=<text>]
sudocode request reject <request-id> --reason=<text>
sudocode request create <remote-url> issue --title=<title> [--description=<desc>] [--labels=<csv>]
```

**Tasks**:
- [ ] Implement each command
- [ ] Add interactive approval (show full context, confirm)
- [ ] Support bulk operations (`approve --all`)
- [ ] Add `--help` text

#### 4.3 Update Existing Commands
**Files**: `cli/src/commands/issue.ts`, `cli/src/commands/spec.ts`

**Tasks**:
- [ ] Extend `sudocode issue show <id>` to display cross-repo relationships
- [ ] Extend `sudocode spec show <id>` to display cross-repo refs
- [ ] Add `--cross-repo` flag to list commands to include remote entities

---

### 5. Configuration & Policy Engine (Week 2, Day 5)

#### 5.1 Configuration File Schema
**File**: `.sudocode/federation.config.json`

**Tasks**:
- [ ] Define JSON schema for config file
- [ ] Add validation on load
- [ ] Document all config options
- [ ] Provide default/example config

**Example Structure**:
```json
{
  "enabled": true,
  "local_identity": {
    "url": "github.com/org/my-service",
    "display_name": "My Service"
  },
  "endpoints": {
    "rest": "http://localhost:3000/api/v1"
  },
  "policies": {
    "incoming_requests": {
      "mutate": {
        "auto_approve_conditions": [
          "trust_level === 'trusted' && priority >= 2"
        ]
      }
    }
  }
}
```

#### 5.2 Policy Evaluator
**File**: `server/src/services/policyEngine.ts`

**Tasks**:
- [ ] Load config from `.sudocode/federation.config.json`
- [ ] Parse and validate policy conditions
- [ ] `evaluatePolicy(request, policies)` - Check if auto-approve applies
- [ ] Support condition DSL (e.g., `trust_level === 'trusted' && priority >= 2`)
- [ ] Safe evaluation (sandboxed, no arbitrary code execution)

**Use Library**: Consider `filtrex` or `json-rules-engine` for safe expression evaluation

---

### 6. Cross-Repo Reference Parsing (Week 3, Day 1)

#### 6.1 Markdown Parser Extension
**File**: `server/src/services/markdown/crossRepoParser.ts`

**Tasks**:
- [ ] Extend existing markdown parser
- [ ] Detect `[[org/repo#issue-042]]` pattern with regex
- [ ] Extract all cross-repo refs from content
- [ ] Convert to canonical format (store in `cross_repo_references`)
- [ ] Generate backlinks (both directions)

**Regex Pattern**:
```typescript
const crossRepoRefPattern = /\[\[([a-zA-Z0-9-_]+\/[a-zA-Z0-9-_]+)#(issue|spec)-(\d+)\]\]/g;
```

#### 6.2 Update JSONL Sync
**File**: `server/src/services/sync.ts`

**Tasks**:
- [ ] When syncing markdown → JSONL, extract cross-repo refs
- [ ] Store in `cross_repo_references` table
- [ ] Update issue/spec JSON to include `remote_relationships` array

---

### 7. Migration Script (Week 3, Day 2)

#### 7.1 Create Migration Runner
**File**: `server/src/migrations/index.ts`

**Tasks**:
- [ ] Auto-detect current schema version
- [ ] Run migrations in order
- [ ] Handle failures gracefully (rollback)
- [ ] Add `--dry-run` flag to preview changes

#### 7.2 Update CLI
**File**: `cli/src/commands/migrate.ts`

**Command**:
```bash
sudocode migrate [--dry-run]
```

**Tasks**:
- [ ] Implement migration command
- [ ] Show migration progress
- [ ] Confirm before running (unless `--yes` flag)

---

### 8. Testing (Week 3, Days 3-4)

#### 8.1 Unit Tests

**Files to create**:
- `server/tests/unit/services/remoteRepo.test.ts`
- `server/tests/unit/services/crossRepoRef.test.ts`
- `server/tests/unit/services/a2a/handlers.test.ts`
- `server/tests/unit/services/requestApproval.test.ts`
- `server/tests/unit/services/policyEngine.test.ts`

**Coverage Target**: >80% for all new services

#### 8.2 Integration Tests

**Files to create**:
- `server/tests/integration/federation-api.test.ts`
- `cli/tests/integration/remote-commands.test.ts`
- `cli/tests/integration/request-commands.test.ts`

**Test Scenarios**:
- [ ] Register remote repo, query it, receive results
- [ ] Create cross-repo request, approve it, verify issue created
- [ ] Reject request, verify it's logged and not executed
- [ ] Auto-approval based on policy
- [ ] Cross-repo ref parsing and resolution
- [ ] Permission checks (untrusted repo can't mutate)

#### 8.3 End-to-End Test

**File**: `tests/e2e/cross-repo-workflow.test.ts`

**Scenario**: Two sudocode instances (Repo A and Repo B)
1. Repo A adds Repo B as remote
2. Repo A queries Repo B's issues
3. Repo A requests issue creation in Repo B
4. Repo B receives request, approves it
5. Issue created in Repo B
6. Repo A sees the issue in cross-repo refs

**Setup**: Use two test databases, two servers on different ports

---

### 9. Documentation (Week 3, Day 5)

#### 9.1 User Guide
**File**: `docs/federation-user-guide.md`

**Sections**:
- [ ] Quick start: Set up your first remote repo
- [ ] Configuration reference
- [ ] CLI command reference
- [ ] Common workflows (with examples)
- [ ] Troubleshooting

#### 9.2 API Documentation
**File**: `docs/federation-api.md`

**Sections**:
- [ ] Authentication
- [ ] All endpoints with request/response examples
- [ ] Error codes and handling
- [ ] Rate limits

#### 9.3 Architecture Documentation
**File**: Update `docs/cross-repo-federation.md`

**Tasks**:
- [ ] Mark Phase 1 features as "Implemented"
- [ ] Add diagrams showing data flow
- [ ] Document actual schema (if different from spec)

---

## File Structure

New files to create:

```
server/src/
├── migrations/
│   └── 007_add_federation.ts          [NEW]
├── services/
│   ├── remoteRepo.ts                  [NEW]
│   ├── crossRepoRef.ts                [NEW]
│   ├── requestApproval.ts             [NEW]
│   ├── policyEngine.ts                [NEW]
│   ├── a2a/
│   │   ├── types.ts                   [NEW]
│   │   ├── handlers.ts                [NEW]
│   │   └── client.ts                  [NEW]
│   └── markdown/
│       └── crossRepoParser.ts         [NEW]
├── routes/
│   └── federation.ts                  [NEW]
└── db/
    └── types.ts                       [UPDATE]

cli/src/
├── commands/
│   ├── remote.ts                      [NEW]
│   ├── request.ts                     [NEW]
│   ├── migrate.ts                     [NEW]
│   ├── issue.ts                       [UPDATE]
│   └── spec.ts                        [UPDATE]

.sudocode/
└── federation.config.json             [NEW]

docs/
├── federation-user-guide.md           [NEW]
├── federation-api.md                  [NEW]
└── cross-repo-federation.md           [UPDATE]

tests/
├── server/
│   ├── unit/
│   │   └── services/
│   │       ├── remoteRepo.test.ts     [NEW]
│   │       ├── crossRepoRef.test.ts   [NEW]
│   │       ├── requestApproval.test.ts [NEW]
│   │       ├── policyEngine.test.ts   [NEW]
│   │       └── a2a/
│   │           └── handlers.test.ts   [NEW]
│   └── integration/
│       └── federation-api.test.ts     [NEW]
├── cli/
│   └── integration/
│       ├── remote-commands.test.ts    [NEW]
│       └── request-commands.test.ts   [NEW]
└── e2e/
    └── cross-repo-workflow.test.ts    [NEW]
```

---

## Dependencies

### New NPM Packages

**Server**:
- `json-rules-engine` or `filtrex` - Policy evaluation
- `axios` - HTTP client for A2A messages (if not already used)
- `jsonwebtoken` - For JWT bearer tokens (if not already used)

**CLI**:
- `cli-table3` - Pretty tables for `remote list`, `request pending`
- `inquirer` - Interactive prompts for approvals

Install:
```bash
npm --prefix server install json-rules-engine axios jsonwebtoken
npm --prefix cli install cli-table3 inquirer
```

---

## Testing Strategy

### Unit Tests
- All services in isolation
- Mock database calls
- Mock HTTP requests (use `nock` or similar)

### Integration Tests
- Real database (test instance)
- Real HTTP server
- Test all API endpoints

### E2E Tests
- Two sudocode instances
- Real workflow end-to-end
- Verify data consistency

### Manual Testing Checklist
- [ ] Fresh install, run migration
- [ ] Existing install, run migration, verify no data loss
- [ ] Add remote repo via CLI
- [ ] Query remote repo
- [ ] Create cross-repo request
- [ ] Approve request via CLI
- [ ] Verify issue created in remote
- [ ] Test auto-approval with policy
- [ ] Test permission denial (untrusted repo)

---

## Deployment

### Pre-deployment Checklist
- [ ] All tests passing
- [ ] Code review completed
- [ ] Documentation updated
- [ ] Migration tested on staging DB
- [ ] Performance testing (can handle 100+ remote repos)

### Deployment Steps
1. Backup database
2. Run migration: `sudocode migrate`
3. Restart server
4. Verify federation endpoints respond
5. Monitor logs for errors

### Rollback Plan
1. Stop server
2. Run down migration
3. Restore database from backup
4. Deploy previous version

---

## Success Criteria

Phase 1 is complete when:

✅ **Functional**:
- [ ] Can register remote repos via CLI
- [ ] Can query remote issues/specs
- [ ] Can request issue creation in remote repo
- [ ] Can approve/reject requests via CLI
- [ ] Cross-repo refs parsed and displayed correctly
- [ ] Auto-approval works based on policies
- [ ] All A2A message types work (discover, query, mutate)

✅ **Quality**:
- [ ] >80% test coverage on new code
- [ ] All tests passing
- [ ] No regressions in existing features
- [ ] API response time <500ms (p95)

✅ **Documentation**:
- [ ] User guide published
- [ ] API docs complete
- [ ] Example workflows documented

✅ **Migration**:
- [ ] Existing installations upgrade successfully
- [ ] No data loss
- [ ] Backward compatible

---

## Timeline

| Week | Days | Tasks |
|------|------|-------|
| **Week 1** | Mon-Tue | Database schema & migration |
| | Wed-Fri | Core services (remoteRepo, crossRepoRef, A2A) |
| **Week 2** | Mon-Tue | API endpoints |
| | Wed-Thu | CLI commands |
| | Fri | Config & policy engine |
| **Week 3** | Mon | Cross-repo ref parsing |
| | Tue | Migration script |
| | Wed-Thu | Testing |
| | Fri | Documentation |

**Total**: 15 working days (3 weeks)

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Migration fails on large DBs | High | Test on large dataset, add progress indicator, support resume |
| HTTP performance issues | Medium | Add caching, lazy loading, pagination |
| Policy engine security holes | High | Use sandboxed evaluator, whitelist allowed operations |
| Breaking existing workflows | High | Comprehensive regression testing, feature flag to disable federation |
| Cross-repo refs break markdown | Medium | Make parsing permissive, fall back gracefully on parse errors |

---

## Next Steps

1. **Review this plan** - Any changes needed?
2. **Set up development branch** - Create `feature/cross-repo-federation`
3. **Begin Week 1, Day 1** - Database schema migration
4. **Daily standups** - Track progress, unblock issues
5. **End of Week 1 checkpoint** - Core services working
6. **End of Week 2 checkpoint** - API + CLI functional
7. **End of Week 3** - Phase 1 complete, ready to merge

---

## Questions / Blockers

- [ ] Do we have test environments with multiple sudocode instances?
- [ ] Who will do code reviews?
- [ ] What's the process for deploying to production?
- [ ] Do we need to coordinate with any other teams?

---

**Ready to start implementation!** 🚀
