/**
 * Trajectory analysis engine - analyzes execution patterns and recommends actions
 */

import type {
  Trajectory,
  TrajectoryStep,
  ActionType,
  ActionValue,
  TrajectoryPattern,
  TrajectoryOutcome,
} from "./trajectory-types.js";
import * as crypto from "crypto";

/**
 * Similarity result between two trajectories
 */
export interface TrajectorySimilarity {
  trajectory_id: string;
  similarity_score: number;
  similarity_reasons: string[];
}

/**
 * Action recommendation
 */
export interface ActionRecommendation {
  action_type: ActionType;
  confidence: number;
  reasoning: string;
  estimated_success_rate: number;
  sample_size: number;
}

/**
 * Calculate similarity between two trajectories
 */
export function calculateTrajectorySimilarity(
  traj1: Trajectory,
  traj2: Trajectory
): number {
  let score = 0;

  // Context similarity (40%)
  const contextScore = calculateContextSimilarity(traj1, traj2);
  score += contextScore * 0.4;

  // Action sequence similarity (30%)
  const sequenceScore = calculateSequenceSimilarity(traj1.steps, traj2.steps);
  score += sequenceScore * 0.3;

  // Files changed similarity (20%)
  const filesScore = calculateFilesSimilarity(
    traj1.git_info?.files_changed || [],
    traj2.git_info?.files_changed || []
  );
  score += filesScore * 0.2;

  // Outcome similarity (10%)
  const outcomeScore = traj1.outcome === traj2.outcome ? 1 : 0;
  score += outcomeScore * 0.1;

  return Math.round(score * 100);
}

/**
 * Calculate context similarity
 */
function calculateContextSimilarity(traj1: Trajectory, traj2: Trajectory): number {
  let score = 0;
  let factors = 0;

  // Goal similarity
  if (traj1.context.goal && traj2.context.goal) {
    const words1 = new Set(tokenize(traj1.context.goal));
    const words2 = new Set(tokenize(traj2.context.goal));
    const overlap = intersection(words1, words2).size;
    score += overlap > 0 ? overlap / Math.max(words1.size, words2.size) : 0;
    factors++;
  }

  // Issue/spec similarity
  if (traj1.context.issue_id && traj2.context.issue_id) {
    score += traj1.context.issue_id === traj2.context.issue_id ? 1 : 0;
    factors++;
  }

  // Tag overlap
  const tags1 = new Set(traj1.context.tags);
  const tags2 = new Set(traj2.context.tags);
  const tagOverlap = intersection(tags1, tags2).size;
  if (tags1.size > 0 || tags2.size > 0) {
    score += tagOverlap / Math.max(tags1.size, tags2.size);
    factors++;
  }

  return factors > 0 ? score / factors : 0;
}

/**
 * Calculate action sequence similarity
 */
function calculateSequenceSimilarity(steps1: TrajectoryStep[], steps2: TrajectoryStep[]): number {
  if (steps1.length === 0 || steps2.length === 0) {
    return 0;
  }

  const actions1 = steps1.map(s => s.action_type);
  const actions2 = steps2.map(s => s.action_type);

  // Use longest common subsequence
  const lcsLength = longestCommonSubsequence(actions1, actions2);
  return (2 * lcsLength) / (actions1.length + actions2.length);
}

/**
 * Calculate files changed similarity
 */
function calculateFilesSimilarity(files1: string[], files2: string[]): number {
  if (files1.length === 0 || files2.length === 0) {
    return 0;
  }

  const set1 = new Set(files1);
  const set2 = new Set(files2);
  const overlap = intersection(set1, set2).size;

  return (2 * overlap) / (files1.length + files2.length);
}

/**
 * Find similar trajectories
 */
export function findSimilarTrajectories(
  reference: Trajectory,
  candidates: Trajectory[],
  minSimilarity: number = 30,
  limit: number = 5
): TrajectorySimilarity[] {
  const similarities: TrajectorySimilarity[] = [];

  for (const candidate of candidates) {
    if (candidate.id === reference.id) {
      continue; // Skip self
    }

    const score = calculateTrajectorySimilarity(reference, candidate);

    if (score >= minSimilarity) {
      const reasons: string[] = [];

      // Analyze what makes them similar
      if (reference.context.issue_id === candidate.context.issue_id) {
        reasons.push("Same issue");
      }

      const contextSim = calculateContextSimilarity(reference, candidate);
      if (contextSim > 0.5) {
        reasons.push("Similar goal/context");
      }

      const seqSim = calculateSequenceSimilarity(reference.steps, candidate.steps);
      if (seqSim > 0.5) {
        reasons.push("Similar action sequence");
      }

      const filesSim = calculateFilesSimilarity(
        reference.git_info?.files_changed || [],
        candidate.git_info?.files_changed || []
      );
      if (filesSim > 0.5) {
        reasons.push("Similar files changed");
      }

      similarities.push({
        trajectory_id: candidate.id,
        similarity_score: score,
        similarity_reasons: reasons,
      });
    }
  }

  // Sort by similarity (descending) and limit
  return similarities
    .sort((a, b) => b.similarity_score - a.similarity_score)
    .slice(0, limit);
}

/**
 * Extract action patterns from trajectories
 */
export function extractActionPatterns(
  trajectories: Trajectory[],
  minFrequency: number = 2
): TrajectoryPattern[] {
  const patternMap = new Map<string, {
    sequence: ActionType[];
    count: number;
    successCount: number;
    totalDuration: number;
    contexts: Set<string>;
  }>();

  // Extract all possible subsequences of length 2-5
  for (const traj of trajectories) {
    const actions = traj.steps.map(s => s.action_type);

    for (let length = 2; length <= Math.min(5, actions.length); length++) {
      for (let i = 0; i <= actions.length - length; i++) {
        const sequence = actions.slice(i, i + length);
        const key = sequence.join("|");

        if (!patternMap.has(key)) {
          patternMap.set(key, {
            sequence,
            count: 0,
            successCount: 0,
            totalDuration: 0,
            contexts: new Set(),
          });
        }

        const pattern = patternMap.get(key)!;
        pattern.count++;

        if (traj.outcome === "success") {
          pattern.successCount++;
        }

        if (traj.duration_ms) {
          pattern.totalDuration += traj.duration_ms;
        }

        // Add context
        const contextHash = hashContext(traj.context.goal, traj.context.tags);
        pattern.contexts.add(contextHash);
      }
    }
  }

  // Convert to pattern objects
  const patterns: TrajectoryPattern[] = [];
  let patternId = 1;

  for (const [key, data] of patternMap.entries()) {
    if (data.count >= minFrequency) {
      patterns.push({
        id: `pattern-${patternId++}`,
        action_sequence: data.sequence,
        frequency: data.count,
        success_rate: data.successCount / data.count,
        avg_duration_ms: Math.round(data.totalDuration / data.count),
        effective_contexts: Array.from(data.contexts),
      });
    }
  }

  // Sort by frequency * success_rate
  return patterns.sort((a, b) =>
    (b.frequency * b.success_rate) - (a.frequency * a.success_rate)
  );
}

/**
 * Build action-value estimates (Q-learning style)
 */
export function buildActionValues(trajectories: Trajectory[]): ActionValue[] {
  const valueMap = new Map<string, {
    count: number;
    successCount: number;
    totalTimeToCompletion: number;
  }>();

  for (const traj of trajectories) {
    for (let i = 0; i < traj.steps.length; i++) {
      const step = traj.steps[i];

      // Create context hash for current state
      const contextHash = hashContext(
        traj.context.goal,
        traj.context.tags,
        traj.steps.slice(0, i).map(s => s.action_type)
      );

      const key = `${contextHash}|${step.action_type}`;

      if (!valueMap.has(key)) {
        valueMap.set(key, {
          count: 0,
          successCount: 0,
          totalTimeToCompletion: 0,
        });
      }

      const value = valueMap.get(key)!;
      value.count++;

      // If trajectory succeeded, count this action as contributing
      if (traj.outcome === "success") {
        value.successCount++;

        // Time to completion from this point
        if (traj.duration_ms) {
          const remainingSteps = traj.steps.length - i;
          const estimatedRemaining = (traj.duration_ms / traj.steps.length) * remainingSteps;
          value.totalTimeToCompletion += estimatedRemaining;
        }
      }
    }
  }

  // Convert to ActionValue objects
  const actionValues: ActionValue[] = [];

  for (const [key, data] of valueMap.entries()) {
    const [contextHash, actionType] = key.split("|");

    actionValues.push({
      context_hash: contextHash,
      action_type: actionType as ActionType,
      value: data.successCount / data.count, // Simple success rate as value
      sample_size: data.count,
      success_rate: data.successCount / data.count,
      avg_time_to_completion_ms: data.count > 0
        ? Math.round(data.totalTimeToCompletion / data.count)
        : undefined,
      updated_at: new Date().toISOString(),
    });
  }

  // Sort by value (descending)
  return actionValues.sort((a, b) => b.value - a.value);
}

/**
 * Recommend next action based on current context
 */
export function recommendNextAction(
  currentContext: {
    goal: string;
    tags: string[];
    previousActions: ActionType[];
  },
  actionValues: ActionValue[],
  topK: number = 3
): ActionRecommendation[] {
  const contextHash = hashContext(
    currentContext.goal,
    currentContext.tags,
    currentContext.previousActions
  );

  // Find action values for this context
  const relevantValues = actionValues.filter(av =>
    av.context_hash === contextHash && av.sample_size >= 2 // Minimum sample size
  );

  if (relevantValues.length === 0) {
    // No exact match, try partial match (ignore previous actions)
    const partialHash = hashContext(currentContext.goal, currentContext.tags);
    relevantValues.push(...actionValues.filter(av =>
      av.context_hash.startsWith(partialHash) && av.sample_size >= 2
    ));
  }

  // Convert to recommendations
  const recommendations: ActionRecommendation[] = relevantValues.map(av => ({
    action_type: av.action_type,
    confidence: av.value * (Math.min(av.sample_size, 10) / 10), // Confidence increases with sample size
    reasoning: `Succeeded ${Math.round(av.success_rate * 100)}% of the time in similar contexts (${av.sample_size} samples)`,
    estimated_success_rate: av.success_rate,
    sample_size: av.sample_size,
  }));

  // Sort by confidence and return top K
  return recommendations
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, topK);
}

/**
 * Helper functions
 */

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function intersection<T>(setA: Set<T>, setB: Set<T>): Set<T> {
  return new Set([...setA].filter(x => setB.has(x)));
}

function longestCommonSubsequence<T>(arr1: T[], arr2: T[]): number {
  const m = arr1.length;
  const n = arr2.length;
  const dp: number[][] = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (arr1[i - 1] === arr2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp[m][n];
}

function hashContext(goal: string, tags: string[], previousActions: ActionType[] = []): string {
  const data = `${goal}|${tags.sort().join(",")}|${previousActions.join(",")}`;
  return crypto.createHash("sha256").update(data).digest("hex").substring(0, 16);
}
