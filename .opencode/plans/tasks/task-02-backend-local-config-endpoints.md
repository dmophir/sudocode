# Task: Add Backend API Endpoints for LocalConfig

## Description
Create GET/PUT endpoints for reading and writing the local config file (.sudocode/config.local.json).

## Deliverables

### 1. Create config utility
**File**: `server/src/utils/config.ts` (NEW FILE)
- Export `readLocalConfig(sudocodeDir: string): LocalConfig` function
- Read config.local.json if exists, return empty object otherwise
- Parse JSON and return LocalConfig type

### 2. Add GET /api/config/local endpoint
**File**: `server/src/routes/config.ts`
- Insert before `return router` statement
- Read local config using helper
- Return 200 with local config JSON
- Return 500 with error on failure

### 3. Add PUT /api/config/local endpoint
**File**: `server/src/routes/config.ts`
- Accept full LocalConfig in request body
- Read existing config, merge with new values
- Write updated config to file
- Return 200 with updated config

### 4. Add PUT /api/config/local/workflowModel endpoint
**File**: `server/src/routes/config.ts`
- Accept `{ workflowModel?: string }` in request body
- Update only workflowModel field in existing config
- Write to file
- Return 200 with updated workflowModel

## Acceptance Criteria

- [ ] GET /api/config/local returns empty object when file doesn't exist
- [ ] GET /api/config/local returns full local config when file exists
- [ ] PUT /api/config/local merges and updates config correctly
- [ ] PUT /api/config/local/workflowModel updates only workflowModel field
- [ ] Error handling returns 500 status with error message
- [ ] All endpoints respect project.sudocodeDir path

## Dependencies
- Task 01: Add workflowModel to LocalConfig Type (type must exist)

## Priority
High

## Estimated Effort
15-20 minutes

## Testing
See test file: `server/tests/unit/routes/config.test.ts`
