# Task: Add Frontend API Methods for LocalConfig

## Description
Add methods to the frontend API client for interacting with local config endpoints.

## Deliverables

### 1. Add configApi methods
**File**: `frontend/src/lib/api.ts`
- Add `getLocal(): Promise<LocalConfig>` - GET /config/local
- Add `updateLocal(config: Partial<LocalConfig>): Promise<any>` - PUT /config/local
- Add `updateWorkflowModel(model: string | undefined): Promise<any>` - PUT /config/local/workflowModel

## Acceptance Criteria

- [ ] configApi exported from api.ts
- [ ] All three methods use correct HTTP verbs (get/put)
- [ ] Methods return Promise types
- [ ] TypeScript compilation succeeds
- [ ] Methods follow existing API client patterns

## Dependencies
- Task 01: Type definition must exist
- Task 02: Backend endpoints must be available

## Priority
High

## Estimated Effort
5-10 minutes

## Testing
Test via integration with CreateWorkflowDialog and WorkflowDetailPage
