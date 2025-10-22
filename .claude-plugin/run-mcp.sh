#!/bin/bash
# Wrapper script to run sudocode MCP server
# Ensures both CLI and MCP server are properly set up
# Priority order:
# 1. Use installed sudocode-mcp command (from npm package)
# 2. Try local development build
# 3. Build from local source
# 4. Install from npm (when package is published)

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

# 4. Future: Install from npm when package is published
# TODO: Uncomment when sudocode is published on npm
# echo "sudocode not found. Installing from npm..." >&2
# npm install -g sudocode
# if check_sudocode_installed; then
#     echo "sudocode installed successfully" >&2
#     exec sudocode-mcp
# else
#     echo "Error: Installation failed" >&2
#     exit 1
# fi

echo "Error: sudocode not found and cannot build locally." >&2
echo "" >&2
echo "To fix this:" >&2
echo "  • Install from npm: npm install -g sudocode" >&2
echo "  • Or ensure you're in the sudocode repository with source at:" >&2
echo "    - $CLI_DIR" >&2
echo "    - $MCP_DIR" >&2
exit 1
