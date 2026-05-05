# Task: Backend - Execution Service Reads Local Config

## Description
Update the execution service to read workflowModel from local config when creating opencode agent executions.

## Deliverables

### 1. Import readLocalConfig utility
**File**: `server/src/services/execution-service.ts`
- Add import: `import { readLocalConfig } from '../utils/config.js';`

### 2. Add model fallback logic
**File**: `server/src/services/execution-service.ts`
- In `createExecution` method, early in the function (before line 236)
- Add logic to determine `finalModel`:
  ```typescript
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
  ```
- Use `finalModel` in execution config instead of `config.model`

### 3. Apply to all opencode executions
- Logic applies to ALL opencode agent executions, not just orchestrator engine
- Check `agentType === 'opencode'`, not engine type

## Acceptance Criteria

- [ ] Execution service imports readLocalConfig utility
- [ ] Model fallback logic runs for opencode agent executions
- [ ] workflowModel from local config is used when config.model is undefined
- [ ] Original config.model takes precedence if explicitly set
- [ ] Error handling logs warning but doesn't crash
- [ ] Console log shows which model is being used
- [ ] TypeScript compilation succeeds

## Dependencies
- Task 01: LocalConfig type with workflowModel
- Backend utils/config.ts file created in Task 02

## Priority
High

## Estimated Effort
15-20 minutes

## Testing
See test file: `server/tests/unit/services/execution-service.test.ts`
