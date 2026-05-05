# Plan: Fix Model Dropdown Not Populating in Workflow Creation

## Summary
Fix the model dropdown in `CreateWorkflowDialog` and `WorkflowDetailPage` that only shows "Default" because the API response parsing is incorrect.

---

## Root Cause Identified

**API Response Format** (from `server/src/routes/agents.ts:80-165`):
```typescript
// Returns: { models: string[], cached: boolean, fallback?: boolean }
return res.status(200).json({
  models,
  cached: false,
});
```

**Frontend Bug** (in 2 places):
1. `frontend/src/components/workflows/CreateWorkflowDialog.tsx:405-412`
2. `frontend/src/pages/WorkflowDetailPage.tsx:164-171`

Both files use:
```typescript
const data = await modelsResponse.json()
if (Array.isArray(data)) {  // ❌ WRONG - data is an object, not an array!
  // process data...
}
```

But should use:
```typescript
const data = await modelsResponse.json()
if (data.models && Array.isArray(data.models)) {  // ✅ CORRECT
  // process data.models...
}
```

**Working Example** (for reference):
`frontend/src/components/executions/OpencodeConfigForm.tsx:78-90` uses axios and correctly accesses `data.models`:
```typescript
const response = await axios.get<{ models: string[]; cached: boolean }>(
  '/api/agents/opencode/models'
)
if (data.models && data.models.length > 0) {
  // process data.models...
}
```

---

## Implementation Steps

### Step 1: Fix CreateWorkflowDialog.tsx

**File**: `frontend/src/components/workflows/CreateWorkflowDialog.tsx`

**Location**: Lines 398-430 (in `loadModelsAndConfig` function)

**Current Code** (lines 402-412):
```typescript
// Fetch available models from API
const modelsResponse = await fetch('/api/agents/opencode/models')
if (modelsResponse.ok) {
  const data = await modelsResponse.json()
  if (isMounted && Array.isArray(data)) {  // ❌ BUG
    const models: ModelOption[] = data
      .filter((m: string) => m !== 'default')
      .map((modelId: string) => ({
        value: modelId,
        label: formatModelName(modelId),
      }))
    setAvailableModels([DEFAULT_MODEL_OPTION, ...models])
  }
}
```

**Fixed Code**:
```typescript
// Fetch available models from API
const modelsResponse = await fetch('/api/agents/opencode/models')
if (modelsResponse.ok) {
  const data = await modelsResponse.json()
  if (isMounted && data.models && Array.isArray(data.models)) {  // ✅ FIXED
    const models: ModelOption[] = data.models
      .filter((m: string) => m !== 'default')
      .map((modelId: string) => ({
        value: modelId,
        label: formatModelName(modelId),
      }))
    setAvailableModels([DEFAULT_MODEL_OPTION, ...models])
  }
}
```

---

### Step 2: Fix WorkflowDetailPage.tsx

**File**: `frontend/src/pages/WorkflowDetailPage.tsx`

**Location**: Lines 157-183 (in `fetchModels` useEffect)

**Current Code** (lines 161-171):
```typescript
const modelsResponse = await fetch('/api/agents/opencode/models')
if (modelsResponse.ok) {
  const data = await modelsResponse.json()
  if (Array.isArray(data)) {  // ❌ BUG
    const models: ModelOption[] = data
      .filter((m: string) => m !== 'default')
      .map((modelId: string) => ({
        value: modelId,
        label: formatModelName(modelId),
      }))
    setAvailableModels([DEFAULT_MODEL_OPTION, ...models])
  }
}
```

**Fixed Code**:
```typescript
const modelsResponse = await fetch('/api/agents/opencode/models')
if (modelsResponse.ok) {
  const data = await modelsResponse.json()
  if (data.models && Array.isArray(data.models)) {  // ✅ FIXED
    const models: ModelOption[] = data.models
      .filter((m: string) => m !== 'default')
      .map((modelId: string) => ({
        value: modelId,
        label: formatModelName(modelId),
      }))
    setAvailableModels([DEFAULT_MODEL_OPTION, ...models])
  }
}
```

---

## Files to Modify

| File | Lines | Change | Priority |
|------|-------|--------|----------|
| `frontend/src/components/workflows/CreateWorkflowDialog.tsx` | 405 | Change `Array.isArray(data)` to `data.models && Array.isArray(data.models)` | High |
| `frontend/src/pages/WorkflowDetailPage.tsx` | 164 | Change `Array.isArray(data)` to `data.models && Array.isArray(data.models)` | High |

---

## Testing Approach

### Manual Testing
1. **Create Workflow Dialog**:
   - Open workflow creation dialog
   - Expand "Advanced Options"
   - Verify model dropdown shows available models (not just "Default")
   - Select a model and create workflow
   - Verify model is saved

2. **Workflow Detail Page**:
   - Open a workflow detail page
   - Verify model selector in header shows available models
   - Change model and verify it updates

### Build Verification
```bash
cd frontend
npm run build
```
Should complete without TypeScript errors.

### Test Suite
```bash
cd frontend
npm test -- CreateWorkflowDialog
npm test -- WorkflowDetailPage
```
Existing tests should still pass.

---

## Why This Works

The backend `/api/agents/opencode/models` endpoint returns:
```json
{
  "models": ["gpt-4o", "claude-sonnet-4-20250514", ...],
  "cached": false
}
```

The frontend was checking if the **response object** was an array (always false), instead of checking if the **models property** is an array.

By accessing `data.models` instead of `data`, we correctly extract the array of model IDs.

---

## Related Code (Already Working)

The following components already use the correct pattern:
- `OpencodeConfigForm.tsx` (uses axios, accesses `data.models`)
- `ClaudeCodeConfigForm.tsx` (uses axios, accesses `data.models`)
- `CodexConfigForm.tsx` (uses axios, accesses `data.models`)
- `GeminiConfigForm.tsx` (uses axios, accesses `data.models`)

These can serve as reference implementations.

---

## Estimated Effort
- **Time**: 5-10 minutes
- **Complexity**: Low (2-line fixes)
- **Risk**: Low (affects only model dropdown population)

---

## Acceptance Criteria
- [ ] Model dropdown in CreateWorkflowDialog shows available models
- [ ] Model selector in WorkflowDetailPage shows available models
- [ ] `npm run build` succeeds without errors
- [ ] Existing tests pass
- [ ] Model selection persists correctly
