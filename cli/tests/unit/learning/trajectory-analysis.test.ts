/**
 * Tests for trajectory analysis
 */

import { describe, it, expect } from "vitest";
import type { Trajectory } from "../../../src/learning/trajectory-types.js";
import {
  calculateTrajectorySimilarity,
  findSimilarTrajectories,
  extractActionPatterns,
  buildActionValues,
  recommendNextAction,
} from "../../../src/learning/trajectory-analysis.js";

describe("Trajectory Analysis", () => {
  describe("calculateTrajectorySimilarity", () => {
    it("should return high similarity for identical trajectories", () => {
      const traj1: Trajectory = {
        id: "traj-1",
        agent_type: "claude-code",
        context: {
          goal: "Implement authentication",
          tags: ["auth", "security"],
        },
        steps: [
          {
            step_index: 0,
            action_type: "read_file",
            target: "auth.ts",
            success: true,
            timestamp: "2024-01-01T00:00:00Z",
          },
          {
            step_index: 1,
            action_type: "edit_file",
            target: "auth.ts",
            success: true,
            timestamp: "2024-01-01T00:01:00Z",
          },
        ],
        outcome: "success",
        quality: {
          rework_needed: false,
          efficient_path: true,
          repeated_mistakes: [],
          novel_solutions: [],
        },
        started_at: "2024-01-01T00:00:00Z",
        git_info: {
          start_commit: "abc123",
          files_changed: ["auth.ts"],
        },
      };

      const traj2 = { ...traj1, id: "traj-2" };

      const similarity = calculateTrajectorySimilarity(traj1, traj2);
      expect(similarity).toBeGreaterThan(90);
    });

    it("should return low similarity for different trajectories", () => {
      const traj1: Trajectory = {
        id: "traj-1",
        agent_type: "claude-code",
        context: {
          goal: "Implement authentication",
          tags: ["auth"],
        },
        steps: [
          {
            step_index: 0,
            action_type: "read_file",
            success: true,
            timestamp: "2024-01-01T00:00:00Z",
          },
        ],
        outcome: "success",
        quality: {
          rework_needed: false,
          efficient_path: true,
          repeated_mistakes: [],
          novel_solutions: [],
        },
        started_at: "2024-01-01T00:00:00Z",
        git_info: {
          start_commit: "abc123",
          files_changed: ["auth.ts"],
        },
      };

      const traj2: Trajectory = {
        id: "traj-2",
        agent_type: "claude-code",
        context: {
          goal: "Fix database migration",
          tags: ["database"],
        },
        steps: [
          {
            step_index: 0,
            action_type: "run_tests",
            success: false,
            timestamp: "2024-01-01T00:00:00Z",
          },
        ],
        outcome: "failure",
        quality: {
          rework_needed: true,
          efficient_path: false,
          repeated_mistakes: [],
          novel_solutions: [],
        },
        started_at: "2024-01-01T00:00:00Z",
        git_info: {
          start_commit: "def456",
          files_changed: ["migrations/001.sql"],
        },
      };

      const similarity = calculateTrajectorySimilarity(traj1, traj2);
      expect(similarity).toBeLessThan(30);
    });
  });

  describe("findSimilarTrajectories", () => {
    it("should find similar trajectories", () => {
      const reference: Trajectory = {
        id: "ref",
        agent_type: "claude-code",
        context: {
          goal: "Add user authentication",
          tags: ["auth", "users"],
        },
        steps: [
          {
            step_index: 0,
            action_type: "read_file",
            success: true,
            timestamp: "2024-01-01T00:00:00Z",
          },
          {
            step_index: 1,
            action_type: "edit_file",
            success: true,
            timestamp: "2024-01-01T00:01:00Z",
          },
        ],
        outcome: "success",
        quality: {
          rework_needed: false,
          efficient_path: true,
          repeated_mistakes: [],
          novel_solutions: [],
        },
        started_at: "2024-01-01T00:00:00Z",
        git_info: {
          start_commit: "abc123",
          files_changed: ["auth.ts"],
        },
      };

      const candidates: Trajectory[] = [
        {
          id: "candidate-1",
          agent_type: "claude-code",
          context: {
            goal: "Implement authentication system",
            tags: ["auth"],
          },
          steps: [
            {
              step_index: 0,
              action_type: "read_file",
              success: true,
              timestamp: "2024-01-01T00:00:00Z",
            },
            {
              step_index: 1,
              action_type: "edit_file",
              success: true,
              timestamp: "2024-01-01T00:01:00Z",
            },
          ],
          outcome: "success",
          quality: {
            rework_needed: false,
            efficient_path: true,
            repeated_mistakes: [],
            novel_solutions: [],
          },
          started_at: "2024-01-01T00:00:00Z",
          git_info: {
            start_commit: "abc123",
            files_changed: ["auth.ts", "user.ts"],
          },
        },
        {
          id: "candidate-2",
          agent_type: "claude-code",
          context: {
            goal: "Fix database bug",
            tags: ["database"],
          },
          steps: [
            {
              step_index: 0,
              action_type: "run_tests",
              success: true,
              timestamp: "2024-01-01T00:00:00Z",
            },
          ],
          outcome: "success",
          quality: {
            rework_needed: false,
            efficient_path: true,
            repeated_mistakes: [],
            novel_solutions: [],
          },
          started_at: "2024-01-01T00:00:00Z",
          git_info: {
            start_commit: "def456",
            files_changed: ["db.ts"],
          },
        },
      ];

      const similar = findSimilarTrajectories(reference, candidates, 30, 5);

      expect(similar.length).toBeGreaterThan(0);
      expect(similar[0].trajectory_id).toBe("candidate-1");
      expect(similar[0].similarity_score).toBeGreaterThan(30);
    });

    it("should respect minSimilarity threshold", () => {
      const reference: Trajectory = {
        id: "ref",
        agent_type: "claude-code",
        context: {
          goal: "Test",
          tags: [],
        },
        steps: [],
        outcome: "success",
        quality: {
          rework_needed: false,
          efficient_path: true,
          repeated_mistakes: [],
          novel_solutions: [],
        },
        started_at: "2024-01-01T00:00:00Z",
      };

      const candidates: Trajectory[] = [
        {
          ...reference,
          id: "candidate-1",
          context: { goal: "Completely different goal", tags: ["different"] },
        },
      ];

      const similar = findSimilarTrajectories(reference, candidates, 80, 5);
      expect(similar.length).toBe(0);
    });
  });

  describe("extractActionPatterns", () => {
    it("should extract common action patterns", () => {
      const trajectories: Trajectory[] = [
        {
          id: "traj-1",
          agent_type: "claude-code",
          context: { goal: "Test", tags: [] },
          steps: [
            {
              step_index: 0,
              action_type: "read_file",
              success: true,
              timestamp: "2024-01-01T00:00:00Z",
            },
            {
              step_index: 1,
              action_type: "edit_file",
              success: true,
              timestamp: "2024-01-01T00:01:00Z",
            },
            {
              step_index: 2,
              action_type: "run_tests",
              success: true,
              timestamp: "2024-01-01T00:02:00Z",
            },
          ],
          outcome: "success",
          quality: {
            rework_needed: false,
            efficient_path: true,
            repeated_mistakes: [],
            novel_solutions: [],
          },
          started_at: "2024-01-01T00:00:00Z",
          duration_ms: 60000,
        },
        {
          id: "traj-2",
          agent_type: "claude-code",
          context: { goal: "Test", tags: [] },
          steps: [
            {
              step_index: 0,
              action_type: "read_file",
              success: true,
              timestamp: "2024-01-01T00:00:00Z",
            },
            {
              step_index: 1,
              action_type: "edit_file",
              success: true,
              timestamp: "2024-01-01T00:01:00Z",
            },
            {
              step_index: 2,
              action_type: "run_tests",
              success: true,
              timestamp: "2024-01-01T00:02:00Z",
            },
          ],
          outcome: "success",
          quality: {
            rework_needed: false,
            efficient_path: true,
            repeated_mistakes: [],
            novel_solutions: [],
          },
          started_at: "2024-01-01T00:00:00Z",
          duration_ms: 60000,
        },
      ];

      const patterns = extractActionPatterns(trajectories, 2);

      expect(patterns.length).toBeGreaterThan(0);

      const readEditPattern = patterns.find(p =>
        p.action_sequence[0] === "read_file" &&
        p.action_sequence[1] === "edit_file"
      );

      expect(readEditPattern).toBeDefined();
      expect(readEditPattern?.frequency).toBe(2);
      expect(readEditPattern?.success_rate).toBe(1);
    });

    it("should respect minFrequency", () => {
      const trajectories: Trajectory[] = [
        {
          id: "traj-1",
          agent_type: "claude-code",
          context: { goal: "Test", tags: [] },
          steps: [
            {
              step_index: 0,
              action_type: "read_file",
              success: true,
              timestamp: "2024-01-01T00:00:00Z",
            },
            {
              step_index: 1,
              action_type: "edit_file",
              success: true,
              timestamp: "2024-01-01T00:01:00Z",
            },
          ],
          outcome: "success",
          quality: {
            rework_needed: false,
            efficient_path: true,
            repeated_mistakes: [],
            novel_solutions: [],
          },
          started_at: "2024-01-01T00:00:00Z",
          duration_ms: 60000,
        },
      ];

      const patterns = extractActionPatterns(trajectories, 2);
      expect(patterns.length).toBe(0); // Pattern appears only once
    });
  });

  describe("buildActionValues", () => {
    it("should build action values from trajectories", () => {
      const trajectories: Trajectory[] = [
        {
          id: "traj-1",
          agent_type: "claude-code",
          context: { goal: "Implement feature", tags: ["feature"] },
          steps: [
            {
              step_index: 0,
              action_type: "read_file",
              success: true,
              timestamp: "2024-01-01T00:00:00Z",
            },
            {
              step_index: 1,
              action_type: "edit_file",
              success: true,
              timestamp: "2024-01-01T00:01:00Z",
            },
          ],
          outcome: "success",
          quality: {
            rework_needed: false,
            efficient_path: true,
            repeated_mistakes: [],
            novel_solutions: [],
          },
          started_at: "2024-01-01T00:00:00Z",
          duration_ms: 60000,
        },
      ];

      const actionValues = buildActionValues(trajectories);

      expect(actionValues.length).toBeGreaterThan(0);

      // Each step should have an action value
      const readValue = actionValues.find(av => av.action_type === "read_file");
      expect(readValue).toBeDefined();
      expect(readValue?.success_rate).toBe(1);
      expect(readValue?.sample_size).toBe(1);
    });
  });

  describe("recommendNextAction", () => {
    it("should recommend actions based on context", () => {
      // Build sample action values
      const trajectories: Trajectory[] = [
        {
          id: "traj-1",
          agent_type: "claude-code",
          context: { goal: "Add feature", tags: ["feature"] },
          steps: [
            {
              step_index: 0,
              action_type: "read_file",
              success: true,
              timestamp: "2024-01-01T00:00:00Z",
            },
            {
              step_index: 1,
              action_type: "edit_file",
              success: true,
              timestamp: "2024-01-01T00:01:00Z",
            },
          ],
          outcome: "success",
          quality: {
            rework_needed: false,
            efficient_path: true,
            repeated_mistakes: [],
            novel_solutions: [],
          },
          started_at: "2024-01-01T00:00:00Z",
          duration_ms: 60000,
        },
        {
          id: "traj-2",
          agent_type: "claude-code",
          context: { goal: "Add feature", tags: ["feature"] },
          steps: [
            {
              step_index: 0,
              action_type: "read_file",
              success: true,
              timestamp: "2024-01-01T00:00:00Z",
            },
            {
              step_index: 1,
              action_type: "edit_file",
              success: true,
              timestamp: "2024-01-01T00:01:00Z",
            },
          ],
          outcome: "success",
          quality: {
            rework_needed: false,
            efficient_path: true,
            repeated_mistakes: [],
            novel_solutions: [],
          },
          started_at: "2024-01-01T00:00:00Z",
          duration_ms: 60000,
        },
      ];

      const actionValues = buildActionValues(trajectories);

      const recommendations = recommendNextAction(
        {
          goal: "Add feature",
          tags: ["feature"],
          previousActions: ["read_file"],
        },
        actionValues,
        3
      );

      // Should get recommendations
      expect(recommendations.length).toBeGreaterThan(0);

      // Check recommendation structure
      const firstRec = recommendations[0];
      expect(firstRec).toHaveProperty("action_type");
      expect(firstRec).toHaveProperty("confidence");
      expect(firstRec).toHaveProperty("reasoning");
      expect(firstRec).toHaveProperty("estimated_success_rate");
    });
  });
});
