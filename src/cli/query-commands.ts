/**
 * CLI handlers for query commands (ready, blocked)
 */

import chalk from 'chalk';
import type Database from 'better-sqlite3';
import { getReadySpecs } from '../operations/specs.js';
import { getReadyIssues, getBlockedIssues } from '../operations/issues.js';

export interface CommandContext {
  db: Database.Database;
  outputDir: string;
  jsonOutput: boolean;
}

export interface ReadyOptions {
  specs?: boolean;
  issues?: boolean;
}

export async function handleReady(
  ctx: CommandContext,
  options: ReadyOptions
): Promise<void> {
  try {
    const showSpecs = options.specs || (!options.specs && !options.issues);
    const showIssues = options.issues || (!options.specs && !options.issues);

    const results: any = {};

    if (showSpecs) {
      results.specs = getReadySpecs(ctx.db);
    }
    if (showIssues) {
      results.issues = getReadyIssues(ctx.db);
    }

    if (ctx.jsonOutput) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      if (showSpecs && results.specs) {
        if (results.specs.length === 0) {
          console.log(chalk.gray('\nNo ready specs'));
        } else {
          console.log(chalk.bold(`\nReady Specs (${results.specs.length}):\n`));
          for (const spec of results.specs) {
            console.log(chalk.cyan(spec.id), spec.title);
            console.log(chalk.gray(`  Type: ${spec.type} | Priority: ${spec.priority}`));
          }
        }
      }

      if (showIssues && results.issues) {
        if (results.issues.length === 0) {
          console.log(chalk.gray('\nNo ready issues'));
        } else {
          console.log(chalk.bold(`\nReady Issues (${results.issues.length}):\n`));
          for (const issue of results.issues) {
            const assigneeStr = issue.assignee ? chalk.gray(`@${issue.assignee}`) : '';
            console.log(chalk.cyan(issue.id), issue.title, assigneeStr);
            console.log(chalk.gray(`  Type: ${issue.issue_type} | Priority: ${issue.priority}`));
          }
        }
      }
      console.log();
    }
  } catch (error) {
    console.error(chalk.red('✗ Failed to get ready items'));
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

export interface BlockedOptions {
  specs?: boolean;
  issues?: boolean;
}

export async function handleBlocked(
  ctx: CommandContext,
  options: BlockedOptions
): Promise<void> {
  try {
    const showSpecs = options.specs || (!options.specs && !options.issues);
    const showIssues = options.issues || (!options.specs && !options.issues);

    const results: any = {};

    if (showSpecs) {
      // Note: would need to implement getBlockedSpecs in operations/specs.ts
      // For now, just show empty
      results.specs = [];
    }
    if (showIssues) {
      results.issues = getBlockedIssues(ctx.db);
    }

    if (ctx.jsonOutput) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      if (showSpecs && results.specs) {
        if (results.specs.length === 0) {
          console.log(chalk.gray('\nNo blocked specs'));
        } else {
          console.log(chalk.bold(`\nBlocked Specs (${results.specs.length}):\n`));
          for (const spec of results.specs) {
            console.log(chalk.cyan(spec.id), spec.title);
          }
        }
      }

      if (showIssues && results.issues) {
        if (results.issues.length === 0) {
          console.log(chalk.gray('\nNo blocked issues'));
        } else {
          console.log(chalk.bold(`\nBlocked Issues (${results.issues.length}):\n`));
          for (const issue of results.issues) {
            console.log(chalk.cyan(issue.id), issue.title);
            console.log(chalk.gray(`  Reason: ${issue.status}`));
          }
        }
      }
      console.log();
    }
  } catch (error) {
    console.error(chalk.red('✗ Failed to get blocked items'));
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
