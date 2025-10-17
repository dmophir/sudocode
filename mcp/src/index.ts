#!/usr/bin/env node

/**
 * Sudograph MCP Server entry point
 */

import { SudographMCPServer } from './server.js';

async function main() {
  const server = new SudographMCPServer();
  await server.run();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
