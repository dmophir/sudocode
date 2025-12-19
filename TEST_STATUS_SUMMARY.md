# Multi-Agent MCP Auto-Injection Test Status Summary

**Issue:** i-5b31: Add comprehensive tests for multi-agent MCP auto-injection
**Spec:** s-64wi: Auto-inject sudocode-mcp MCP Server for Agent Executions
**Date:** 2025-12-19

## Overview

This document summarizes the current status of tests for the multi-agent MCP auto-injection feature. The test suite covers unit tests for detection logic, build configuration, and integration tests for end-to-end execution flows.

---

## Test Coverage Status

### ✅ Unit Tests - MCP Detection

**File:** `server/tests/unit/services/execution-service-mcp-detection.test.ts`
**Status:** ✅ **ALL PASSING** (34/34 tests)

#### detectSudocodeMcp() - ✅ Complete
- ✅ Returns `true` when `sudocode-mcp` is in PATH
- ✅ Returns `false` when `sudocode-mcp` is not in PATH
- ✅ Returns `false` on command execution errors
- ✅ Logs appropriate warnings on failure

#### detectAgentMcp() - Claude Code - ✅ Complete
- ✅ Returns `true` when `~/.claude/settings.json` has `enabledPlugins["sudocode@sudocode-marketplace"]: true`
- ✅ Returns `false` when plugin is disabled or missing
- ✅ Returns `false` when settings.json doesn't exist
- ✅ Returns `true` when settings.json is malformed JSON (conservative behavior)
- ✅ Returns `false` when `enabledPlugins['sudocode@sudocode-marketplace']` is false
- ✅ Returns `false` when plugin key is missing
- ✅ Handles file read errors gracefully (returns `true` - conservative)

#### detectAgentMcp() - Copilot - ✅ Complete
- ✅ Returns `true` when `~/.copilot/mcp-config.json` contains MCP server with `command: "sudocode-mcp"`
- ✅ Works regardless of server name
- ✅ Returns `false` when file doesn't exist
- ✅ Returns `false` when no sudocode-mcp command found
- ✅ Returns `false` when file is malformed JSON
- ✅ Returns `true` when sudocode-mcp has custom server name
- ✅ Handles permission errors gracefully

#### detectAgentMcp() - Codex - ✅ Complete
- ✅ Returns `true` when `~/.codex/config.toml` contains MCP server with `command = "sudocode-mcp"`
- ✅ Works regardless of section name (`[mcp_servers.*]`)
- ✅ Returns `false` when file doesn't exist
- ✅ Returns `false` when no sudocode-mcp command found
- ✅ Returns `false` when file is malformed TOML
- ✅ Returns `true` when sudocode-mcp has custom server name
- ✅ Handles permission errors gracefully

#### detectAgentMcp() - Cursor - ✅ Complete
- ✅ Returns `true` when `.cursor/mcp.json` (in project root) contains MCP server with `command: "sudocode-mcp"`
- ✅ Looks in project root, not home directory
- ✅ Works regardless of server name
- ✅ Returns `false` when file doesn't exist
- ✅ Returns `false` when no sudocode-mcp command found
- ✅ Returns `false` when file is malformed JSON
- ✅ Returns `true` when sudocode-mcp has custom server name

#### Integration with buildExecutionConfig - ✅ Complete
- ✅ Throws error when `detectSudocodeMcp()` returns `false` (package not installed)
- ✅ Adds `sudocode-mcp` to `mcpServers` when `detectAgentMcp()` returns `false`
- ✅ Skips injection when `detectAgentMcp()` returns `true` (plugin configured)
- ✅ Preserves user-provided MCP servers
- ✅ Doesn't duplicate sudocode-mcp if user already provided it

---

### ⚠️ Unit Tests - Build Configuration

**File:** `server/tests/unit/services/execution-service-build-config.test.ts`
**Status:** ⚠️ **MOSTLY PASSING** (26/29 tests passing, 3 failing)

#### Passing Tests - ✅
- ✅ Throws error when `detectSudocodeMcp()` returns `false` (package not installed)
- ✅ Adds `sudocode-mcp` to `mcpServers` when `detectAgentMcp()` returns `false`
- ✅ Skips injection when `detectAgentMcp()` returns `true`
- ✅ Preserves user-provided MCP servers
- ✅ Doesn't duplicate sudocode-mcp if user already provided it
- ✅ Removes sudocode-mcp from CLI config when plugin is detected (Claude Code)
- ✅ Throws error for Cursor when `detectAgentMcp()` returns `false`
- ✅ Error message includes example config for Cursor
- ✅ Cursor error even if user provides mcpServers in config

#### Failing Tests - ❌
- ❌ **Agent defaults merging** - 3 tests failing related to default config merging
  - "should merge agent default config with user config"
  - "should allow user config to override defaults"
  - "should filter undefined values from user config so they don't override defaults"

**Root Cause:** Tests expect `disallowedTools`, `print`, `outputFormat` from agent defaults, but these are not being merged correctly in `buildExecutionConfig`.

**Note:** These failures are NOT related to MCP auto-injection logic - they're about general config merging. The MCP-specific tests are all passing.

---

### ✅ Unit Tests - Worktree MCP Propagation

**File:** `server/tests/unit/execution/worktree/manager.test.ts`
**Status:** ✅ **ALL PASSING** (6/6 propagateCursorConfig tests)

#### propagateCursorConfig() - ✅ Complete
- ✅ `.cursor/mcp.json` is copied from main repo to worktree
- ✅ Works for all agent types
- ✅ Creates `.cursor/` directory if missing
- ✅ Silently skips if source doesn't exist
- ✅ Logs info message on successful copy
- ✅ Logs warning on failure (but doesn't fail worktree creation)
- ✅ Overwrites existing `.cursor/mcp.json` in worktree

---

### ⚠️ Integration Tests - End-to-End Execution

**File:** `server/tests/integration/execution-mcp-injection.test.ts`
**Status:** ⚠️ **MOSTLY PASSING** (14/15 tests passing, 1 failing)

#### Claude Code Agent - ✅ Complete
- ✅ Execution with plugin enabled: sudocode-mcp NOT in CLI config
- ✅ Execution with plugin disabled: sudocode-mcp added to config and passed to executor
- ✅ Execution fails when `sudocode-mcp` package not installed

#### General Execution Tests - ✅ Complete
- ✅ Auto-inject sudocode-mcp when package is installed but plugin not configured
- ✅ Skip injection when plugin already configured
- ✅ Fail with clear error when sudocode-mcp package not installed
- ✅ Verify sudocode MCP tools would be available after auto-injection
- ✅ Preserve user-provided MCP servers alongside auto-injected one

#### Error Scenarios - ✅ Complete
- ✅ Fail with informative error when sudocode-mcp not in PATH
- ✅ Include link to github.com/sudocode-ai/sudocode in error message
- ✅ Don't block execution when detection fails (settings.json read errors)

#### Multi-Execution Types - ✅ Complete
- ✅ Auto-inject for adhoc executions (no issue)
- ✅ Auto-inject for issue-based executions
- ✅ Auto-inject for workflow sub-executions

#### Config Structure - ✅ Complete
- ✅ Pass properly structured config to agent adapter
- ✅ Don't duplicate sudocode-mcp if user already provided it

#### Agent Type Handling - ⚠️ 1 Failing
- ✅ Work with claude-code agent type
- ❌ **Handle other agent types gracefully (extensibility)**

**Failing Test Details:**
```
Test: "should handle other agent types gracefully (extensibility)"
Agents tested: codex, copilot, cursor
Expected: capturedConfig.mcpServers to be undefined
Actual: capturedConfig.mcpServers contains sudocode-mcp

Root Cause: The test expects that for agents other than claude-code,
detectAgentMcp() should return true (safe default) and skip injection.
However, the actual behavior is now detecting and auto-injecting for
codex and copilot agents as well (which is the intended behavior after
implementing i-4pgj, i-2r30, i-2i02).
```

**Fix Required:** Update test expectations to reflect new multi-agent support:
- Copilot: Should auto-inject when not detected in `~/.copilot/mcp-config.json`
- Codex: Should auto-inject when not detected in `~/.codex/config.toml`
- Cursor: Should fail when not detected in `.cursor/mcp.json` (verified passing in other tests)

---

## Missing Test Coverage

### ❌ Integration Tests - Per-Agent E2E Tests

**File:** Should be added to `server/tests/integration/execution-mcp-injection.test.ts`

#### Copilot Agent - ❌ MISSING
- ❌ Execution with MCP configured: sudocode-mcp NOT in CLI config
- ❌ Execution without MCP configured: sudocode-mcp added to config and passed to executor
- ❌ Execution fails when `sudocode-mcp` package not installed

#### Codex Agent - ❌ MISSING
- ❌ Execution with MCP configured: sudocode-mcp NOT in CLI config
- ❌ Execution without MCP configured: sudocode-mcp added to config and passed to executor
- ❌ Execution fails when `sudocode-mcp` package not installed

#### Cursor Agent - ❌ PARTIAL
- ✅ Execution without `.cursor/mcp.json`: fails with helpful error (covered in existing tests)
- ❌ Execution with `.cursor/mcp.json` present: succeeds
- ❌ Execution fails when `sudocode-mcp` package not installed
- ❌ Worktree execution: `.cursor/mcp.json` propagated correctly

---

## Summary Statistics

### Overall Test Coverage

| Category | Passing | Failing | Missing | Total | Status |
|----------|---------|---------|---------|-------|--------|
| **Unit: MCP Detection** | 34 | 0 | 0 | 34 | ✅ Complete |
| **Unit: Build Config** | 26 | 3 | 0 | 29 | ⚠️ 90% |
| **Unit: Worktree Propagation** | 6 | 0 | 0 | 6 | ✅ Complete |
| **Integration: E2E** | 14 | 1 | ~12 | ~27 | ⚠️ 52% |
| **TOTAL** | **80** | **4** | **~12** | **~96** | **⚠️ 83% passing** |

### Test Coverage by Feature

| Feature | Coverage | Status |
|---------|----------|--------|
| **detectSudocodeMcp()** | 100% | ✅ Complete |
| **detectAgentMcp() - Claude Code** | 100% | ✅ Complete |
| **detectAgentMcp() - Copilot** | 100% | ✅ Complete |
| **detectAgentMcp() - Codex** | 100% | ✅ Complete |
| **detectAgentMcp() - Cursor** | 100% | ✅ Complete |
| **buildExecutionConfig()** | 90% | ⚠️ Config merging issues |
| **Worktree .cursor/mcp.json propagation** | 100% | ✅ Complete |
| **E2E Claude Code executions** | 100% | ✅ Complete |
| **E2E Copilot executions** | 0% | ❌ Missing |
| **E2E Codex executions** | 0% | ❌ Missing |
| **E2E Cursor executions** | 30% | ⚠️ Partial |

---

## Action Items

### High Priority - Fix Failing Tests

1. **Fix agent defaults merging in buildExecutionConfig** (3 failing tests)
   - Location: `server/tests/unit/services/execution-service-build-config.test.ts`
   - Tests expect `disallowedTools`, `print`, `outputFormat` from agent defaults
   - Need to verify if `buildExecutionConfig` should merge agent defaults

2. **Update extensibility test expectations** (1 failing test)
   - Location: `server/tests/integration/execution-mcp-injection.test.ts:544-580`
   - Test expects no injection for codex/copilot/cursor
   - Should now expect injection for codex/copilot, error for cursor
   - Split into separate tests per agent type

### Medium Priority - Add Missing Integration Tests

3. **Add Copilot E2E tests** (3 tests)
   - Test MCP configured scenario
   - Test MCP not configured scenario (auto-injection)
   - Test package not installed scenario

4. **Add Codex E2E tests** (3 tests)
   - Test MCP configured scenario
   - Test MCP not configured scenario (auto-injection)
   - Test package not installed scenario

5. **Add Cursor E2E tests** (4 tests)
   - Test `.cursor/mcp.json` present scenario
   - Test package not installed scenario
   - Test worktree propagation in E2E execution
   - Test error handling when config missing

### Low Priority - Enhance Test Coverage

6. **Add edge case tests**
   - Test concurrent detection calls (caching)
   - Test symlinked config files
   - Test config file updates during execution
   - Test multiple MCP servers with same command

---

## Notes

### Why No Adapter Tests?

The `AgentExecutorWrapper` at `server/src/execution/executors/agent-executor-wrapper.ts:173-206` passes the full config (including `mcpServers`) to the library executors. The executors from `agent-execution-engine` library handle CLI argument conversion internally.

We only need to verify:
1. `buildExecutionConfig` adds `mcpServers` to config correctly ✅ (unit tests)
2. End-to-end executions work with auto-injected MCP (integration tests - mostly complete)

### Test Philosophy

- **Unit tests**: Fast, isolated, comprehensive edge case coverage
- **Integration tests**: Slower, end-to-end validation of real execution flows
- **No mocking in integration tests**: Use real ExecutionService, mock only filesystem and process execution

### Recent Changes

- ✅ Implemented detection for all agents (i-4pgj, i-2r30, i-2i02, i-72jq)
- ✅ Unit tests for all detection methods passing
- ⚠️ Integration tests need updates to reflect multi-agent support
- ❌ Missing per-agent E2E tests (Copilot, Codex, Cursor)

---

## Conclusion

**Overall Status:** ⚠️ **83% Complete** - Good foundation, needs finishing touches

The MCP auto-injection feature has strong unit test coverage with 100% of detection logic tested and passing. The main gaps are:

1. **4 failing tests** - 3 related to config merging (not MCP-specific), 1 needs update for multi-agent support
2. **~12 missing integration tests** - Need per-agent E2E tests for Copilot, Codex, and enhanced Cursor tests

**Recommendation:**
- Fix the 4 failing tests first (should be quick fixes)
- Add the missing per-agent integration tests (medium effort, high value)
- Then this issue can be closed as complete

**Test Quality:** Excellent - comprehensive coverage, clear test names, good use of mocking, proper error scenarios.
