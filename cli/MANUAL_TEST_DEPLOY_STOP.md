# Manual Testing Guide: Deploy Stop Confirmation Prompt

This guide describes how to manually test the confirmation prompt for the `sudocode deploy stop` command.

## Feature Overview

The `sudocode deploy stop` command now includes a safety confirmation prompt before stopping deployments. This prevents accidental deletion of codespaces and uncommitted changes.

## Implementation Details

**File:** `cli/src/cli/deploy-commands.ts`

**Key Components:**
- `handleDeployStop()` - Main command handler
- `promptConfirmation()` - Helper function for user confirmation
- CLI flag: `-f, --force` to skip confirmation

## Test Scenarios

### 1. Default Behavior - Show Confirmation Prompt

**Command:**
```bash
sudocode deploy stop <deployment-id>
```

**Expected Output:**
```
⚠  Stop deployment <deployment-id>?
   This will delete the codespace and all uncommitted changes.
   
   Continue? (y/N): 
```

**Test Cases:**
- **Enter 'y'**: Should proceed with stopping the deployment
- **Enter 'yes'**: Should proceed with stopping the deployment  
- **Enter 'n'**: Should display "Cancelled." and exit without stopping
- **Enter 'no'**: Should display "Cancelled." and exit without stopping
- **Press Enter (empty)**: Should display "Cancelled." and exit without stopping
- **Enter anything else**: Should display "Cancelled." and exit without stopping

### 2. Force Flag - Skip Confirmation

**Command:**
```bash
sudocode deploy stop <deployment-id> --force
```

**Expected Behavior:**
- No confirmation prompt should appear
- Should proceed directly to stopping the deployment

**Alternative syntax:**
```bash
sudocode deploy stop <deployment-id> -f
```

### 3. Keyboard Interrupt (Ctrl+C)

**Command:**
```bash
sudocode deploy stop <deployment-id>
```

**Action:** Press `Ctrl+C` during the confirmation prompt

**Expected Behavior:**
- Should treat as "No" and display "Cancelled."
- Should exit cleanly without error

### 4. JSON Output Mode

**Command:**
```bash
sudocode deploy stop <deployment-id> --json
```

**Expected Behavior:**
- No confirmation prompt (JSON mode implies automation)
- Should proceed directly to stopping the deployment
- Output should be in JSON format

### 5. Error Cases

#### Missing Deployment ID
**Command:**
```bash
sudocode deploy stop
```

**Expected Output:**
```
Error: Deployment ID is required
Usage: sudocode deploy stop <id>
```

#### Deployment Not Found
**Command:**
```bash
sudocode deploy stop nonexistent-id
```

**Expected Output:**
```
✗ Deployment not found: nonexistent-id

List deployments with: sudocode deploy list
```

## Code Review Checklist

- [x] Confirmation prompt shows ⚠ warning symbol
- [x] Warning message clearly states consequences
- [x] Prompt defaults to "No" (shows y/N)
- [x] Accepts 'y' and 'yes' as confirmation
- [x] Treats everything else (including empty input) as "No"
- [x] --force flag skips confirmation entirely
- [x] JSON mode skips confirmation
- [x] Ctrl+C is handled gracefully (returns false)
- [x] readline interface is properly cleaned up

## Implementation Notes

### Prompt Format
The prompt uses chalk colors for visual hierarchy:
- Yellow (⚠) for warning symbol
- Cyan for deployment ID
- Yellow for warning message
- Gray for the (y/N) indicator

### Signal Handling
The `promptConfirmation()` function handles:
- `SIGINT` (Ctrl+C) - Treats as cancellation
- `close` event - Treats as cancellation if no answer provided
- Proper cleanup of readline event listeners

### Default Behavior
The implementation uses lowercase comparison:
```javascript
answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes'
```

Any other input (including empty string) resolves to `false`, making "No" the safe default.

## Testing Without Real Deployments

If you want to test the prompt behavior without actually stopping deployments, you can:

1. Mock the DeployOrchestrator in a test environment
2. Use integration tests with a test codespace
3. Add a `--dry-run` flag (future enhancement)

## Future Enhancements

Potential improvements to consider:
- Add `--dry-run` flag to preview what would be stopped
- Add `--yes` or `--assume-yes` flag as alias for `--force`
- Support `SUDOCODE_ASSUME_YES` environment variable
- Show deployment details (branch, repo) in the prompt
- Add confirmation for bulk operations (stop multiple deployments)
