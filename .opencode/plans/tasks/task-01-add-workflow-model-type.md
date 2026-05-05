# Task: Add workflowModel to LocalConfig Type

## Description
Add `workflowModel` field to the LocalConfig type definition to support storing the user's default model choice in machine-specific config.

## Deliverables

### 1. Update LocalConfig interface
**File**: `types/src/index.d.ts`
- Add `workflowModel?: string` field to LocalConfig interface (after `voice?: VoiceSettingsConfig`)
- Add JSDoc comment: `/** Default model for workflow executions (machine-specific) */`

### 2. Update CLI config validation (optional)
**File**: `cli/src/config.ts`
- Add `"workflowModel"` to LOCAL_CONFIG_FIELDS array

## Acceptance Criteria

- [ ] LocalConfig interface includes optional `workflowModel` field
- [ ] TypeScript compilation succeeds without errors
- [ ] Field is marked as machine-specific in documentation
- [ ] CLI config validation includes workflowModel (if updated)

## Dependencies
- None (foundational type change)

## Priority
High

## Estimated Effort
5-10 minutes
