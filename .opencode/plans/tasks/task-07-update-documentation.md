# Task: Update Documentation

## Description
Update workflow type documentation to reflect the new model resolution behavior.

## Deliverables

### 1. Update orchestratorModel documentation
**File**: `types/src/workflows.d.ts` (lines 215-217)
- Update JSDoc comment for `orchestratorModel` field
- Add note: "If not set, execution service reads from local config workflowModel (for opencode agent)"

## Acceptance Criteria

- [ ] Documentation clearly explains model resolution order
- [ ] Mentions local config fallback behavior
- [ ] TypeScript compilation succeeds

## Dependencies
- Task 01: LocalConfig type with workflowModel
- Task 06: Execution service model fallback

## Priority
Low

## Estimated Effort
5 minutes

## Notes
This is a documentation-only change to help developers understand the behavior
