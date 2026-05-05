# Plan: Make Workflow Model Selection Respect User's Choice

## Summary

Add a model selector to workflow creation and the workflow detail header that:
1. Fetches available models from the opencode agent (reusing existing infrastructure)
2. Stores the user's choice in `.sudocode/config.local.json` (machine-specific)
3. **All workflows** (existing and new) read from local config workflowModel setting
4. Defaults to `__default__` if workflowModel is not set in local config
5. Model selector is always visible but greyed out when workflow is running
6. **Execution service** reads local config when opencode runtime is selected and model is undefined

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend                                                    │
│  - CreateWorkflowDialog: model selector in Advanced Options │
│  - WorkflowDetailPage: model selector in header             │
│  - Fetch models from /api/agents/opencode/models            │
│  - Save to /api/config/local/workflowModel                  │
│  - Read from /api/config/local on dialog open               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Backend                                                     │
│  - New route: GET/PUT /api/config/local                     │
│  - Reads/writes .sudocode/config.local.json                 │
│  - Execution service: reads local config.workflowModel      │
│    when agentType is "opencode" and model is undefined      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Storage                                                     │
│  - .sudocode/config.local.json: workflowModel field         │
│  - Workflow config: orchestratorModel (optional override)   │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Add `workflowModel` to LocalConfig Type

**File**: `types/src/index.d.ts` (LocalConfig interface, line ~382)

```typescript
export interface LocalConfig {
  /** Worktree configuration (machine-specific paths) */
  worktree?: WorktreeConfig;
  /** Editor configuration (personal preference) */
  editor?: EditorConfig;
  /** Voice configuration (personal preference) */
  voice?: VoiceSettingsConfig;
  /** Default model for workflow executions (machine-specific) */
  workflowModel?: string;
  /** Telemetry configuration (machine-specific, gitignored) */
  telemetry?: { ... };
}
```

**Update CLI config fields** (optional, for validation):
**File**: `cli/src/config.ts` (line ~47)

```typescript
const LOCAL_CONFIG_FIELDS: (keyof LocalConfig)[] = [
  "worktree",
  "editor",
  "voice",
  "workflowModel",  // Add this
  "telemetry",
];
```

---

### Step 2: Add Backend API Endpoints for LocalConfig

**File**: `server/src/routes/config.ts`

Add endpoints to read/write the local config file (insert before `return router` on line 186):

```typescript
/**
 * Helper to read config.local.json
 */
function readLocalConfig(sudocodeDir: string): LocalConfig {
  const configPath = path.join(sudocodeDir, "config.local.json");
  if (!existsSync(configPath)) {
    return {};
  }
  return JSON.parse(readFileSync(configPath, "utf-8"));
}

/**
 * Helper to write config.local.json
 */
function writeLocalConfig(
  sudocodeDir: string,
  config: LocalConfig
): void {
  const configPath = path.join(sudocodeDir, "config.local.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

// GET /api/config/local - returns full local config
router.get("/local", (req: Request, res: Response) => {
  try {
    const localConfig = readLocalConfig(req.project!.sudocodeDir);
    res.status(200).json(localConfig);
  } catch (error) {
    console.error("Failed to read local config:", error);
    res.status(500).json({ error: "Failed to read local config" });
  }
});

// PUT /api/config/local - update local config
router.put("/local", (req: Request, res: Response) => {
  try {
    const localConfig = req.body as LocalConfig;
    
    // Read existing config and update
    const existing = readLocalConfig(req.project!.sudocodeDir);
    const updated = { ...existing, ...localConfig };
    
    writeLocalConfig(req.project!.sudocodeDir, updated);
    
    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error("Failed to update local config:", error);
    res.status(500).json({ error: "Failed to update local config" });
  }
});

// PUT /api/config/local/workflowModel - update workflowModel only
router.put("/local/workflowModel", (req: Request, res: Response) => {
  try {
    const { workflowModel } = req.body as { workflowModel?: string };
    
    const existing = readLocalConfig(req.project!.sudocodeDir);
    existing.workflowModel = workflowModel;
    
    writeLocalConfig(req.project!.sudocodeDir, existing);
    
    res.status(200).json({
      success: true,
      data: { workflowModel: existing.workflowModel },
    });
  } catch (error) {
    console.error("Failed to update workflowModel:", error);
    res.status(500).json({ error: "Failed to update workflowModel" });
  }
});
```

---

### Step 3: Add Frontend API Methods for LocalConfig

**File**: `frontend/src/lib/api.ts`

Add methods to interact with the local config endpoints:

```typescript
const configApi = {
  // ... existing methods
  
  /** Get local config */
  getLocal: () => get<LocalConfig>('/config/local'),
  
  /** Update local config */
  updateLocal: (config: Partial<LocalConfig>) => put('/config/local', config),
  
  /** Update workflow model */
  updateWorkflowModel: (model: string | undefined) => 
    put('/config/local/workflowModel', { workflowModel: model }),
};

export { configApi, ... };
```

---

### Step 4: Update CreateWorkflowDialog

**File**: `frontend/src/components/workflows/CreateWorkflowDialog.tsx`

**Prerequisite**: Step 3 must be completed first (add `configApi` to `frontend/src/lib/api.ts`)

**Changes**:

1. **Add model fetching state** (near other state declarations):
```typescript
const [availableModels, setAvailableModels] = useState<ModelOption[]>([DEFAULT_MODEL_OPTION])
const [modelsLoading, setModelsLoading] = useState(true)

const DEFAULT_MODEL_OPTION = { value: '__default__', label: 'Default (Agent Decides)' }
```

2. **Fetch models and local config** (in useEffect):
```typescript
// Fetch models, local config, and branches when dialog opens
useEffect(() => {
  if (!open) return

  let isMounted = true
  let cancelled = false

  const loadData = async () => {
    // Fetch models
    setModelsLoading(true)
    try {
      const response = await axios.get<{ models: string[] }>('/api/agents/opencode/models')
      if (isMounted && !cancelled) {
        const apiModels = response.data.models
          .filter((m: string) => m.toLowerCase() !== 'default')
          .map((m: string) => ({ value: m, label: formatModelName(m) }))
        
        setAvailableModels([DEFAULT_MODEL_OPTION, ...apiModels])
      }
    } catch (error) {
      console.warn('Failed to fetch models:', error)
    } finally {
      if (isMounted && !cancelled) {
        setModelsLoading(false)
      }
    }

    // Fetch local config to get workflowModel - use as default
    try {
      const localConfig = await configApi.getLocal()
      if (isMounted && !cancelled) {
        // Pre-select the configured workflow model from local config
        const defaultModel = localConfig.workflowModel || '__default__'
        setForm(prev => ({ ...prev, orchestratorModel: defaultModel }))
      }
    } catch (error) {
      console.warn('Failed to load local config:', error)
    }
  }

  loadData()

  return () => {
    isMounted = false
    cancelled = true
  }
}, [open])
```

3. **Fix buildConfig** (lines 394-399):
```typescript
// Remove the engineType check - always save model if explicitly set
if (form.orchestratorModel && form.orchestratorModel !== '__default__') {
  config.orchestratorModel = form.orchestratorModel.trim()
}
if (form.engineType === 'orchestrator') {
  config.autonomyLevel = form.autonomyLevel
}
```

4. **Add model selector UI** (after Agent Type, line ~678):
```typescript
{/* Model Selection */}
<div className="space-y-2">
  <Label>Model</Label>
  <Select 
    value={form.orchestratorModel || '__default__'}
    onValueChange={(v) => updateForm('orchestratorModel', v === '__default__' ? '' : v)}
    disabled={modelsLoading}
  >
    <SelectTrigger>
      <SelectValue placeholder={modelsLoading ? 'Loading models...' : 'Select model...'} />
    </SelectTrigger>
    <SelectContent>
      {availableModels.map(model => (
        <SelectItem key={model.value} value={model.value}>
          {model.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
  <p className="text-xs text-muted-foreground">
    Model used for workflow step executions
  </p>
</div>
```

5. **Save to local config on submit** (in handleSubmit):
```typescript
// Save settings to localStorage
savePersistedSettings({ ... })

// Save workflow model to local config if user explicitly selected one
if (form.orchestratorModel && form.orchestratorModel !== '__default__') {
  try {
    await configApi.updateWorkflowModel(form.orchestratorModel)
  } catch (error) {
    console.warn('Failed to save workflow model:', error)
  }
}

await onCreate?.(options)
```

6. **Add helper functions** (at top of file):
```typescript
const DEFAULT_MODEL_VALUE = '__default__'

function formatModelName(modelId: string): string {
  const shortNames: Record<string, string> = {
    'gpt-4o': 'GPT-4o',
    'gpt-4': 'GPT-4',
    'claude-sonnet': 'Claude Sonnet',
    'claude-opus': 'Claude Opus',
  }
  
  if (shortNames[modelId.toLowerCase()]) {
    return shortNames[modelId.toLowerCase()]
  }
  
  return modelId.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

interface ModelOption {
  value: string
  label: string
}
```

---

### Step 5: Add Model Selector to Workflow Detail Header

**File**: `frontend/src/pages/WorkflowDetailPage.tsx`

**Changes**:

Insert model selector in header after line 356 (after branch info badge), before worktree controls on line 360:

1. **Add state for models**:
```typescript
const [availableModels, setAvailableModels] = useState<ModelOption[]>([DEFAULT_MODEL_OPTION])
const [modelsLoading, setModelsLoading] = useState(false)
```

2. **Fetch models on component mount**:
```typescript
useEffect(() => {
  let cancelled = false
  
  async function fetchModels() {
    setModelsLoading(true)
    try {
      const response = await axios.get<{ models: string[] }>('/api/agents/opencode/models')
      if (!cancelled) {
        const apiModels = response.data.models
          .filter((m: string) => m.toLowerCase() !== 'default')
          .map((m: string) => ({ value: m, label: formatModelName(m) }))
        
        setAvailableModels([DEFAULT_MODEL_OPTION, ...apiModels])
      }
    } catch (error) {
      console.warn('Failed to fetch models:', error)
    } finally {
      if (!cancelled) setModelsLoading(false)
    }
  }
  
  fetchModels()
  return () => { cancelled = true }
}, [])
```

3. **Add model selector in header** (insert between line 357 and 361):
```typescript
{/* Model Selector - Always visible, greyed out when running */}
<div className="flex items-center gap-2 mr-4">
  <Label className="text-xs font-medium">Model</Label>
  <Select
    value={workflow.config.orchestratorModel || '__default__'}
    onValueChange={async (newModel) => {
      const modelValue = newModel === '__default__' ? undefined : newModel
      
      // Only update local config - all workflows will respect this setting
      try {
        await configApi.updateWorkflowModel(modelValue)
      } catch (error) {
        console.warn('Failed to update workflow model:', error)
      }
    }}
    disabled={modelsLoading || workflow.status === 'running'}
  >
    <SelectTrigger className="h-8 w-48">
      <SelectValue placeholder={modelsLoading ? 'Loading...' : 'Select model'} />
    </SelectTrigger>
    <SelectContent>
      {availableModels.map(model => (
        <SelectItem key={model.value} value={model.value}>
          {model.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

4. **Add helper functions** (at top of component):
```typescript
const DEFAULT_MODEL_OPTION = { value: '__default__', label: 'Default (Agent Decides)' }

interface ModelOption {
  value: string
  label: string
}

function formatModelName(modelId: string): string {
  const shortNames: Record<string, string> = {
    'gpt-4o': 'GPT-4o',
    'gpt-4': 'GPT-4',
    'claude-sonnet': 'Claude Sonnet',
    'claude-opus': 'Claude Opus',
  }
  
  if (shortNames[modelId.toLowerCase()]) {
    return shortNames[modelId.toLowerCase()]
  }
  
  return modelId.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
```

---

### Step 6: Backend - Execution Service Reads Local Config

**File**: `server/src/utils/config.ts` (new file)

Create utility to read local config:

```typescript
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import type { LocalConfig } from '@sudocode-ai/types';

export function readLocalConfig(sudocodeDir: string): LocalConfig {
  const configPath = path.join(sudocodeDir, 'config.local.json');
  if (!existsSync(configPath)) {
    return {};
  }
  return JSON.parse(readFileSync(configPath, 'utf-8'));
}
```

**File**: `server/src/services/execution-service.ts`

Add logic to read local config when creating execution for opencode agent (apply to **all** opencode executions, not just orchestrator):

```typescript
// At the top of the file, add import
import { readLocalConfig } from '../utils/config.js';

// In createExecution method, early in the function (before line 236):
// For opencode agent, read workflowModel from local config if not explicitly set
let finalModel = config.model;
if (!finalModel && agentType === 'opencode') {
  try {
    const localConfig = readLocalConfig(this.sudocodeDir);
    if (localConfig.workflowModel) {
      finalModel = localConfig.workflowModel;
      console.log(`[ExecutionService] Using workflowModel from local config: ${finalModel}`);
    }
  } catch (error) {
    console.warn('[ExecutionService] Failed to read local config for workflowModel:', error);
  }
}

// Use finalModel in the execution config
const executionConfig = {
  ...config,
  model: finalModel,
  // ... other fields
};
```

---

### Step 7: Update Documentation

**File**: `types/src/workflows.d.ts` (line 215-217)

```typescript
/**
 * Model for agent executions
 * Used by orchestrator (orchestrator engine) or step executions (sequential engine)
 * If not set, execution service reads from local config workflowModel (for opencode agent)
 */
orchestratorModel?: string;
```

---

### Step 8: Add Tests

**Test Files to Create/Update**:

1. **`server/tests/unit/routes/config.test.ts`** - Add tests for local config endpoints:
   - GET /api/config/local - returns empty object when file doesn't exist
   - GET /api/config/local - returns local config when file exists
   - PUT /api/config/local - updates local config
   - PUT /api/config/local/workflowModel - updates workflowModel only

2. **`server/tests/unit/services/execution-service.test.ts`** - Add test for opencode model fallback:
   - When agentType is 'opencode' and config.model is undefined
   - And local config has workflowModel set
   - Execution should use workflowModel from local config

3. **`frontend/tests/components/workflows/CreateWorkflowDialog.test.tsx`** - Add tests for:
   - Model selector fetches models from API
   - Model selector pre-selects workflowModel from local config
   - Model selector saves to local config on workflow creation
   - Model selector handles '__default__' value correctly

4. **`frontend/tests/pages/WorkflowDetailPage.test.tsx`** - Add tests for:
   - Model selector is visible in header
   - Model selector is disabled when workflow is running
   - Model selector updates local config on change
   - Model selector fetches models on mount

---

## Files to Modify (in order)

| File | Lines | Change | Priority |
|------|-------|--------|----------|
| `types/src/index.d.ts` | ~382 | Add `workflowModel` to LocalConfig | High |
| `server/src/routes/config.ts` | +60 lines | Add GET/PUT /api/config/local endpoints (before line 186) | High |
| `server/src/utils/config.ts` | +10 lines | Create with `readLocalConfig` utility | High |
| `server/src/services/execution-service.ts` | +20 lines | Read local config for opencode model (apply to all opencode executions) | High |
| `frontend/src/lib/api.ts` | +10 lines | Add configApi methods | High |
| `frontend/src/components/workflows/CreateWorkflowDialog.tsx` | +80 lines | Model selector UI, fetching, saving | High |
| `frontend/src/pages/WorkflowDetailPage.tsx` | +50 lines | Model selector in header (after line 356) | Medium |
| `cli/src/config.ts` | ~47 | Add `workflowModel` to LOCAL_CONFIG_FIELDS | Low |
| `types/src/workflows.d.ts` | 215-217 | Update documentation | Low |
| **Test files** | +150 lines | Add comprehensive tests | Medium |

---

## Test Coverage Plan

**Unit Tests** (server):
- `config.test.ts`: 4 test cases for local config endpoints
- `execution-service.test.ts`: 1 test case for opencode model fallback

**Unit Tests** (frontend):
- `CreateWorkflowDialog.test.tsx`: 4 test cases for model selector functionality
- `WorkflowDetailPage.test.tsx`: 4 test cases for header model selector

**Integration Tests** (optional but recommended):
- Create workflow with model selection, verify it's saved to local config
- Start workflow with opencode agent, verify it uses local config workflowModel

---

## Key Design Decisions Recap

1. **Local config is source of truth**: All workflows (existing and new) read from `.sudocode/config.local.json` workflowModel setting
2. **No workflow config updates**: When user changes model in header, only local config is updated
3. **Default behavior**: New workflows default to local config workflowModel, or `__default__` if not set
4. **Always visible selector**: Model selector in header is always visible but disabled when workflow is running
5. **Reuses existing model fetching**: Uses the same `/api/agents/opencode/models` endpoint as AgentSettingsDialog
6. **Execution service handles fallback**: For **all** opencode agent executions (not just orchestrator), reads local config when model is undefined
7. **Utility file approach**: `readLocalConfig` extracted to `server/src/utils/config.ts` for clean separation

---

## Related Issues

- Related to spec s-6zuo which fixed model selection for planning issues from a spec
- This extends the fix to workflow executions
