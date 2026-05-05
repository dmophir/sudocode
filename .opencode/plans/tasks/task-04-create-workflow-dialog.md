# Task: Update CreateWorkflowDialog with Model Selector

## Description
Add model selection UI to the workflow creation dialog, including fetching available models and saving user's choice to local config.

## Deliverables

### 1. Add helper types and functions
**File**: `frontend/src/components/workflows/CreateWorkflowDialog.tsx`
- Add `DEFAULT_MODEL_VALUE = '__default__'` constant
- Add `ModelOption` interface with `value` and `label` fields
- Add `formatModelName(modelId: string): string` function
  - Map known models to friendly names (gpt-4o, claude-sonnet, etc.)
  - Format unknown models by replacing hyphens/underscores

### 2. Add state for models
- Add `availableModels: ModelOption[]` state (initially `[DEFAULT_MODEL_OPTION]`)
- Add `modelsLoading: boolean` state

### 3. Fetch models and local config on dialog open
**File**: `frontend/src/components/workflows/CreateWorkflowDialog.tsx`
- In existing useEffect that triggers on `open` change
- Fetch models from `/api/agents/opencode/models`
- Filter out 'default' model, format names
- Fetch local config via `configApi.getLocal()`
- Pre-select `workflowModel` from local config or `__default__`

### 4. Fix buildConfig logic
**File**: `frontend/src/components/workflows/CreateWorkflowDialog.tsx` (lines 394-399)
- Remove engineType check for saving orchestratorModel
- Always save model if explicitly set and not `__default__`

### 5. Add model selector UI
**File**: `frontend/src/components/workflows/CreateWorkflowDialog.tsx`
- Add after Agent Type selector (around line 678)
- Use Select component with availableModels
- Show loading state when modelsLoading is true
- Add helper text: "Model used for workflow step executions"

### 6. Save to local config on submit
**File**: `frontend/src/components/workflows/CreateWorkflowDialog.tsx`
- In handleSubmit, after savePersistedSettings
- If orchestratorModel is set and not `__default__`, call `configApi.updateWorkflowModel()`
- Wrap in try-catch, log warning on failure

## Acceptance Criteria

- [ ] Model selector appears in Advanced Options section
- [ ] Models are fetched from API when dialog opens
- [ ] `__default__` option appears first in dropdown
- [ ] Local config workflowModel is pre-selected as default
- [ ] Model is saved to workflow config if explicitly set
- [ ] Model is saved to local config on workflow creation
- [ ] Loading state shows "Loading models..." while fetching
- [ ] TypeScript compilation succeeds

## Dependencies
- Task 01: LocalConfig type with workflowModel
- Task 02: Backend config endpoints
- Task 03: Frontend configApi methods

## Priority
High

## Estimated Effort
30-40 minutes

## Testing
See test file: `frontend/tests/components/workflows/CreateWorkflowDialog.test.tsx`
