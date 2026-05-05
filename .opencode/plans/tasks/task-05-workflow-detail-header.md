# Task: Add Model Selector to Workflow Detail Header

## Description
Add a model selector in the workflow detail page header that allows users to change the model for all workflow executions.

## Deliverables

### 1. Add helper types and functions
**File**: `frontend/src/pages/WorkflowDetailPage.tsx`
- Add `DEFAULT_MODEL_OPTION = { value: '__default__', label: 'Default (Agent Decides)' }`
- Add `ModelOption` interface
- Add `formatModelName(modelId: string): string` function (same as CreateWorkflowDialog)

### 2. Add state for models
- Add `availableModels: ModelOption[]` state
- Add `modelsLoading: boolean` state

### 3. Fetch models on component mount
**File**: `frontend/src/pages/WorkflowDetailPage.tsx`
- Add useEffect that runs on mount
- Fetch models from `/api/agents/opencode/models`
- Format and store in availableModels state

### 4. Add model selector in header
**File**: `frontend/src/pages/WorkflowDetailPage.tsx`
- Insert after branch info badge (after line 356), before worktree controls
- Show Label "Model"
- Use Select component with availableModels
- Value: `workflow.config.orchestratorModel || '__default__'`
- Disabled when: `modelsLoading || workflow.status === 'running'`
- On change: Call `configApi.updateWorkflowModel()` with new value
- Size: `h-8 w-48` for compact header layout

## Acceptance Criteria

- [ ] Model selector appears in workflow detail header
- [ ] Selector shows current model or "Default (Agent Decides)"
- [ ] Models are fetched when component mounts
- [ ] Selector is disabled when workflow is running
- [ ] Selector is disabled while models are loading
- [ ] Changing model updates local config (not workflow config)
- [ ] All workflows respect the local config change
- [ ] TypeScript compilation succeeds

## Dependencies
- Task 01: LocalConfig type with workflowModel
- Task 02: Backend config endpoints
- Task 03: Frontend configApi methods

## Priority
Medium

## Estimated Effort
20-30 minutes

## Testing
See test file: `frontend/tests/pages/WorkflowDetailPage.test.tsx`
