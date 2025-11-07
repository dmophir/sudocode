/**
 * Trajectory capture system - records agent execution steps
 */

import type {
  Trajectory,
  TrajectoryStep,
  ActionType,
  TrajectoryOutcome,
  TrajectoryContext,
  TrajectoryQuality,
} from "./trajectory-types.js";
import { TrajectoryStorage } from "./trajectory-storage.js";

/**
 * Builder for constructing trajectories step-by-step
 */
export class TrajectoryBuilder {
  private trajectory: Partial<Trajectory>;
  private steps: TrajectoryStep[] = [];
  private startTime: number;
  private stepStartTime: number;

  constructor(context: TrajectoryContext, agentType: "claude-code" | "codex" | "other") {
    this.startTime = Date.now();
    this.stepStartTime = this.startTime;

    this.trajectory = {
      id: TrajectoryStorage.generateId(),
      agent_type: agentType,
      context,
      steps: [],
      outcome: "partial", // Will be updated
      quality: {
        rework_needed: false,
        efficient_path: true,
        repeated_mistakes: [],
        novel_solutions: [],
      },
      started_at: new Date(this.startTime).toISOString(),
    };
  }

  /**
   * Record a step
   */
  addStep(
    action_type: ActionType,
    options: {
      target?: string;
      details?: string;
      success?: boolean;
      error?: string;
      context_size?: number;
    } = {}
  ): this {
    const now = Date.now();
    const duration = now - this.stepStartTime;

    const step: TrajectoryStep = {
      step_index: this.steps.length,
      action_type,
      target: options.target,
      details: options.details,
      success: options.success !== false, // Default to true
      error: options.error,
      timestamp: new Date(now).toISOString(),
      context_size: options.context_size,
      duration_ms: duration,
    };

    this.steps.push(step);
    this.stepStartTime = now;

    return this;
  }

  /**
   * Set model information
   */
  setModel(model: string): this {
    this.trajectory.model = model;
    return this;
  }

  /**
   * Set session ID
   */
  setSessionId(sessionId: string): this {
    this.trajectory.session_id = sessionId;
    return this;
  }

  /**
   * Set git information
   */
  setGitInfo(info: {
    start_commit: string;
    end_commit?: string;
    branch?: string;
    files_changed: string[];
  }): this {
    this.trajectory.git_info = info;
    return this;
  }

  /**
   * Set quality metrics
   */
  setQuality(quality: Partial<TrajectoryQuality>): this {
    this.trajectory.quality = {
      ...this.trajectory.quality!,
      ...quality,
    };
    return this;
  }

  /**
   * Mark as rework needed
   */
  markReworkNeeded(reason?: string): this {
    this.trajectory.quality!.rework_needed = true;
    if (reason) {
      this.trajectory.quality!.repeated_mistakes.push(reason);
    }
    return this;
  }

  /**
   * Mark as inefficient path
   */
  markInefficient(): this {
    this.trajectory.quality!.efficient_path = false;
    return this;
  }

  /**
   * Add a repeated mistake
   */
  addRepeatedMistake(mistake: string): this {
    this.trajectory.quality!.repeated_mistakes.push(mistake);
    return this;
  }

  /**
   * Add a novel solution
   */
  addNovelSolution(solution: string): this {
    this.trajectory.quality!.novel_solutions.push(solution);
    return this;
  }

  /**
   * Complete the trajectory
   */
  complete(outcome: TrajectoryOutcome, qualityScore?: number): Trajectory {
    const now = Date.now();
    const duration = now - this.startTime;

    this.trajectory.steps = this.steps;
    this.trajectory.outcome = outcome;
    this.trajectory.completed_at = new Date(now).toISOString();
    this.trajectory.duration_ms = duration;

    if (qualityScore !== undefined) {
      this.trajectory.quality!.quality_score = qualityScore;
    } else {
      // Auto-calculate quality score
      this.trajectory.quality!.quality_score = this.calculateQualityScore(outcome);
    }

    return this.trajectory as Trajectory;
  }

  /**
   * Calculate quality score based on various factors
   */
  private calculateQualityScore(outcome: TrajectoryOutcome): number {
    let score = 50; // Base score

    // Outcome contribution (0-40 points)
    if (outcome === "success") {
      score += 40;
    } else if (outcome === "partial") {
      score += 20;
    } else if (outcome === "failure") {
      score += 0;
    }

    // Efficiency (0-20 points)
    if (this.trajectory.quality!.efficient_path) {
      score += 20;
    } else {
      score += 10;
    }

    // Rework penalty (-10 points)
    if (this.trajectory.quality!.rework_needed) {
      score -= 10;
    }

    // Repeated mistakes penalty (-5 points each)
    score -= this.trajectory.quality!.repeated_mistakes.length * 5;

    // Novel solutions bonus (+5 points each)
    score += this.trajectory.quality!.novel_solutions.length * 5;

    // Test results (0-20 points)
    const quality = this.trajectory.quality!;
    if (quality.tests_passed !== undefined && quality.tests_failed !== undefined) {
      const totalTests = quality.tests_passed + quality.tests_failed;
      if (totalTests > 0) {
        score += Math.round((quality.tests_passed / totalTests) * 20);
      }
    }

    // Clamp to 0-100
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get current trajectory (partial)
   */
  getCurrent(): Partial<Trajectory> {
    return {
      ...this.trajectory,
      steps: this.steps,
    };
  }
}

/**
 * Recorder for capturing execution trajectories
 */
export class TrajectoryRecorder {
  private storage: TrajectoryStorage;
  private currentBuilder: TrajectoryBuilder | null = null;

  constructor(outputDir: string) {
    this.storage = new TrajectoryStorage({ outputDir });
  }

  /**
   * Start recording a new trajectory
   */
  start(
    context: TrajectoryContext,
    agentType: "claude-code" | "codex" | "other" = "claude-code"
  ): TrajectoryBuilder {
    this.currentBuilder = new TrajectoryBuilder(context, agentType);
    return this.currentBuilder;
  }

  /**
   * Get current builder
   */
  getCurrentBuilder(): TrajectoryBuilder | null {
    return this.currentBuilder;
  }

  /**
   * Complete and save current trajectory
   */
  completeAndSave(outcome: TrajectoryOutcome, qualityScore?: number): Trajectory | null {
    if (!this.currentBuilder) {
      return null;
    }

    const trajectory = this.currentBuilder.complete(outcome, qualityScore);
    this.storage.save(trajectory);
    this.currentBuilder = null;

    return trajectory;
  }

  /**
   * Abandon current trajectory
   */
  abandon(): void {
    if (this.currentBuilder) {
      const trajectory = this.currentBuilder.complete("abandoned");
      this.storage.save(trajectory);
      this.currentBuilder = null;
    }
  }

  /**
   * Get storage
   */
  getStorage(): TrajectoryStorage {
    return this.storage;
  }
}

/**
 * Parse execution logs to extract trajectory
 * This can be used to reconstruct trajectories from existing logs
 */
export function parseExecutionLogs(logs: string): TrajectoryStep[] {
  const steps: TrajectoryStep[] = [];
  const lines = logs.split("\n");

  let stepIndex = 0;

  for (const line of lines) {
    // Parse common log formats
    // Example: "2024-01-01T12:00:00Z [INFO] read_file: src/app.ts"
    const match = line.match(/\[(.*?)\]\s+(\w+):\s*(.*)/);

    if (match) {
      const [, timestamp, action, details] = match;

      // Map action to ActionType
      const actionType = mapActionString(action);

      if (actionType) {
        steps.push({
          step_index: stepIndex++,
          action_type: actionType,
          details,
          success: true, // Assume success unless indicated otherwise
          timestamp: timestamp || new Date().toISOString(),
        });
      }
    }
  }

  return steps;
}

/**
 * Map action string to ActionType
 */
function mapActionString(action: string): ActionType | null {
  const normalized = action.toLowerCase().replace(/[_-]/g, "");

  if (normalized.includes("read")) return "read_file";
  if (normalized.includes("write")) return "write_file";
  if (normalized.includes("edit")) return "edit_file";
  if (normalized.includes("delete")) return "delete_file";
  if (normalized.includes("test")) return "run_tests";
  if (normalized.includes("command")) return "run_command";
  if (normalized.includes("search")) return "search_code";
  if (normalized.includes("commit")) return "git_commit";

  return null;
}
