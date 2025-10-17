/**
 * CLI handlers for sync commands
 */

import chalk from 'chalk';
import type Database from 'better-sqlite3';
import { exportToJSONL } from '../export.js';
import { importFromJSONL } from '../import.js';

export interface CommandContext {
  db: Database.Database;
  outputDir: string;
  jsonOutput: boolean;
}

export interface SyncOptions {
  watch?: boolean;
  fromMarkdown?: boolean;
  toMarkdown?: boolean;
}

export async function handleSync(
  ctx: CommandContext,
  options: SyncOptions
): Promise<void> {
  console.log(chalk.yellow('Not yet implemented: sync'));
  console.log('Options:', options);
}

export interface ExportOptions {
  output: string;
}

export async function handleExport(
  ctx: CommandContext,
  options: ExportOptions
): Promise<void> {
  try {
    await exportToJSONL(ctx.db, { outputDir: options.output });

    if (ctx.jsonOutput) {
      console.log(JSON.stringify({ success: true, outputDir: options.output }, null, 2));
    } else {
      console.log(chalk.green('✓ Exported to JSONL'));
      console.log(chalk.gray(`  Output: ${options.output}`));
    }
  } catch (error) {
    console.error(chalk.red('✗ Failed to export'));
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

export interface ImportOptions {
  input: string;
}

export async function handleImport(
  ctx: CommandContext,
  options: ImportOptions
): Promise<void> {
  try {
    await importFromJSONL(ctx.db, { inputDir: options.input });

    if (ctx.jsonOutput) {
      console.log(JSON.stringify({ success: true, inputDir: options.input }, null, 2));
    } else {
      console.log(chalk.green('✓ Imported from JSONL'));
      console.log(chalk.gray(`  Input: ${options.input}`));
    }
  } catch (error) {
    console.error(chalk.red('✗ Failed to import'));
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
