/**
 * Dependency Graph Service
 *
 * Builds and analyzes issue dependency graphs for intelligent execution ordering.
 * Supports topological sorting and circular dependency detection.
 */

import type Database from "better-sqlite3";
import type { Issue } from "@sudocode-ai/types";

/**
 * Graph node representing an issue with its dependencies
 */
interface GraphNode {
  issueId: string;
  issue: Issue;
  dependencies: Set<string>; // Issues this issue depends on (must execute first)
  dependents: Set<string>; // Issues that depend on this issue
}

/**
 * Result of dependency analysis
 */
export interface DependencyAnalysis {
  hasCycles: boolean;
  cycles: string[][]; // List of cycles (each cycle is an array of issue IDs)
  topologicalOrder: string[]; // Issues in execution order (dependencies first)
}

/**
 * Service for building and analyzing issue dependency graphs
 */
export class DependencyGraphService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Build a dependency graph from a list of issues
   *
   * Considers these relationships:
   * - "blocks" relationship: Issue A blocks Issue B means B depends on A
   * - "depends-on" relationship: Issue A depends-on Issue B means A depends on B
   */
  buildGraph(issues: Issue[]): Map<string, GraphNode> {
    const graph = new Map<string, GraphNode>();

    // Initialize nodes
    for (const issue of issues) {
      graph.set(issue.id, {
        issueId: issue.id,
        issue,
        dependencies: new Set(),
        dependents: new Set(),
      });
    }

    // Build edges from relationships
    const issueIds = new Set(issues.map((i) => i.id));

    for (const issue of issues) {
      const node = graph.get(issue.id)!;

      // Get all relationships for this issue
      const relationships = this.db
        .prepare(
          `
        SELECT * FROM relationships
        WHERE (from_id = ? OR to_id = ?)
          AND (relationship_type = 'blocks' OR relationship_type = 'depends-on')
      `
        )
        .all(issue.id, issue.id) as Array<{
        from_id: string;
        to_id: string;
        relationship_type: string;
      }>;

      for (const rel of relationships) {
        if (rel.relationship_type === "blocks") {
          // A blocks B means B depends on A
          if (rel.from_id === issue.id && issueIds.has(rel.to_id)) {
            // This issue blocks another issue
            const dependentNode = graph.get(rel.to_id);
            if (dependentNode) {
              dependentNode.dependencies.add(issue.id);
              node.dependents.add(rel.to_id);
            }
          } else if (rel.to_id === issue.id && issueIds.has(rel.from_id)) {
            // Another issue blocks this issue
            const blockerNode = graph.get(rel.from_id);
            if (blockerNode) {
              node.dependencies.add(rel.from_id);
              blockerNode.dependents.add(issue.id);
            }
          }
        } else if (rel.relationship_type === "depends-on") {
          // A depends-on B means A depends on B
          if (rel.from_id === issue.id && issueIds.has(rel.to_id)) {
            // This issue depends on another issue
            const dependencyNode = graph.get(rel.to_id);
            if (dependencyNode) {
              node.dependencies.add(rel.to_id);
              dependencyNode.dependents.add(issue.id);
            }
          } else if (rel.to_id === issue.id && issueIds.has(rel.from_id)) {
            // Another issue depends on this issue
            const dependentNode = graph.get(rel.from_id);
            if (dependentNode) {
              dependentNode.dependencies.add(issue.id);
              node.dependents.add(rel.from_id);
            }
          }
        }
      }
    }

    return graph;
  }

  /**
   * Perform topological sort on issues
   *
   * Returns issues in an order where all dependencies come before dependents.
   * Uses Kahn's algorithm for topological sorting.
   *
   * @returns Array of issue IDs in topological order, or null if there are cycles
   */
  topologicalSort(graph: Map<string, GraphNode>): string[] | null {
    // Create a copy of the graph to avoid modifying the original
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, Set<string>>();

    // Initialize in-degree and adjacency list
    for (const [issueId, node] of graph) {
      inDegree.set(issueId, node.dependencies.size);
      adjList.set(issueId, new Set(node.dependents));
    }

    // Queue of nodes with no dependencies
    const queue: string[] = [];
    for (const [issueId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(issueId);
      }
    }

    const result: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      // Process all dependents
      const dependents = adjList.get(current) || new Set();
      for (const dependent of dependents) {
        const newDegree = inDegree.get(dependent)! - 1;
        inDegree.set(dependent, newDegree);

        if (newDegree === 0) {
          queue.push(dependent);
        }
      }
    }

    // If we didn't process all nodes, there's a cycle
    if (result.length !== graph.size) {
      return null;
    }

    return result;
  }

  /**
   * Detect circular dependencies in the graph
   *
   * Uses depth-first search to find cycles.
   */
  detectCycles(graph: Map<string, GraphNode>): string[][] {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (
      nodeId: string,
      path: string[]
    ): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      const node = graph.get(nodeId);
      if (!node) return false;

      for (const dependencyId of node.dependencies) {
        if (!visited.has(dependencyId)) {
          if (dfs(dependencyId, [...path])) {
            return true;
          }
        } else if (recursionStack.has(dependencyId)) {
          // Found a cycle
          const cycleStart = path.indexOf(dependencyId);
          const cycle = path.slice(cycleStart);
          cycle.push(dependencyId); // Complete the cycle
          cycles.push(cycle);
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const nodeId of graph.keys()) {
      if (!visited.has(nodeId)) {
        dfs(nodeId, []);
      }
    }

    return cycles;
  }

  /**
   * Analyze dependencies for a set of issues
   *
   * Returns comprehensive analysis including cycles and topological order.
   */
  analyzeDependencies(issues: Issue[]): DependencyAnalysis {
    const graph = this.buildGraph(issues);
    const cycles = this.detectCycles(graph);
    const topologicalOrder = this.topologicalSort(graph);

    return {
      hasCycles: cycles.length > 0,
      cycles,
      topologicalOrder: topologicalOrder || [],
    };
  }

  /**
   * Get issues that are ready to execute (no unmet dependencies)
   *
   * An issue is ready if:
   * - All its dependencies are in 'closed' status
   * - It has no cycles
   *
   * @param issues - List of issues to check
   * @param completedIssueIds - Set of issue IDs that are already completed
   * @returns Array of ready issues in priority order
   */
  getReadyIssues(
    issues: Issue[],
    completedIssueIds: Set<string>
  ): Issue[] {
    const graph = this.buildGraph(issues);
    const ready: Issue[] = [];

    for (const [issueId, node] of graph) {
      // Skip if already completed
      if (completedIssueIds.has(issueId)) {
        continue;
      }

      // Check if all dependencies are met
      const allDependenciesMet = Array.from(node.dependencies).every(
        (depId) => completedIssueIds.has(depId)
      );

      if (allDependenciesMet) {
        ready.push(node.issue);
      }
    }

    // Sort by priority (0 is highest)
    return ready.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // Tie-breaker: older issues first
      return (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });
  }

  /**
   * Get the next issue to execute respecting dependencies
   *
   * Returns the highest priority issue that has all its dependencies met.
   *
   * @param issues - Available issues
   * @param completedIssueIds - Issues that are already completed
   * @returns Next issue to execute, or null if none available
   */
  getNextIssue(
    issues: Issue[],
    completedIssueIds: Set<string>
  ): Issue | null {
    const readyIssues = this.getReadyIssues(issues, completedIssueIds);
    return readyIssues[0] || null;
  }
}
