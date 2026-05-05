# Task: Add Tests

## Description
Add comprehensive test coverage for the local config endpoints and model selector functionality.

## Deliverables

### 1. Backend route tests
**File**: `server/tests/unit/routes/config.test.ts` (NEW FILE)
Test cases for local config endpoints:
- GET /api/config/local - returns empty object when file doesn't exist
- GET /api/config/local - returns local config when file exists
- PUT /api/config/local - updates local config correctly
- PUT /api/config/local/workflowModel - updates workflowModel only

### 2. Execution service tests
**File**: `server/tests/unit/services/execution-service.test.ts`
Add test case:
- When agentType is 'opencode' and config.model is undefined
- And local config has workflowModel set
- Execution should use workflowModel from local config

### 3. CreateWorkflowDialog tests
**File**: `frontend/tests/components/workflows/CreateWorkflowDialog.test.tsx` (NEW FILE)
Test cases:
- Model selector fetches models from API
- Model selector pre-selects workflowModel from local config
- Model selector saves to local config on workflow creation
- Model selector handles '__default__' value correctly

### 4. WorkflowDetailPage tests
**File**: `frontend/tests/pages/WorkflowDetailPage.test.tsx` (NEW FILE)
Test cases:
- Model selector is visible in header
- Model selector is disabled when workflow is running
- Model selector updates local config on change
- Model selector fetches models on mount

## Acceptance Criteria

- [ ] All 4 test files created
- [ ] Backend tests pass (4 route tests + 1 execution service test)
- [ ] Frontend tests pass (4 CreateWorkflowDialog tests + 4 WorkflowDetailPage tests)
- [ ] Tests cover success and error scenarios
- [ ] Tests use proper mocking for API calls
- [ ] Test coverage reports show improvements

## Dependencies
- All implementation tasks (01-06) must be complete

## Priority
Medium

## Estimated Effort
60-90 minutes

## Test Count
- Backend: 5 test cases
- Frontend: 8 test cases
- Total: 13 test cases
