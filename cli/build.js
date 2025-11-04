#!/usr/bin/env node
/**
 * Build script for @sudocode-ai/cli
 * Bundles and minifies the CLI using esbuild
 */

import * as esbuild from "esbuild";
import { chmodSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Common build options for bundled outputs
const bundledOptions = {
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  minify: true,
  sourcemap: true,
  // Keep external dependencies external (not bundled)
  external: [
    "@sudocode-ai/types",
    "better-sqlite3",
    "chalk",
    "chokidar",
    "cli-table3",
    "commander",
    "gray-matter",
    "vite",
  ],
};

// Options for non-bundled library outputs (preserve module structure)
const libraryOptions = {
  bundle: false,
  platform: "node",
  target: "node18",
  format: "esm",
  sourcemap: true,
};

async function build() {
  try {
    console.log("Building CLI...");

    // Build the main CLI entry point (bundled for distribution)
    await esbuild.build({
      ...bundledOptions,
      entryPoints: ["src/cli.ts"],
      outfile: "dist/cli.js",
    });

    // Make CLI executable (shebang is already in source file)
    const cliPath = join(__dirname, "dist/cli.js");
    chmodSync(cliPath, 0o755);

    // Build the main library export (bundled for programmatic use)
    await esbuild.build({
      ...bundledOptions,
      entryPoints: ["src/index.ts"],
      outfile: "dist/index.js",
    });

    // Build all library modules individually (non-bundled) for internal imports
    // This allows other packages to import specific modules like @sudocode-ai/cli/dist/db.js
    const { readdir } = await import("fs/promises");
    const { resolve } = await import("path");

    async function findTsFiles(dir) {
      const entries = await readdir(dir, { withFileTypes: true });
      const files = await Promise.all(
        entries.map(async (entry) => {
          const res = resolve(dir, entry.name);
          if (entry.isDirectory()) {
            return findTsFiles(res);
          } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".spec.ts")) {
            return res;
          }
          return null;
        })
      );
      return files.flat().filter(Boolean);
    }

    const srcFiles = await findTsFiles("src");

    console.log("Building individual library modules...");
    await esbuild.build({
      ...libraryOptions,
      entryPoints: srcFiles,
      outdir: "dist",
      outExtension: { ".js": ".js" },
    });

    // Generate TypeScript declarations (still need tsc for this)
    console.log("Generating type declarations...");
    const { exec } = await import("child_process");
    await new Promise((resolve, reject) => {
      exec("npx tsc --emitDeclarationOnly", (error, stdout, stderr) => {
        if (error) {
          console.error(stderr);
          reject(error);
        } else {
          resolve(stdout);
        }
      });
    });

    console.log("✓ Build complete!");
    console.log("  - CLI: dist/cli.js (bundled & minified)");
    console.log("  - Library: dist/index.js (bundled & minified)");
    console.log("  - Individual modules: dist/**/*.js (non-bundled)");
    console.log("  - Type definitions: dist/**/*.d.ts");
  } catch (error) {
    console.error("Build failed:", error);
    process.exit(1);
  }
}

build();
