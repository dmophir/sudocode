/**
 * Export service - handles syncing database to JSONL and Markdown files
 */

import type Database from "better-sqlite3";
import { exportToJSONL } from "@sudocode/cli/dist/export.js";
import { syncJSONLToMarkdown } from "@sudocode/cli/dist/sync.js";
import { getAllIssues } from "./issues.js";
import { getAllSpecs } from "./specs.js";
import { getSudocodeDir } from "../utils/sudocode-dir.js";
import * as path from "path";

// Global debouncer state
let exportDebouncer: {
  db: Database.Database;
  timeoutId: NodeJS.Timeout | null;
  pending: boolean;
} | null = null;

/**
 * Initialize or get the export debouncer
 */
function getExportDebouncer(db: Database.Database) {
  if (!exportDebouncer) {
    exportDebouncer = {
      db,
      timeoutId: null,
      pending: false,
    };
  }
  return exportDebouncer;
}

/**
 * Sync all entities from database to markdown files
 */
async function syncAllToMarkdown(db: Database.Database): Promise<void> {
  const outputDir = getSudocodeDir();

  // Sync all issues to markdown
  const issues = getAllIssues(db);
  for (const issue of issues) {
    const mdPath = path.join(outputDir, "issues", `${issue.id}.md`);
    await syncJSONLToMarkdown(db, issue.id, "issue", mdPath);
  }

  // Sync all specs to markdown
  const specs = getAllSpecs(db);
  for (const spec of specs) {
    // Use file_path from database if available
    const mdPath = spec.file_path
      ? path.join(outputDir, spec.file_path)
      : path.join(outputDir, "specs", `${spec.id}.md`);
    await syncJSONLToMarkdown(db, spec.id, "spec", mdPath);
  }
}

/**
 * Execute the full export (JSONL + Markdown)
 */
async function executeFullExport(db: Database.Database): Promise<void> {
  const outputDir = getSudocodeDir();

  // Export to JSONL first
  await exportToJSONL(db, { outputDir });

  // Then sync all entities to markdown
  await syncAllToMarkdown(db);
}

/**
 * Trigger an export to JSONL and Markdown files (debounced)
 * This should be called after any database modifications
 */
export function triggerExport(db: Database.Database): void {
  const debouncer = getExportDebouncer(db);
  debouncer.pending = true;

  if (debouncer.timeoutId) {
    clearTimeout(debouncer.timeoutId);
  }

  debouncer.timeoutId = setTimeout(() => {
    executeFullExport(db).catch((error) => {
      console.error("Export failed:", error);
    });
  }, 2000); // 2 second debounce
}

/**
 * Execute export immediately (bypass debouncing)
 * Exports to both JSONL and Markdown files
 */
export async function executeExportNow(db: Database.Database): Promise<void> {
  await executeFullExport(db);
}

/**
 * Cleanup the export debouncer (cancel pending exports and reset)
 * Should be called when closing the database or during test cleanup
 */
export function cleanupExport(): void {
  if (exportDebouncer) {
    if (exportDebouncer.timeoutId) {
      clearTimeout(exportDebouncer.timeoutId);
    }
    exportDebouncer = null;
  }
}
