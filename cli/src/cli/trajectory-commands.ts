/**
 * CLI handlers for trajectory commands
 */

import chalk from "chalk";
import type Database from "better-sqlite3";
import { TrajectoryStorage } from "../learning/trajectory-storage.js";
import {
  findSimilarTrajectories,
  extractActionPatterns,
  buildActionValues,
  recommendNextAction,
} from "../learning/trajectory-analysis.js";
import type { ActionType } from "../learning/trajectory-types.js";

export interface CommandContext {
  db: Database.Database;
  outputDir: string;
  jsonOutput: boolean;
}

export interface TrajectoryListOptions {
  issue?: string;
  spec?: string;
  outcome?: string;
  agent?: string;
  since?: string;
  limit?: number;
}

export interface TrajectoryAnalyzeOptions {
  minFrequency?: number;
  minSimilarity?: number;
}

/**
 * List trajectories
 */
export async function handleTrajectoryList(
  ctx: CommandContext,
  options: TrajectoryListOptions
): Promise<void> {
  try {
    const storage = new TrajectoryStorage({ outputDir: ctx.outputDir });

    const trajectories = storage.list({
      issue_id: options.issue,
      spec_id: options.spec,
      outcome: options.outcome as any,
      agent_type: options.agent,
      since: options.since,
      limit: options.limit || 20,
    });

    if (ctx.jsonOutput) {
      console.log(JSON.stringify(trajectories, null, 2));
      return;
    }

    if (trajectories.length === 0) {
      console.log(chalk.yellow("No trajectories found"));
      return;
    }

    console.log(chalk.cyan(`Found ${trajectories.length} trajectories:\n`));

    for (const traj of trajectories) {
      const outcomeColor =
        traj.outcome === "success" ? chalk.green :
        traj.outcome === "failure" ? chalk.red :
        chalk.yellow;

      console.log(`${chalk.cyan(traj.id)}`);
      console.log(`  Outcome: ${outcomeColor(traj.outcome)}`);
      if (traj.issue_id) {
        console.log(`  Issue: ${traj.issue_id}`);
      }
      if (traj.spec_id) {
        console.log(`  Spec: ${traj.spec_id}`);
      }
      console.log(`  Agent: ${traj.agent_type}`);
      console.log(`  Steps: ${traj.step_count}`);
      if (traj.quality_score !== undefined) {
        const qualityColor = traj.quality_score >= 80 ? chalk.green :
                            traj.quality_score >= 60 ? chalk.yellow :
                            chalk.red;
        console.log(`  Quality: ${qualityColor(traj.quality_score)}`);
      }
      if (traj.duration_ms) {
        console.log(`  Duration: ${formatDuration(traj.duration_ms)}`);
      }
      console.log(`  Started: ${new Date(traj.started_at).toLocaleString()}`);
      console.log();
    }
  } catch (error) {
    console.error(chalk.red("✗ Failed to list trajectories"));
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Show trajectory details
 */
export async function handleTrajectoryShow(
  ctx: CommandContext,
  trajectoryId: string
): Promise<void> {
  try {
    const storage = new TrajectoryStorage({ outputDir: ctx.outputDir });
    const trajectory = storage.load(trajectoryId);

    if (!trajectory) {
      throw new Error(`Trajectory not found: ${trajectoryId}`);
    }

    if (ctx.jsonOutput) {
      console.log(JSON.stringify(trajectory, null, 2));
      return;
    }

    const outcomeColor =
      trajectory.outcome === "success" ? chalk.green :
      trajectory.outcome === "failure" ? chalk.red :
      chalk.yellow;

    console.log(chalk.cyan.bold(`\nTrajectory ${trajectory.id}\n`));
    console.log(chalk.gray("═".repeat(80)));

    console.log(`\n${chalk.bold("Context")}`);
    console.log(`  Goal: ${trajectory.context.goal}`);
    if (trajectory.context.issue_id) {
      console.log(`  Issue: ${trajectory.context.issue_id} - ${trajectory.context.issue_title || ""}`);
    }
    if (trajectory.context.spec_id) {
      console.log(`  Spec: ${trajectory.context.spec_id} - ${trajectory.context.spec_title || ""}`);
    }
    if (trajectory.context.tags.length > 0) {
      console.log(`  Tags: ${trajectory.context.tags.join(", ")}`);
    }

    console.log(`\n${chalk.bold("Execution")}`);
    console.log(`  Agent: ${trajectory.agent_type}`);
    if (trajectory.model) {
      console.log(`  Model: ${trajectory.model}`);
    }
    console.log(`  Outcome: ${outcomeColor(trajectory.outcome)}`);
    console.log(`  Started: ${new Date(trajectory.started_at).toLocaleString()}`);
    if (trajectory.completed_at) {
      console.log(`  Completed: ${new Date(trajectory.completed_at).toLocaleString()}`);
    }
    if (trajectory.duration_ms) {
      console.log(`  Duration: ${formatDuration(trajectory.duration_ms)}`);
    }

    console.log(`\n${chalk.bold("Quality")}`);
    if (trajectory.quality.quality_score !== undefined) {
      const qualityColor = trajectory.quality.quality_score >= 80 ? chalk.green :
                          trajectory.quality.quality_score >= 60 ? chalk.yellow :
                          chalk.red;
      console.log(`  Score: ${qualityColor(trajectory.quality.quality_score)}/100`);
    }
    console.log(`  Efficient Path: ${trajectory.quality.efficient_path ? "✓" : "✗"}`);
    console.log(`  Rework Needed: ${trajectory.quality.rework_needed ? "Yes" : "No"}`);
    if (trajectory.quality.tests_passed !== undefined) {
      console.log(`  Tests: ${trajectory.quality.tests_passed} passed, ${trajectory.quality.tests_failed || 0} failed`);
    }
    if (trajectory.quality.repeated_mistakes.length > 0) {
      console.log(`  Repeated Mistakes: ${trajectory.quality.repeated_mistakes.join(", ")}`);
    }
    if (trajectory.quality.novel_solutions.length > 0) {
      console.log(`  Novel Solutions: ${trajectory.quality.novel_solutions.join(", ")}`);
    }

    if (trajectory.git_info) {
      console.log(`\n${chalk.bold("Git")}`);
      console.log(`  Start Commit: ${trajectory.git_info.start_commit}`);
      if (trajectory.git_info.end_commit) {
        console.log(`  End Commit: ${trajectory.git_info.end_commit}`);
      }
      if (trajectory.git_info.branch) {
        console.log(`  Branch: ${trajectory.git_info.branch}`);
      }
      console.log(`  Files Changed: ${trajectory.git_info.files_changed.length}`);
      if (trajectory.git_info.files_changed.length > 0 && trajectory.git_info.files_changed.length <= 10) {
        trajectory.git_info.files_changed.forEach(file => {
          console.log(`    • ${file}`);
        });
      }
    }

    console.log(`\n${chalk.bold("Steps")} (${trajectory.steps.length})`);
    console.log(chalk.gray("─".repeat(80)));

    for (const step of trajectory.steps) {
      const successIcon = step.success ? chalk.green("✓") : chalk.red("✗");
      const actionColor = step.success ? chalk.white : chalk.red;

      console.log(`${successIcon} ${chalk.gray(`[${step.step_index}]`)} ${actionColor(step.action_type)}`);

      if (step.target) {
        console.log(`    Target: ${step.target}`);
      }
      if (step.details) {
        console.log(`    Details: ${step.details}`);
      }
      if (step.error) {
        console.log(`    ${chalk.red("Error:")} ${step.error}`);
      }
      if (step.duration_ms) {
        console.log(`    Duration: ${formatDuration(step.duration_ms)}`);
      }
    }

    console.log(chalk.gray("\n═".repeat(80)));
  } catch (error) {
    console.error(chalk.red("✗ Failed to show trajectory"));
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Analyze trajectories for patterns
 */
export async function handleTrajectoryAnalyze(
  ctx: CommandContext,
  options: TrajectoryAnalyzeOptions
): Promise<void> {
  try {
    const storage = new TrajectoryStorage({ outputDir: ctx.outputDir });
    const allTrajectories = storage.list({ outcome: "success" }); // Analyze successful ones

    if (allTrajectories.length === 0) {
      console.log(chalk.yellow("No trajectories found to analyze"));
      return;
    }

    console.log(chalk.cyan(`Analyzing ${allTrajectories.length} successful trajectories...\n`));

    // Load full trajectories
    const trajectories = allTrajectories
      .map(idx => storage.load(idx.id))
      .filter((t): t is NonNullable<typeof t> => t !== null);

    // Extract patterns
    const patterns = extractActionPatterns(trajectories, options.minFrequency || 2);

    // Build action values
    const actionValues = buildActionValues(trajectories);

    if (ctx.jsonOutput) {
      console.log(JSON.stringify({ patterns, actionValues: actionValues.slice(0, 20) }, null, 2));
      return;
    }

    console.log(chalk.bold("Action Patterns"));
    console.log(chalk.gray("═".repeat(80)));
    console.log();

    if (patterns.length === 0) {
      console.log(chalk.yellow("No patterns found"));
    } else {
      for (const pattern of patterns.slice(0, 10)) {
        console.log(`${chalk.cyan(pattern.id)}: ${pattern.action_sequence.join(" → ")}`);
        console.log(`  Frequency: ${pattern.frequency}`);
        console.log(`  Success Rate: ${Math.round(pattern.success_rate * 100)}%`);
        console.log(`  Avg Duration: ${formatDuration(pattern.avg_duration_ms)}`);
        console.log();
      }
    }

    console.log(chalk.bold("\nTop Action Values"));
    console.log(chalk.gray("═".repeat(80)));
    console.log();

    for (const av of actionValues.slice(0, 10)) {
      const confidenceColor = av.value >= 0.8 ? chalk.green :
                              av.value >= 0.6 ? chalk.yellow :
                              chalk.gray;

      console.log(`${confidenceColor(av.action_type)} (${Math.round(av.value * 100)}% success)`);
      console.log(`  Context: ${av.context_hash.substring(0, 12)}...`);
      console.log(`  Samples: ${av.sample_size}`);
      if (av.avg_time_to_completion_ms) {
        console.log(`  Avg Time to Completion: ${formatDuration(av.avg_time_to_completion_ms)}`);
      }
      console.log();
    }

    console.log(chalk.gray("─".repeat(80)));
    console.log(chalk.green(`\n✓ Analysis complete`));
  } catch (error) {
    console.error(chalk.red("✗ Failed to analyze trajectories"));
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Get recommendations for next action
 */
export async function handleTrajectoryRecommend(
  ctx: CommandContext,
  goal: string,
  options: {
    tags?: string;
    previousActions?: string;
    topK?: number;
  }
): Promise<void> {
  try {
    const storage = new TrajectoryStorage({ outputDir: ctx.outputDir });
    const allTrajectories = storage.list({ outcome: "success" });

    if (allTrajectories.length === 0) {
      console.log(chalk.yellow("No trajectories found for recommendations"));
      return;
    }

    // Load full trajectories
    const trajectories = allTrajectories
      .map(idx => storage.load(idx.id))
      .filter((t): t is NonNullable<typeof t> => t !== null);

    // Build action values
    const actionValues = buildActionValues(trajectories);

    // Parse inputs
    const tags = options.tags ? options.tags.split(",").map(t => t.trim()) : [];
    const previousActions = options.previousActions
      ? options.previousActions.split(",").map(a => a.trim() as ActionType)
      : [];

    // Get recommendations
    const recommendations = recommendNextAction(
      { goal, tags, previousActions },
      actionValues,
      options.topK || 3
    );

    if (ctx.jsonOutput) {
      console.log(JSON.stringify(recommendations, null, 2));
      return;
    }

    console.log(chalk.cyan(`\nRecommended Actions for: "${goal}"\n`));
    console.log(chalk.gray("═".repeat(80)));
    console.log();

    if (recommendations.length === 0) {
      console.log(chalk.yellow("No recommendations available"));
      console.log(chalk.gray("Try completing more trajectories to build recommendation data"));
      return;
    }

    for (let i = 0; i < recommendations.length; i++) {
      const rec = recommendations[i];
      const confidenceColor = rec.confidence >= 0.7 ? chalk.green :
                             rec.confidence >= 0.5 ? chalk.yellow :
                             chalk.gray;

      console.log(`${i + 1}. ${confidenceColor.bold(rec.action_type)}`);
      console.log(`   Confidence: ${confidenceColor(Math.round(rec.confidence * 100) + "%")}`);
      console.log(`   Success Rate: ${Math.round(rec.estimated_success_rate * 100)}%`);
      console.log(`   Reasoning: ${rec.reasoning}`);
      console.log();
    }

    console.log(chalk.gray("─".repeat(80)));
  } catch (error) {
    console.error(chalk.red("✗ Failed to get recommendations"));
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Show trajectory statistics
 */
export async function handleTrajectoryStats(
  ctx: CommandContext
): Promise<void> {
  try {
    const storage = new TrajectoryStorage({ outputDir: ctx.outputDir });
    const stats = storage.getStats();

    if (ctx.jsonOutput) {
      console.log(JSON.stringify(stats, null, 2));
      return;
    }

    console.log(chalk.cyan("\nTrajectory Statistics\n"));
    console.log(chalk.gray("═".repeat(80)));
    console.log();

    console.log(`Total Trajectories: ${chalk.bold(stats.total)}`);
    console.log();

    console.log(chalk.bold("By Outcome:"));
    for (const [outcome, count] of Object.entries(stats.by_outcome)) {
      const outcomeColor = outcome === "success" ? chalk.green :
                          outcome === "failure" ? chalk.red :
                          chalk.yellow;
      console.log(`  ${outcomeColor(outcome)}: ${count}`);
    }
    console.log();

    console.log(chalk.bold("By Agent:"));
    for (const [agent, count] of Object.entries(stats.by_agent)) {
      console.log(`  ${agent}: ${count}`);
    }
    console.log();

    console.log(`Average Duration: ${formatDuration(stats.avg_duration_ms)}`);
    console.log(`Average Quality: ${stats.avg_quality}/100`);

    console.log(chalk.gray("\n═".repeat(80)));
  } catch (error) {
    console.error(chalk.red("✗ Failed to get statistics"));
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Helper to format duration
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else if (ms < 3600000) {
    return `${(ms / 60000).toFixed(1)}m`;
  } else {
    return `${(ms / 3600000).toFixed(1)}h`;
  }
}
