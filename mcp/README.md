# sudograph-mcp

MCP server for [Sudograph](https://github.com/yourusername/sudograph) spec and issue management system.
Enables AI agents to manage specs, issues, and feedback using the Model Context Protocol.

## Installation

```bash
npm install sudograph-mcp
```

## Configuration

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "sudograph": {
      "command": "sudograph-mcp"
    }
  }
}
```

With custom settings:

```json
{
  "mcpServers": {
    "sudograph": {
      "command": "sudograph-mcp",
      "env": {
        "SUDOGRAPH_WORKING_DIR": "/path/to/project",
        "SUDOGRAPH_PATH": "/custom/path/to/sg"
      }
    }
  }
}
```

## Environment Variables

- `SUDOGRAPH_PATH` - Path to `sg` CLI (default: auto-discover from PATH)
- `SUDOGRAPH_DB` - Path to database file (default: auto-discover)
- `SUDOGRAPH_WORKING_DIR` - Working directory for commands (default: process.cwd())
- `SUDOGRAPH_ACTOR` - Actor name for audit trail (default: process.env.USER)

## Prerequisites

Requires Sudograph CLI (`sg`) to be installed and available in PATH.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Development mode with watch
npm run dev
```

## License

MIT
