#!/usr/bin/env node
/**
 * Copy frontend build to server dist/public directory
 */

import { cpSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

const frontendDist = join(rootDir, "frontend", "dist");
const serverPublic = join(__dirname, "..", "dist", "public");

if (existsSync(frontendDist)) {
  cpSync(frontendDist, serverPublic, { recursive: true });
  console.log("✓ Frontend copied to dist/public/");
} else {
  console.warn("⚠ Frontend dist not found. Build frontend first:");
  console.warn("  npm run build --workspace=frontend");
}
