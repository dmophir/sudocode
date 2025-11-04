# Sudocode Claude Code Plugin

Claude Code plugin for sudocode - a git-native spec and issue management system for AI-assisted development.

This plugin provides:
- **sudocode MCP Server** - MCP tools to interface with the sudocode CLI
- **sudocode Skill** - Automatic workflow guidance for spec and issue management

## Installation

### Option 1: Local Development

```bash
# In Claude Code, from the sudocode repo root
/plugin marketplace add .
/plugin install sudocode
```

Then restart Claude Code to activate the MCP server.

### Option 2: From GitHub (after publishing)

```bash
# In Claude Code
/plugin marketplace add sudocode-ai/sudocode
/plugin install sudocode
```

## Prerequisites

**Before installing this plugin, you must install sudocode:**

```bash
npm install -g sudocode
```

This installs both the CLI and MCP server that the plugin requires.

**Additional requirements:**
- Node.js 18+ must be installed
- npm must be available in PATH

## Features

### MCP Server

The plugin automatically starts the sudocode MCP server, exposing 9 tools:

**Issue Management:**
- `ready`, `list_issues`, `show_issue`, `upsert_issue`

**Spec Management:**
- `list_specs`, `show_spec`, `upsert_spec`

**Feedback System:**
- `add_feedback`

**Relationships:**
- `link`, `add_reference`

### sudocode Skill

The plugin includes a Claude Code skill that automatically guides workflow:

**Auto-activates when:**
- Starting a development session (checks for ready work)
- Planning features or architecture (suggests creating specs)
- Tracking work items (guides issue management)
- Providing feedback on requirements (uses anchored feedback system)

**Key workflows:**
- Session start protocol (automatic ready work check)
- Spec creation and management
- Issue lifecycle (create → in_progress → blocked/closed)
- Feedback system with smart anchoring
- Relationship management (blocks, implements, depends-on)


## Quick Start

```bash
# 1. Install sudocode globally (required!)
npm install -g sudocode

# 2. Install the plugin (Claude Code)
/plugin marketplace add sudocode-ai/sudocode  # Or: /plugin marketplace add . (for local dev)
/plugin install sudocode

# 3. Restart Claude Code

# 4. Initialize sudocode in your project (if not done already)
sudocode init

# 5. Start using sudocode with Claude: "Show me ready issues and specs"
```

## Using the MCP Server

Once installed, you can ask Claude to use any sudocode tool:

- "Find work ready to work on"
- "Capture the design from our session as a spec"
- "Plan out the implementation of SPEC-002 and break it out into issues"
- "Execute the issues planned for SPEC-002"

Claude will automatically use the appropriate MCP tools.

## Troubleshooting

### Error: "sudocode not found"

The plugin requires the sudocode package to be installed globally:

```bash
npm install -g sudocode
```

After installation, restart Claude Code.

### Verify Installation

Check that sudocode is properly installed:

```bash
# Check sudocode CLI
sudocode --version

# Check MCP server
sudocode-mcp --help
```

Both commands should work. If not, reinstall:

```bash
npm uninstall -g sudocode
npm install -g sudocode
```

### MCP Server Not Starting

1. Ensure sudocode is installed globally (see above)
2. Check Node.js is installed: `node --version` (requires 18+)
3. Check plugin is installed: `/plugin list`
4. Restart Claude Code
5. Check Claude Code logs for errors

### MCP Tools Not Available

1. Ensure plugin is installed: `/plugin list`
2. Check plugin is enabled
3. Restart Claude Code
4. Look for "sudocode" in `/mcp` list

## Links

- [sudocode Repository](https://github.com/sudocode-ai/sudocode)
- [MCP Documentation](https://modelcontextprotocol.io/)
- [Claude Code Docs](https://docs.anthropic.com/claude-code)
