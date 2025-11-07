/**
 * Trajectory storage system - persists trajectories to disk
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import type {
  Trajectory,
  TrajectoryIndex,
  TrajectoryOutcome,
  ActionType,
} from "./trajectory-types.js";

export interface TrajectoryStorageOptions {
  outputDir: string; // .sudocode directory
}

/**
 * Storage manager for trajectories
 */
export class TrajectoryStorage {
  private trajectoriesDir: string;
  private indexPath: string;
  private index: Map<string, TrajectoryIndex>;

  constructor(options: TrajectoryStorageOptions) {
    this.trajectoriesDir = path.join(options.outputDir, "trajectories");
    this.indexPath = path.join(this.trajectoriesDir, "index.json");
    this.index = new Map();

    this.ensureDirectories();
    this.loadIndex();
  }

  /**
   * Ensure directory structure exists
   */
  private ensureDirectories(): void {
    // Create trajectories directory
    fs.mkdirSync(this.trajectoriesDir, { recursive: true });

    // Create monthly subdirectories for organization
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthDir = path.join(this.trajectoriesDir, yearMonth);
    fs.mkdirSync(monthDir, { recursive: true });
  }

  /**
   * Load index from disk
   */
  private loadIndex(): void {
    if (fs.existsSync(this.indexPath)) {
      try {
        const data = fs.readFileSync(this.indexPath, "utf-8");
        const indexArray: TrajectoryIndex[] = JSON.parse(data);
        this.index = new Map(indexArray.map(item => [item.id, item]));
      } catch (error) {
        console.error("Failed to load trajectory index:", error);
        this.index = new Map();
      }
    }
  }

  /**
   * Save index to disk
   */
  private saveIndex(): void {
    try {
      const indexArray = Array.from(this.index.values());
      fs.writeFileSync(this.indexPath, JSON.stringify(indexArray, null, 2));
    } catch (error) {
      console.error("Failed to save trajectory index:", error);
    }
  }

  /**
   * Get file path for a trajectory
   */
  private getTrajectoryPath(trajectoryId: string, date?: Date): string {
    const d = date || new Date();
    const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return path.join(this.trajectoriesDir, yearMonth, `${trajectoryId}.json`);
  }

  /**
   * Save a trajectory
   */
  save(trajectory: Trajectory): void {
    // Save trajectory file
    const trajPath = this.getTrajectoryPath(trajectory.id, new Date(trajectory.started_at));
    fs.mkdirSync(path.dirname(trajPath), { recursive: true });
    fs.writeFileSync(trajPath, JSON.stringify(trajectory, null, 2));

    // Update index
    const indexEntry: TrajectoryIndex = {
      id: trajectory.id,
      issue_id: trajectory.context.issue_id,
      spec_id: trajectory.context.spec_id,
      agent_type: trajectory.agent_type,
      outcome: trajectory.outcome,
      quality_score: trajectory.quality.quality_score,
      duration_ms: trajectory.duration_ms,
      step_count: trajectory.steps.length,
      tags: trajectory.context.tags,
      started_at: trajectory.started_at,
      files_changed: trajectory.git_info?.files_changed || [],
    };

    this.index.set(trajectory.id, indexEntry);
    this.saveIndex();
  }

  /**
   * Load a trajectory by ID
   */
  load(trajectoryId: string): Trajectory | null {
    const indexEntry = this.index.get(trajectoryId);
    if (!indexEntry) {
      return null;
    }

    const trajPath = this.getTrajectoryPath(trajectoryId, new Date(indexEntry.started_at));

    if (!fs.existsSync(trajPath)) {
      // Try to find in other monthly directories
      const found = this.findTrajectoryFile(trajectoryId);
      if (!found) {
        return null;
      }
      return JSON.parse(fs.readFileSync(found, "utf-8"));
    }

    return JSON.parse(fs.readFileSync(trajPath, "utf-8"));
  }

  /**
   * Find trajectory file across all monthly directories
   */
  private findTrajectoryFile(trajectoryId: string): string | null {
    const trajDir = this.trajectoriesDir;
    const files = fs.readdirSync(trajDir);

    for (const file of files) {
      const fullPath = path.join(trajDir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        const trajPath = path.join(fullPath, `${trajectoryId}.json`);
        if (fs.existsSync(trajPath)) {
          return trajPath;
        }
      }
    }

    return null;
  }

  /**
   * List trajectories with filters
   */
  list(options: {
    issue_id?: string;
    spec_id?: string;
    outcome?: TrajectoryOutcome;
    agent_type?: string;
    min_quality?: number;
    since?: string;
    limit?: number;
  } = {}): TrajectoryIndex[] {
    let results = Array.from(this.index.values());

    // Apply filters
    if (options.issue_id) {
      results = results.filter(t => t.issue_id === options.issue_id);
    }

    if (options.spec_id) {
      results = results.filter(t => t.spec_id === options.spec_id);
    }

    if (options.outcome) {
      results = results.filter(t => t.outcome === options.outcome);
    }

    if (options.agent_type) {
      results = results.filter(t => t.agent_type === options.agent_type);
    }

    if (options.min_quality !== undefined) {
      results = results.filter(t =>
        t.quality_score !== undefined && t.quality_score >= options.min_quality!
      );
    }

    if (options.since) {
      results = results.filter(t => t.started_at >= options.since!);
    }

    // Sort by date (most recent first)
    results.sort((a, b) => b.started_at.localeCompare(a.started_at));

    // Apply limit
    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Get statistics about stored trajectories
   */
  getStats(): {
    total: number;
    by_outcome: Record<TrajectoryOutcome, number>;
    by_agent: Record<string, number>;
    avg_duration_ms: number;
    avg_quality: number;
  } {
    const trajectories = Array.from(this.index.values());

    const stats = {
      total: trajectories.length,
      by_outcome: {} as Record<TrajectoryOutcome, number>,
      by_agent: {} as Record<string, number>,
      avg_duration_ms: 0,
      avg_quality: 0,
    };

    let totalDuration = 0;
    let totalQuality = 0;
    let qualityCount = 0;

    for (const traj of trajectories) {
      // Count by outcome
      stats.by_outcome[traj.outcome] = (stats.by_outcome[traj.outcome] || 0) + 1;

      // Count by agent
      stats.by_agent[traj.agent_type] = (stats.by_agent[traj.agent_type] || 0) + 1;

      // Sum durations
      if (traj.duration_ms) {
        totalDuration += traj.duration_ms;
      }

      // Sum quality scores
      if (traj.quality_score !== undefined) {
        totalQuality += traj.quality_score;
        qualityCount++;
      }
    }

    if (trajectories.length > 0) {
      stats.avg_duration_ms = Math.round(totalDuration / trajectories.length);
    }

    if (qualityCount > 0) {
      stats.avg_quality = Math.round(totalQuality / qualityCount);
    }

    return stats;
  }

  /**
   * Delete a trajectory
   */
  delete(trajectoryId: string): boolean {
    const indexEntry = this.index.get(trajectoryId);
    if (!indexEntry) {
      return false;
    }

    const trajPath = this.getTrajectoryPath(trajectoryId, new Date(indexEntry.started_at));

    if (fs.existsSync(trajPath)) {
      fs.unlinkSync(trajPath);
    }

    this.index.delete(trajectoryId);
    this.saveIndex();

    return true;
  }

  /**
   * Generate a unique trajectory ID
   */
  static generateId(): string {
    return `traj-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  }
}
