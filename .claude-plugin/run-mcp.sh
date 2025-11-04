#!/bin/bash
# Wrapper script to run sudocode MCP server
# Ensures both CLI and MCP server are properly set up
# Priority order:
# 1. Use installed sudocode-mcp command (from npm package)
# 2. Try local development build
# 3. Build from local source

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR/.."
CLI_DIR="$REPO_ROOT/cli"
MCP_DIR="$REPO_ROOT/mcp"
MCP_DIST="$MCP_DIR/dist/index.js"
CLI_DIST="$CLI_DIR/dist/cli.js"

# Helper function to check if sudocode package is installed
check_sudocode_installed() {
    if command -v sudocode &> /dev/null && command -v sudocode-mcp &> /dev/null; then
        return 0
    fi
    return 1
}

# Helper function to build local workspace
build_local() {
    echo "Building sudocode from local source..." >&2
    cd "$REPO_ROOT"

    # Install workspace dependencies
    if [ ! -d "node_modules" ]; then
        echo "Installing workspace dependencies..." >&2
        npm install
    fi

    # Build all packages
    echo "Building packages..." >&2
    npm run build

    echo "Local build completed successfully." >&2
}

# 1. Try to use installed sudocode-mcp command (preferred)
if check_sudocode_installed; then
    echo "Using installed sudocode package (CLI + MCP server)" >&2
    exec sudocode-mcp
fi

# 2. Check if local build already exists
if [ -f "$MCP_DIST" ] && [ -f "$CLI_DIST" ]; then
    echo "Using local builds (CLI + MCP server)" >&2
    echo "  CLI: $CLI_DIST" >&2
    echo "  MCP: $MCP_DIST" >&2
    exec node "$MCP_DIST"
fi

# 3. Try to build from local source if repository is available
if [ -d "$MCP_DIR" ] && [ -d "$CLI_DIR" ] && [ -f "$REPO_ROOT/package.json" ]; then
    build_local

    # Verify builds succeeded
    if [ -f "$MCP_DIST" ] && [ -f "$CLI_DIST" ]; then
        echo "Running locally built MCP server..." >&2
        exec node "$MCP_DIST"
    else
        echo "Error: Build completed but output files not found." >&2
        exit 1
    fi
fi

echo "Error: sudocode not found" >&2
echo "" >&2
echo "The sudocode plugin requires the sudocode CLI and MCP server to be installed." >&2
echo "" >&2
echo "To install sudocode:" >&2
echo "  npm install -g sudocode" >&2
echo "" >&2
echo "After installation, restart Claude Code for changes to take effect." >&2
echo "" >&2
echo "For more information, visit:" >&2
echo "  https://github.com/sudocode-ai/sudocode" >&2
exit 1
