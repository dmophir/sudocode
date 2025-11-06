# Agent Preset and Configuration System

## Overview

This document specifies the agent preset and configuration system for sudocode. The system enables teams to define reusable agent configurations that can be version-controlled, shared, and executed across multiple agent platforms (Claude Code, Cursor, Gemini CLI, etc.).

## Goals

1. **Team Collaboration**: Enable teams to share standardized agent configurations through git
2. **Consistency**: Provide reproducible agent behavior across executions
3. **Interoperability**: Support multiple agent platforms while maintaining a single source of truth
4. **Security**: Implement fine-grained tool permissions and hook-based validation
5. **Extensibility**: Enable easy addition of new agent types and platforms
6. **Auditability**: Maintain clear configuration history through git

## Architecture

### Directory Structure

```
.sudocode/
├── agents/
│   ├── presets/                    # Team-shareable agent presets
│   │   ├── code-reviewer.agent.md  # Agent preset definition
│   │   ├── test-writer.agent.md
│   │   ├── refactorer.agent.md
│   │   └── security-auditor.agent.md
│   ├── hooks/                      # Lifecycle hooks
│   │   ├── before-execution.sh
│   │   ├── after-execution.sh
│   │   ├── on-error.sh
│   │   └── hooks.config.json       # Hook configuration
│   └── config.json                 # Agent system configuration
├── config.json                     # Main sudocode config (existing)
├── issues.jsonl                    # Issues (existing)
└── specs.jsonl                     # Specs (existing)
```

### Agent Preset Format

Agent presets are defined in `.agent.md` files using YAML frontmatter + Markdown format.

**File naming convention**: `{preset-id}.agent.md`

**Structure**:
```markdown
---
# Agent metadata
id: code-reviewer
name: Code Reviewer
description: Reviews code changes and provides feedback on quality, security, and best practices
version: 1.0.0

# Agent behavior
agent_type: claude-code  # claude-code, codex, cursor, gemini-cli, custom
model: claude-sonnet-4-5  # or haiku-4-5, gpt-4, gemini-pro, etc.

# Tool permissions (allowlist)
tools:
  - Read
  - Grep
  - Glob

# MCP servers (if applicable)
mcp_servers:
  - github
  - linear

# Execution context
max_context_tokens: 200000
isolation_mode: subagent  # subagent, isolated, shared

# Hooks and triggers
hooks:
  before_execution:
    - validate-branch
  after_execution:
    - post-review-comment
  on_error:
    - notify-team

# Platform-specific configs (optional)
platform_configs:
  claude-code:
    compact: true
    plan_first: true
  cursor:
    auto_attach_globs:
      - "**/*.ts"
      - "**/*.tsx"
  gemini-cli:
    isolated: true

# Variables/parameters
variables:
  review_depth: thorough
  focus_areas:
    - security
    - performance
    - readability

# Interoperability metadata
capabilities:
  - code-review
  - static-analysis
protocols:
  - mcp
  - a2a
tags:
  - reviewer
  - quality-assurance
---

# System Prompt

You are a code reviewer agent specializing in TypeScript/JavaScript codebases...

[Full system prompt content]
```

### Agent System Configuration

**File**: `.sudocode/agents/config.json`

```json
{
  "version": "1.0.0",
  "defaults": {
    "agent_type": "claude-code",
    "model": "claude-sonnet-4-5",
    "isolation_mode": "subagent",
    "max_context_tokens": 200000,
    "allow_tool_defaults": false
  },
  "execution": {
    "auto_claim_issues": true,
    "max_concurrent_executions": 3,
    "worktree_mode": "auto",
    "cleanup_on_complete": false
  },
  "hooks": {
    "enabled": true,
    "timeout_ms": 30000,
    "retry_on_failure": true,
    "max_retries": 3
  },
  "interoperability": {
    "mcp_enabled": true,
    "a2a_enabled": false,
    "export_formats": ["claude-code", "cursor", "gemini-cli"]
  },
  "security": {
    "require_approval_for_tools": ["Bash", "Write", "Edit"],
    "sandbox_executions": true,
    "audit_log_enabled": true
  }
}
```

### Hooks Configuration

**File**: `.sudocode/agents/hooks/hooks.config.json`

```json
{
  "version": "1.0.0",
  "hooks": [
    {
      "id": "validate-branch",
      "event": "before_execution",
      "type": "command",
      "command": ".sudocode/agents/hooks/before-execution.sh",
      "matcher": {
        "type": "regex",
        "pattern": ".*"
      },
      "timeout_ms": 5000,
      "required": true,
      "on_failure": "block"
    }
  ],
  "global_env": {
    "SUDOCODE_DIR": "${REPO_ROOT}/.sudocode",
    "SUDOCODE_ISSUE_ID": "${EXECUTION_ISSUE_ID}",
    "SUDOCODE_EXECUTION_ID": "${EXECUTION_ID}"
  }
}
```

## Data Model

### AgentConfig Interface

```typescript
/**
 * Agent configuration for execution
 */
export interface AgentConfig {
  // Core configuration
  preset_id?: string;              // Reference to .sudocode/agents/presets/*.agent.md
  agent_type: AgentType;
  model?: string;

  // System prompt
  system_prompt?: string;          // Inline or loaded from preset

  // Tool permissions
  tools?: string[];                // Allowlist of tools
  mcp_servers?: string[];          // MCP servers to enable

  // Execution context
  max_context_tokens?: number;
  isolation_mode?: 'subagent' | 'isolated' | 'shared';

  // Hooks
  hooks?: {
    before_execution?: string[];
    after_execution?: string[];
    on_error?: string[];
  };

  // Variables/parameters
  variables?: Record<string, any>;

  // Platform-specific configs
  platform_configs?: Record<string, any>;

  // Interoperability
  capabilities?: string[];
  protocols?: string[];
  tags?: string[];
}

export type AgentType =
  | "claude-code"
  | "codex"
  | "cursor"
  | "gemini-cli"
  | "custom";
```

### AgentPreset Interface

```typescript
/**
 * Parsed agent preset from .agent.md file
 */
export interface AgentPreset {
  // Metadata
  id: string;
  name: string;
  description: string;
  version: string;
  file_path: string;

  // Configuration (matches AgentConfig)
  config: AgentConfig;

  // System prompt
  system_prompt: string;

  // File metadata
  created_at: string;
  updated_at: string;
}
```

### Hook Configuration Interfaces

```typescript
/**
 * Hook event types
 */
export type HookEvent =
  | 'before_execution'
  | 'after_execution'
  | 'on_error'
  | 'on_complete'
  | 'on_cancel';

/**
 * Hook matcher types
 */
export type HookMatcherType = 'exact' | 'regex' | 'wildcard';

/**
 * Hook failure behavior
 */
export type HookFailureBehavior = 'block' | 'warn' | 'ignore';

/**
 * Hook configuration
 */
export interface HookConfig {
  id: string;
  event: HookEvent;
  type: 'command' | 'plugin';
  command: string;                    // Path to command or plugin name
  matcher?: {
    type: HookMatcherType;
    pattern: string;
  };
  timeout_ms?: number;
  required?: boolean;
  on_failure?: HookFailureBehavior;
  env?: Record<string, string>;
}

/**
 * Hooks system configuration
 */
export interface HooksConfig {
  version: string;
  hooks: HookConfig[];
  global_env?: Record<string, string>;
}
```

### Updated Execution Interface

The existing `Execution` interface will be extended with agent configuration:

```typescript
export interface Execution {
  // ... existing fields ...

  // Agent configuration
  agent_config?: string | null;    // JSON-serialized AgentConfig
  preset_id?: string | null;       // Reference to preset used
}
```

## CLI Commands

### `sudocode agent create`

Create a new agent preset.

```bash
sudocode agent create <preset-id> [options]

Options:
  --name <name>              Human-readable name
  --description <desc>       Description of agent purpose
  --agent-type <type>        Agent type (claude-code, codex, cursor, gemini-cli)
  --model <model>            Model to use (claude-sonnet-4-5, etc.)
  --tools <tools...>         Comma-separated list of allowed tools
  --template <template>      Use preset template (reviewer, tester, refactorer)
  --interactive, -i          Interactive mode with prompts
```

**Example**:
```bash
sudocode agent create code-reviewer \
  --name "Code Reviewer" \
  --description "Reviews code for quality and security" \
  --agent-type claude-code \
  --model claude-sonnet-4-5 \
  --tools Read,Grep,Glob
```

### `sudocode agent list`

List all available agent presets.

```bash
sudocode agent list [options]

Options:
  --verbose, -v              Show detailed information
  --tag <tag>                Filter by tag
  --type <agent-type>        Filter by agent type
```

### `sudocode agent show`

Display details of a specific agent preset.

```bash
sudocode agent show <preset-id> [options]

Options:
  --format <format>          Output format (text, json, yaml)
```

### `sudocode agent validate`

Validate agent preset configuration.

```bash
sudocode agent validate [preset-id] [options]

Options:
  --all                      Validate all presets
  --fix                      Auto-fix common issues
```

### `sudocode agent export`

Export agent preset to other platform formats.

```bash
sudocode agent export <preset-id> [options]

Options:
  --platform <platform>      Target platform (claude-code, cursor, gemini-cli)
  --output <path>            Output file path
```

### `sudocode execute` (enhanced)

Execute an issue with a specific agent preset.

```bash
sudocode execute <issue-id> [options]

Options:
  --agent <preset-id>        Use specific agent preset
  --model <model>            Override model
  --tools <tools...>         Override tool permissions
  --no-hooks                 Skip hook execution
```

**Example**:
```bash
sudocode execute ISSUE-001 --agent code-reviewer
```

## Implementation Phases

### Phase 1: Core Structure (Current Phase)

**Deliverables**:
1. Add `agents/` directory structure to sudocode init
2. Implement `.agent.md` parser (YAML frontmatter + markdown)
3. Extend type definitions with AgentConfig, AgentPreset interfaces
4. Add CLI commands: `agent create`, `agent list`, `agent show`, `agent validate`

**Files to modify**:
- `types/src/index.d.ts` - Add new interfaces
- `cli/src/operations/agents.ts` - New agent operations module
- `cli/src/cli/agent-commands.ts` - New CLI commands
- `cli/src/init.ts` - Update init to create agents/ structure
- `cli/src/markdown.ts` - Extend for .agent.md parsing

### Phase 2: Preset Library

**Deliverables**:
1. Create default presets (code-reviewer, test-writer, refactorer, documenter)
2. Add preset discovery and loading to execution flow
3. Support inline vs preset-based agent configs
4. Add preset validation with JSON schema

**New files**:
- `.sudocode/agents/presets/code-reviewer.agent.md`
- `.sudocode/agents/presets/test-writer.agent.md`
- `.sudocode/agents/presets/refactorer.agent.md`
- `.sudocode/agents/presets/documenter.agent.md`

### Phase 3: Hooks System

**Deliverables**:
1. Implement hook execution framework
2. Support command and plugin hooks
3. Add hook lifecycle events
4. Implement matcher system (exact, regex, wildcard)

**Files to modify**:
- `cli/src/operations/hooks.ts` - New hooks operations module
- `server/src/execution.ts` - Integrate hooks into execution lifecycle

### Phase 4: Interoperability

**Deliverables**:
1. Add export commands for other platforms
2. Implement MCP server wrapper for agents
3. Support A2A protocol for multi-agent coordination
4. Add platform detection and auto-configuration

**New files**:
- `cli/src/export/claude-code.ts`
- `cli/src/export/cursor.ts`
- `cli/src/export/gemini-cli.ts`

### Phase 5: Advanced Features

**Deliverables**:
1. Agent composition (multi-agent workflows)
2. Dynamic agent selection based on issue type
3. Agent learning/optimization (track success metrics)
4. Team preset marketplace/sharing

## Cross-Platform Interoperability

### Claude Code Export

**Format**: Markdown with YAML frontmatter

```markdown
---
name: code-reviewer
description: Reviews code for quality, security, and best practices
tools: Read, Grep, Glob
---
[System prompt content]
```

**Output location**: Can be placed in `.claude/agents/` for Claude Code consumption

### Cursor Export

**Format**: `.mdc` (Markdown Domain Configuration)

```markdown
---
description: Reviews code for quality, security, and best practices
globs: "**/*.{ts,tsx,js,jsx}"
alwaysApply: false
---
[System prompt content]
```

**Output location**: `.cursor/rules/code-reviewer.mdc`

### Gemini CLI Export

**Format**: JSON configuration in `.gemini/agents/`

```json
{
  "id": "code-reviewer",
  "name": "Code Reviewer",
  "description": "Reviews code for quality, security, and best practices",
  "systemPrompt": "[System prompt content]",
  "tools": ["read", "grep", "glob"],
  "hooks": {
    "beforeExecution": ["validate-branch"],
    "afterExecution": ["post-review-comment"]
  }
}
```

### MCP Server Configuration

**Format**: Standard MCP server config for Claude Desktop, VS Code, etc.

```json
{
  "mcpServers": {
    "sudocode-code-reviewer": {
      "command": "sudocode-agent",
      "args": ["--preset", "code-reviewer"],
      "env": {
        "SUDOCODE_DIR": "${workspaceFolder}/.sudocode"
      }
    }
  }
}
```

## Security Considerations

### Tool Permission Model

- **Allowlist-based**: Agents must explicitly declare required tools
- **Graduated permissions**:
  - **Read-only**: Read, Grep, Glob (safe for reviewers)
  - **Write**: Read, Write, Edit (for implementers)
  - **Execute**: Bash (requires additional approval)
- **User approval**: Sensitive tools can require user confirmation via config

### Hook Security

- **Timeout enforcement**: Hooks must complete within configured timeout
- **Sandboxing**: Hooks run in restricted environment (if enabled)
- **Audit logging**: All hook executions are logged with outcomes
- **Failure handling**: Configurable behavior on hook failure (block/warn/ignore)

### Preset Validation

- **Schema validation**: All presets validated against JSON schema
- **Tool verification**: Ensure referenced tools exist
- **Hook verification**: Ensure referenced hooks exist and are executable
- **Model verification**: Warn if model is unknown/deprecated

## Example Workflows

### Workflow 1: Code Review

```bash
# Create review issue from spec
sudocode issue create --from-spec SPEC-001 --type review

# Execute with code-reviewer preset
sudocode execute ISSUE-001 --agent code-reviewer

# Agent runs with read-only tools, posts feedback to issue
```

### Workflow 2: Multi-Agent Implementation

```bash
# Plan phase: planner agent creates sub-issues
sudocode execute SPEC-001 --agent planner --mode plan

# Implementation phase: coder agents work on sub-issues
sudocode execute ISSUE-002 --agent typescript-coder
sudocode execute ISSUE-003 --agent test-writer

# Review phase: reviewer provides feedback
sudocode execute ISSUE-002 --agent code-reviewer
```

### Workflow 3: Custom Agent for Specific Task

```bash
# Create custom agent preset
sudocode agent create database-migrator \
  --model claude-sonnet-4-5 \
  --tools Read,Write,Bash \
  --description "Creates and runs database migrations"

# Edit the generated .agent.md file
vim .sudocode/agents/presets/database-migrator.agent.md

# Use in execution
sudocode execute ISSUE-005 --agent database-migrator
```

## Migration Path

### For Existing Projects

1. Run `sudocode init --upgrade` to create agents/ structure
2. Existing execution records remain unchanged
3. New executions can optionally use agent presets
4. Team gradually adopts presets for common workflows

### Backward Compatibility

- Executions without agent presets continue to work
- Legacy `agent_type` field in Execution interface maintained
- New `agent_config` and `preset_id` fields are optional
- CLI commands remain backward compatible

## Best Practices

### Preset Design

1. **Single Responsibility**: Each preset should have one clear purpose
2. **Minimal Permissions**: Grant only necessary tools
3. **Clear Documentation**: Comprehensive system prompts with examples
4. **Versioning**: Use semantic versioning for presets
5. **Testing**: Validate presets with test cases

### Team Collaboration

1. **Code Review**: Treat presets like code - review changes
2. **Naming Conventions**: Use descriptive, consistent names
3. **Documentation**: Maintain README in agents/presets/
4. **Sharing**: Commit presets to git for team access
5. **Updates**: Communicate preset changes to team

### Security

1. **Least Privilege**: Start with minimal tools, add as needed
2. **Hook Validation**: Review hook scripts before enabling
3. **Audit Review**: Regularly review execution logs
4. **Sensitive Data**: Never include secrets in presets
5. **Approval Gates**: Require approval for destructive operations

## Future Enhancements

### Agent Composition

Allow presets to reference other presets for complex workflows:

```yaml
workflow:
  - agent: planner
    output: sub-issues
  - agent: implementer
    input: sub-issues
  - agent: reviewer
    input: implementation
```

### Dynamic Agent Selection

Automatically select appropriate agent based on issue metadata:

```yaml
auto_select:
  - condition: tags.includes('security')
    agent: security-auditor
  - condition: tags.includes('refactor')
    agent: refactorer
```

### Learning and Optimization

Track agent performance metrics and suggest optimizations:

```yaml
metrics:
  success_rate: 0.95
  avg_execution_time: 450s
  issues_resolved: 42
```

### Marketplace Integration

Enable sharing of community presets:

```bash
sudocode agent install community/advanced-reviewer
sudocode agent publish my-custom-preset
```

## References

### Standards and Protocols

- **MCP (Model Context Protocol)**: Anthropic's standard for connecting agents to tools
- **A2A (Agent-to-Agent Protocol)**: Linux Foundation standard for agent communication
- **AGNTCY/OASF**: Open Agentic Schema Framework for agent capabilities
- **JSON-RPC 2.0**: Protocol message format for MCP

### Platform Documentation

- Claude Code: https://docs.claude.com/en/docs/claude-code/sub-agents
- Cursor Rules: https://docs.cursor.com/context/rules
- Gemini CLI: https://github.com/google-gemini/gemini-cli

### Related Sudocode Documentation

- [Data Model](./data-model.md) - Core entity types
- [Storage](./storage.md) - JSONL and SQLite architecture
- [MCP](./mcp.md) - MCP server implementation
- [CLI](./cli.md) - Command-line interface

---

**Document Version**: 1.0.0
**Last Updated**: 2025-11-06
**Status**: Implementation Phase 1
