/**
 * Tests for trajectory storage
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { TrajectoryStorage } from "../../../src/learning/trajectory-storage.js";
import type { Trajectory } from "../../../src/learning/trajectory-types.js";

describe("TrajectoryStorage", () => {
  let tempDir: string;
  let storage: TrajectoryStorage;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "traj-storage-test-"));
    storage = new TrajectoryStorage({ outputDir: tempDir });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("save and load", () => {
    it("should save and load a trajectory", () => {
      const trajectory: Trajectory = {
        id: "test-traj-001",
        agent_type: "claude-code",
        model: "claude-sonnet-4-5",
        context: {
          goal: "Test goal",
          tags: ["test"],
        },
        steps: [
          {
            step_index: 0,
            action_type: "read_file",
            target: "test.ts",
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
          quality_score: 85,
        },
        started_at: "2024-01-01T00:00:00Z",
        completed_at: "2024-01-01T00:01:00Z",
        duration_ms: 60000,
      };

      storage.save(trajectory);

      const loaded = storage.load("test-traj-001");
      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe("test-traj-001");
      expect(loaded?.steps.length).toBe(1);
      expect(loaded?.outcome).toBe("success");
    });

    it("should return null for non-existent trajectory", () => {
      const loaded = storage.load("non-existent");
      expect(loaded).toBeNull();
    });
  });

  describe("list", () => {
    beforeEach(() => {
      // Create test trajectories
      for (let i = 1; i <= 5; i++) {
        const traj: Trajectory = {
          id: `test-traj-${String(i).padStart(3, "0")}`,
          agent_type: i <= 3 ? "claude-code" : "codex",
          context: {
            goal: `Test goal ${i}`,
            issue_id: i <= 2 ? `issue-${i}` : undefined,
            tags: ["test"],
          },
          steps: [],
          outcome: i <= 4 ? "success" : "failure",
          quality: {
            rework_needed: false,
            efficient_path: true,
            repeated_mistakes: [],
            novel_solutions: [],
            quality_score: 80 + i,
          },
          started_at: `2024-01-0${i}T00:00:00Z`,
          completed_at: `2024-01-0${i}T00:01:00Z`,
          duration_ms: 60000,
        };
        storage.save(traj);
      }
    });

    it("should list all trajectories", () => {
      const trajectories = storage.list();
      expect(trajectories.length).toBe(5);
    });

    it("should filter by issue_id", () => {
      const trajectories = storage.list({ issue_id: "issue-1" });
      expect(trajectories.length).toBe(1);
      expect(trajectories[0].issue_id).toBe("issue-1");
    });

    it("should filter by outcome", () => {
      const trajectories = storage.list({ outcome: "success" });
      expect(trajectories.length).toBe(4);
      trajectories.forEach(t => expect(t.outcome).toBe("success"));
    });

    it("should filter by agent_type", () => {
      const trajectories = storage.list({ agent_type: "claude-code" });
      expect(trajectories.length).toBe(3);
      trajectories.forEach(t => expect(t.agent_type).toBe("claude-code"));
    });

    it("should filter by min_quality", () => {
      const trajectories = storage.list({ min_quality: 84 });
      expect(trajectories.length).toBe(2);
      trajectories.forEach(t => expect(t.quality_score).toBeGreaterThanOrEqual(84));
    });

    it("should filter by date", () => {
      const trajectories = storage.list({ since: "2024-01-03T00:00:00Z" });
      expect(trajectories.length).toBe(3);
    });

    it("should respect limit", () => {
      const trajectories = storage.list({ limit: 2 });
      expect(trajectories.length).toBe(2);
    });

    it("should sort by date descending", () => {
      const trajectories = storage.list();
      expect(trajectories[0].id).toBe("test-traj-005");
      expect(trajectories[4].id).toBe("test-traj-001");
    });
  });

  describe("getStats", () => {
    beforeEach(() => {
      // Create varied trajectories
      const outcomes: Array<"success" | "failure" | "partial"> = [
        "success", "success", "failure", "partial", "success",
      ];

      for (let i = 0; i < 5; i++) {
        const traj: Trajectory = {
          id: `test-traj-${i}`,
          agent_type: i < 3 ? "claude-code" : "codex",
          context: {
            goal: `Test ${i}`,
            tags: [],
          },
          steps: [],
          outcome: outcomes[i],
          quality: {
            rework_needed: false,
            efficient_path: true,
            repeated_mistakes: [],
            novel_solutions: [],
            quality_score: 70 + (i * 5),
          },
          started_at: new Date().toISOString(),
          duration_ms: 60000 + (i * 10000),
        };
        storage.save(traj);
      }
    });

    it("should calculate correct statistics", () => {
      const stats = storage.getStats();

      expect(stats.total).toBe(5);
      expect(stats.by_outcome.success).toBe(3);
      expect(stats.by_outcome.failure).toBe(1);
      expect(stats.by_outcome.partial).toBe(1);
      expect(stats.by_agent["claude-code"]).toBe(3);
      expect(stats.by_agent.codex).toBe(2);
      expect(stats.avg_duration_ms).toBeGreaterThan(0);
      expect(stats.avg_quality).toBe(80); // (70+75+80+85+90)/5
    });
  });

  describe("delete", () => {
    it("should delete a trajectory", () => {
      const traj: Trajectory = {
        id: "test-delete",
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
        started_at: new Date().toISOString(),
      };

      storage.save(traj);
      expect(storage.load("test-delete")).toBeDefined();

      const deleted = storage.delete("test-delete");
      expect(deleted).toBe(true);
      expect(storage.load("test-delete")).toBeNull();
    });

    it("should return false for non-existent trajectory", () => {
      const deleted = storage.delete("non-existent");
      expect(deleted).toBe(false);
    });
  });

  describe("generateId", () => {
    it("should generate unique IDs", () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(TrajectoryStorage.generateId());
      }
      expect(ids.size).toBe(100);
    });

    it("should generate IDs with correct format", () => {
      const id = TrajectoryStorage.generateId();
      expect(id).toMatch(/^traj-\d+-[a-f0-9]{8}$/);
    });
  });
});
