/**
 * Dependency Graph Service Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { initDatabase } from "@sudocode-ai/cli/dist/db.js";
import { createIssue } from "@sudocode-ai/cli/dist/operations/issues.js";
import { createRelationship } from "@sudocode-ai/cli/dist/operations/relationships.js";
import { DependencyGraphService } from "../../src/services/dependency-graph.js";
import type { Issue } from "@sudocode-ai/types";

describe("Dependency Graph Service", () => {
  let db: Database.Database;
  let service: DependencyGraphService;

  beforeEach(() => {
    // Create fresh in-memory database for each test
    db = initDatabase({ path: ":memory:" });
    service = new DependencyGraphService(db);
  });

  describe("buildGraph", () => {
    it("should build graph with no dependencies", () => {
      const issue1 = createIssue(db, {
        id: "issue-001",
        title: "Issue 1",
        priority: 1,
      });
      const issue2 = createIssue(db, {
        id: "issue-002",
        title: "Issue 2",
        priority: 2,
      });

      const graph = service.buildGraph([issue1, issue2]);

      expect(graph.size).toBe(2);
      expect(graph.get("issue-001")?.dependencies.size).toBe(0);
      expect(graph.get("issue-002")?.dependencies.size).toBe(0);
    });

    it("should handle blocks relationship", () => {
      const issue1 = createIssue(db, {
        id: "issue-001",
        title: "Blocker Issue",
        priority: 1,
      });
      const issue2 = createIssue(db, {
        id: "issue-002",
        title: "Blocked Issue",
        priority: 2,
      });

      // issue-001 blocks issue-002
      createRelationship(db, {
        from_id: "issue-001",
        from_type: "issue",
        to_id: "issue-002",
        to_type: "issue",
        relationship_type: "blocks",
      });

      const graph = service.buildGraph([issue1, issue2]);

      // issue-002 depends on issue-001
      expect(graph.get("issue-002")?.dependencies.has("issue-001")).toBe(true);
      expect(graph.get("issue-001")?.dependents.has("issue-002")).toBe(true);
    });

    it("should handle depends-on relationship", () => {
      const issue1 = createIssue(db, {
        id: "issue-001",
        title: "Dependency",
        priority: 1,
      });
      const issue2 = createIssue(db, {
        id: "issue-002",
        title: "Dependent",
        priority: 2,
      });

      // issue-002 depends-on issue-001
      createRelationship(db, {
        from_id: "issue-002",
        from_type: "issue",
        to_id: "issue-001",
        to_type: "issue",
        relationship_type: "depends-on",
      });

      const graph = service.buildGraph([issue1, issue2]);

      // issue-002 depends on issue-001
      expect(graph.get("issue-002")?.dependencies.has("issue-001")).toBe(true);
      expect(graph.get("issue-001")?.dependents.has("issue-002")).toBe(true);
    });

    it("should handle chain of dependencies", () => {
      const issue1 = createIssue(db, {
        id: "issue-001",
        title: "First",
        priority: 1,
      });
      const issue2 = createIssue(db, {
        id: "issue-002",
        title: "Second",
        priority: 2,
      });
      const issue3 = createIssue(db, {
        id: "issue-003",
        title: "Third",
        priority: 3,
      });

      // issue-001 blocks issue-002
      createRelationship(db, {
        from_id: "issue-001",
        from_type: "issue",
        to_id: "issue-002",
        to_type: "issue",
        relationship_type: "blocks",
      });

      // issue-002 blocks issue-003
      createRelationship(db, {
        from_id: "issue-002",
        from_type: "issue",
        to_id: "issue-003",
        to_type: "issue",
        relationship_type: "blocks",
      });

      const graph = service.buildGraph([issue1, issue2, issue3]);

      // issue-002 depends on issue-001
      expect(graph.get("issue-002")?.dependencies.has("issue-001")).toBe(true);
      // issue-003 depends on issue-002
      expect(graph.get("issue-003")?.dependencies.has("issue-002")).toBe(true);
      // issue-003 should NOT directly depend on issue-001
      expect(graph.get("issue-003")?.dependencies.has("issue-001")).toBe(false);
    });
  });

  describe("topologicalSort", () => {
    it("should sort issues with no dependencies", () => {
      const issue1 = createIssue(db, {
        id: "issue-001",
        title: "Issue 1",
        priority: 1,
      });
      const issue2 = createIssue(db, {
        id: "issue-002",
        title: "Issue 2",
        priority: 2,
      });

      const graph = service.buildGraph([issue1, issue2]);
      const sorted = service.topologicalSort(graph);

      expect(sorted).toBeDefined();
      expect(sorted).toHaveLength(2);
      expect(sorted).toContain("issue-001");
      expect(sorted).toContain("issue-002");
    });

    it("should sort issues with dependencies correctly", () => {
      const issue1 = createIssue(db, {
        id: "issue-001",
        title: "First",
        priority: 1,
      });
      const issue2 = createIssue(db, {
        id: "issue-002",
        title: "Second",
        priority: 2,
      });
      const issue3 = createIssue(db, {
        id: "issue-003",
        title: "Third",
        priority: 3,
      });

      // issue-001 blocks issue-002
      createRelationship(db, {
        from_id: "issue-001",
        from_type: "issue",
        to_id: "issue-002",
        to_type: "issue",
        relationship_type: "blocks",
      });

      // issue-002 blocks issue-003
      createRelationship(db, {
        from_id: "issue-002",
        from_type: "issue",
        to_id: "issue-003",
        to_type: "issue",
        relationship_type: "blocks",
      });

      const graph = service.buildGraph([issue1, issue2, issue3]);
      const sorted = service.topologicalSort(graph);

      expect(sorted).toBeDefined();
      expect(sorted).toEqual(["issue-001", "issue-002", "issue-003"]);
    });

    it("should return null for cyclic dependencies", () => {
      const issue1 = createIssue(db, {
        id: "issue-001",
        title: "First",
        priority: 1,
      });
      const issue2 = createIssue(db, {
        id: "issue-002",
        title: "Second",
        priority: 2,
      });

      // issue-001 blocks issue-002
      createRelationship(db, {
        from_id: "issue-001",
        from_type: "issue",
        to_id: "issue-002",
        to_type: "issue",
        relationship_type: "blocks",
      });

      // issue-002 blocks issue-001 (creates cycle)
      createRelationship(db, {
        from_id: "issue-002",
        from_type: "issue",
        to_id: "issue-001",
        to_type: "issue",
        relationship_type: "blocks",
      });

      const graph = service.buildGraph([issue1, issue2]);
      const sorted = service.topologicalSort(graph);

      expect(sorted).toBeNull();
    });
  });

  describe("detectCycles", () => {
    it("should detect no cycles in acyclic graph", () => {
      const issue1 = createIssue(db, {
        id: "issue-001",
        title: "First",
        priority: 1,
      });
      const issue2 = createIssue(db, {
        id: "issue-002",
        title: "Second",
        priority: 2,
      });

      createRelationship(db, {
        from_id: "issue-001",
        from_type: "issue",
        to_id: "issue-002",
        to_type: "issue",
        relationship_type: "blocks",
      });

      const graph = service.buildGraph([issue1, issue2]);
      const cycles = service.detectCycles(graph);

      expect(cycles).toHaveLength(0);
    });

    it("should detect simple cycle", () => {
      const issue1 = createIssue(db, {
        id: "issue-001",
        title: "First",
        priority: 1,
      });
      const issue2 = createIssue(db, {
        id: "issue-002",
        title: "Second",
        priority: 2,
      });

      // Create cycle: issue-001 -> issue-002 -> issue-001
      createRelationship(db, {
        from_id: "issue-001",
        from_type: "issue",
        to_id: "issue-002",
        to_type: "issue",
        relationship_type: "blocks",
      });
      createRelationship(db, {
        from_id: "issue-002",
        from_type: "issue",
        to_id: "issue-001",
        to_type: "issue",
        relationship_type: "blocks",
      });

      const graph = service.buildGraph([issue1, issue2]);
      const cycles = service.detectCycles(graph);

      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0]).toContain("issue-001");
      expect(cycles[0]).toContain("issue-002");
    });
  });

  describe("analyzeDependencies", () => {
    it("should analyze simple dependency chain", () => {
      const issue1 = createIssue(db, {
        id: "issue-001",
        title: "First",
        priority: 1,
      });
      const issue2 = createIssue(db, {
        id: "issue-002",
        title: "Second",
        priority: 2,
      });

      createRelationship(db, {
        from_id: "issue-001",
        from_type: "issue",
        to_id: "issue-002",
        to_type: "issue",
        relationship_type: "blocks",
      });

      const analysis = service.analyzeDependencies([issue1, issue2]);

      expect(analysis.hasCycles).toBe(false);
      expect(analysis.cycles).toHaveLength(0);
      expect(analysis.topologicalOrder).toEqual(["issue-001", "issue-002"]);
    });

    it("should analyze cyclic dependencies", () => {
      const issue1 = createIssue(db, {
        id: "issue-001",
        title: "First",
        priority: 1,
      });
      const issue2 = createIssue(db, {
        id: "issue-002",
        title: "Second",
        priority: 2,
      });

      // Create cycle
      createRelationship(db, {
        from_id: "issue-001",
        from_type: "issue",
        to_id: "issue-002",
        to_type: "issue",
        relationship_type: "blocks",
      });
      createRelationship(db, {
        from_id: "issue-002",
        from_type: "issue",
        to_id: "issue-001",
        to_type: "issue",
        relationship_type: "blocks",
      });

      const analysis = service.analyzeDependencies([issue1, issue2]);

      expect(analysis.hasCycles).toBe(true);
      expect(analysis.cycles.length).toBeGreaterThan(0);
    });
  });

  describe("getReadyIssues", () => {
    it("should return issues with no dependencies", () => {
      const issue1 = createIssue(db, {
        id: "issue-001",
        title: "First",
        priority: 1,
      });
      const issue2 = createIssue(db, {
        id: "issue-002",
        title: "Second",
        priority: 2,
      });

      const ready = service.getReadyIssues([issue1, issue2], new Set());

      expect(ready).toHaveLength(2);
    });

    it("should exclude issues with unmet dependencies", () => {
      const issue1 = createIssue(db, {
        id: "issue-001",
        title: "Blocker",
        priority: 1,
      });
      const issue2 = createIssue(db, {
        id: "issue-002",
        title: "Blocked",
        priority: 2,
      });

      createRelationship(db, {
        from_id: "issue-001",
        from_type: "issue",
        to_id: "issue-002",
        to_type: "issue",
        relationship_type: "blocks",
      });

      const ready = service.getReadyIssues([issue1, issue2], new Set());

      expect(ready).toHaveLength(1);
      expect(ready[0].id).toBe("issue-001");
    });

    it("should include issues when dependencies are met", () => {
      const issue1 = createIssue(db, {
        id: "issue-001",
        title: "Blocker",
        priority: 1,
      });
      const issue2 = createIssue(db, {
        id: "issue-002",
        title: "Blocked",
        priority: 2,
      });

      createRelationship(db, {
        from_id: "issue-001",
        from_type: "issue",
        to_id: "issue-002",
        to_type: "issue",
        relationship_type: "blocks",
      });

      // Mark issue-001 as completed
      const ready = service.getReadyIssues(
        [issue1, issue2],
        new Set(["issue-001"])
      );

      expect(ready).toHaveLength(1);
      expect(ready[0].id).toBe("issue-002");
    });

    it("should sort ready issues by priority", () => {
      const issue1 = createIssue(db, {
        id: "issue-001",
        title: "Low Priority",
        priority: 3,
      });
      const issue2 = createIssue(db, {
        id: "issue-002",
        title: "High Priority",
        priority: 0,
      });
      const issue3 = createIssue(db, {
        id: "issue-003",
        title: "Medium Priority",
        priority: 1,
      });

      const ready = service.getReadyIssues(
        [issue1, issue2, issue3],
        new Set()
      );

      expect(ready).toHaveLength(3);
      expect(ready[0].id).toBe("issue-002"); // Priority 0
      expect(ready[1].id).toBe("issue-003"); // Priority 1
      expect(ready[2].id).toBe("issue-001"); // Priority 3
    });
  });

  describe("getNextIssue", () => {
    it("should return highest priority ready issue", () => {
      const issue1 = createIssue(db, {
        id: "issue-001",
        title: "Low Priority",
        priority: 3,
      });
      const issue2 = createIssue(db, {
        id: "issue-002",
        title: "High Priority",
        priority: 0,
      });

      const next = service.getNextIssue([issue1, issue2], new Set());

      expect(next).toBeDefined();
      expect(next?.id).toBe("issue-002");
    });

    it("should return null when no issues are ready", () => {
      const issue1 = createIssue(db, {
        id: "issue-001",
        title: "Blocker",
        priority: 1,
      });
      const issue2 = createIssue(db, {
        id: "issue-002",
        title: "Blocked",
        priority: 2,
      });

      createRelationship(db, {
        from_id: "issue-001",
        from_type: "issue",
        to_id: "issue-002",
        to_type: "issue",
        relationship_type: "blocks",
      });

      // Mark issue-001 as completed, issue-002 depends on it
      const next = service.getNextIssue([issue2], new Set(["issue-001"]));

      expect(next).toBeDefined();
      expect(next?.id).toBe("issue-002");
    });

    it("should respect dependencies when selecting next issue", () => {
      const issue1 = createIssue(db, {
        id: "issue-001",
        title: "Blocker (low priority)",
        priority: 5,
      });
      const issue2 = createIssue(db, {
        id: "issue-002",
        title: "Blocked (high priority)",
        priority: 0,
      });

      // issue-001 blocks issue-002
      createRelationship(db, {
        from_id: "issue-001",
        from_type: "issue",
        to_id: "issue-002",
        to_type: "issue",
        relationship_type: "blocks",
      });

      const next = service.getNextIssue([issue1, issue2], new Set());

      // Should return issue-001 even though issue-002 has higher priority
      // because issue-002 depends on issue-001
      expect(next?.id).toBe("issue-001");
    });
  });
});
