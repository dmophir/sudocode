#!/usr/bin/env node
/**
 * Build script for sudocode meta-package
 * Copies workspace packages to node_modules for bundleDependencies
 */

import { cpSync, mkdirSync, existsSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

console.log("Building sudocode meta-package...");

// Create node_modules/@sudocode-ai/
const nodeModulesDir = join(__dirname, "node_modules");
const scopeDir = join(nodeModulesDir, "@sudocode-ai");

if (existsSync(nodeModulesDir)) {
  rmSync(nodeModulesDir, { recursive: true, force: true });
}
mkdirSync(scopeDir, { recursive: true });

// Copy workspace packages
const packages = [
  { name: "types", dir: "types" },
  { name: "cli", dir: "cli" },
  { name: "mcp", dir: "mcp" },
  { name: "local-server", dir: "server" },
];

for (const pkg of packages) {
  console.log(`  - Copying @sudocode-ai/${pkg.name}...`);

  const srcDir = join(rootDir, pkg.dir);
  const destDir = join(scopeDir, pkg.name);

  // Copy only the files that would be published (dist/, package.json, README, LICENSE)
  cpSync(srcDir, destDir, {
    recursive: true,
    filter: (src) => {
      const relativePath = src.substring(srcDir.length + 1);

      // Include the directory itself
      if (!relativePath) return true;

      const parts = relativePath.split("/");
      const firstPart = parts[0];

      // Always include package.json, README, LICENSE
      if (
        firstPart === "package.json" ||
        firstPart === "README.md" ||
        firstPart === "LICENSE"
      ) {
        return true;
      }

      // Include dist directory and its contents
      if (firstPart === "dist") {
        return true;
      }

      // Exclude everything else (src, node_modules, tests, etc.)
      return false;
    },
  });

  console.log(`    ✓ Copied`);
}

console.log("");
console.log("✓ Meta-package ready!");
console.log("  All workspace packages copied to node_modules/@sudocode-ai/");
