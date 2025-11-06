/**
 * JSONL Diff Parser
 *
 * Parses JSONL files and computes diffs to extract mutation events.
 * Used by the worktree mutation tracker to detect changes in worktree JSONL files.
 *
 * @module execution/worktree/jsonl-diff-parser
 */

import fs from "fs";
import type { Issue, Spec, EntityType } from "@sudocode-ai/types";
import type { WorktreeMutationEvent, WorktreeMutationType } from "./types.js";

/**
 * JSONLDiffParser - Parses JSONL files and computes diffs
 *
 * This class is responsible for:
 * 1. Reading and parsing JSONL files
 * 2. Computing differences between snapshots
 * 3. Generating mutation events from diffs
 */
export class JSONLDiffParser {
  /**
   * Parse a JSONL file and extract entities
   *
   * @param filePath - Path to JSONL file
   * @returns Map of entity ID to entity
   */
  parseJSONL(filePath: string): Map<string, Issue | Spec> {
    const entities = new Map<string, Issue | Spec>();

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.warn(`[JSONLDiffParser] File does not exist: ${filePath}`);
      return entities;
    }

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content
        .trim()
        .split("\n")
        .filter((line) => line.trim());

      for (const line of lines) {
        try {
          const entity = JSON.parse(line);
          if (entity.id) {
            entities.set(entity.id, entity);
          } else {
            console.warn(
              `[JSONLDiffParser] Entity missing 'id' field: ${line.substring(0, 100)}`
            );
          }
        } catch (error) {
          console.error(`[JSONLDiffParser] Failed to parse JSONL line:`, {
            line: line.substring(0, 100),
            error,
          });
        }
      }

      console.log(`[JSONLDiffParser] Parsed ${entities.size} entities from ${filePath}`);
    } catch (error) {
      console.error(`[JSONLDiffParser] Failed to read file: ${filePath}`, error);
    }

    return entities;
  }

  /**
   * Compute diff between two JSONL snapshots
   *
   * Detects creates, updates, and deletes by comparing entity maps.
   *
   * @param entityType - Type of entity (issue or spec)
   * @param oldEntities - Previous snapshot
   * @param newEntities - Current snapshot
   * @returns Array of mutation event partials (without id, executionId, sequenceNumber, detectedAt)
   */
  computeDiff(
    entityType: EntityType,
    oldEntities: Map<string, Issue | Spec>,
    newEntities: Map<string, Issue | Spec>
  ): Array<
    Omit<
      WorktreeMutationEvent,
      "id" | "executionId" | "sequenceNumber" | "detectedAt"
    >
  > {
    const events: Array<any> = [];

    // Detect creates and updates
    for (const [id, newEntity] of newEntities) {
      const oldEntity = oldEntities.get(id);

      if (!oldEntity) {
        // Entity was created
        events.push({
          type: `${entityType}_created` as WorktreeMutationType,
          entityType,
          entityId: id,
          oldValue: null,
          newValue: newEntity,
          delta: undefined,
          source: "jsonl_diff" as const,
          metadata: {
            actor: this.extractActor(newEntity),
            updatedAt: newEntity.updated_at,
            isSnapshot: false,
          },
        });
      } else if (!this.isEqual(oldEntity, newEntity)) {
        // Entity was updated
        const delta = this.computeDelta(oldEntity, newEntity);
        events.push({
          type: `${entityType}_updated` as WorktreeMutationType,
          entityType,
          entityId: id,
          oldValue: oldEntity,
          newValue: newEntity,
          delta,
          source: "jsonl_diff" as const,
          metadata: {
            actor: this.extractActor(newEntity),
            updatedAt: newEntity.updated_at,
            isSnapshot: false,
          },
        });
      }
    }

    // Detect deletes
    for (const [id, oldEntity] of oldEntities) {
      if (!newEntities.has(id)) {
        // Entity was deleted
        events.push({
          type: `${entityType}_deleted` as WorktreeMutationType,
          entityType,
          entityId: id,
          oldValue: oldEntity,
          newValue: null,
          delta: undefined,
          source: "jsonl_diff" as const,
          metadata: {
            actor: this.extractActor(oldEntity),
            isSnapshot: false,
          },
        });
      }
    }

    return events;
  }

  /**
   * Compute delta/patch between two entities
   *
   * Returns only the fields that changed.
   *
   * @param oldEntity - Previous entity state
   * @param newEntity - New entity state
   * @returns Partial entity with only changed fields
   */
  computeDelta<T extends Record<string, any>>(
    oldEntity: T,
    newEntity: T
  ): Partial<T> {
    const delta: Partial<T> = {};

    for (const key in newEntity) {
      if (!this.isEqual(oldEntity[key], newEntity[key])) {
        delta[key] = newEntity[key];
      }
    }

    return delta;
  }

  /**
   * Deep equality check
   *
   * Uses JSON stringification for simplicity.
   * For production, consider using a more sophisticated deep-equal library.
   *
   * @param a - First value
   * @param b - Second value
   * @returns true if equal
   */
  private isEqual(a: any, b: any): boolean {
    // Handle null/undefined
    if (a === b) return true;
    if (a == null || b == null) return false;

    // For objects and arrays, use JSON comparison
    // Note: This is simple but has limitations (e.g., key order matters)
    // Consider using lodash.isEqual or fast-deep-equal for production
    if (typeof a === "object" && typeof b === "object") {
      return JSON.stringify(a) === JSON.stringify(b);
    }

    return a === b;
  }

  /**
   * Extract actor from entity
   *
   * Tries to extract who made the change from entity metadata.
   *
   * @param entity - Issue or Spec entity
   * @returns Actor name or undefined
   */
  private extractActor(entity: Issue | Spec): string | undefined {
    // Try updated_by first (for updates), then created_by (for creates)
    const issueOrSpec = entity as any;
    return issueOrSpec.updated_by || issueOrSpec.created_by;
  }

  /**
   * Create snapshot events from entities
   *
   * Used for capturing initial state of worktree.
   *
   * @param entityType - Type of entity
   * @param entities - Map of entities
   * @returns Array of snapshot events
   */
  createSnapshotEvents(
    entityType: EntityType,
    entities: Map<string, Issue | Spec>
  ): Array<
    Omit<
      WorktreeMutationEvent,
      "id" | "executionId" | "sequenceNumber" | "detectedAt"
    >
  > {
    const events: Array<any> = [];

    for (const [id, entity] of entities) {
      events.push({
        type: `${entityType}_created` as WorktreeMutationType,
        entityType,
        entityId: id,
        oldValue: null,
        newValue: entity,
        delta: undefined,
        source: "jsonl_diff" as const,
        metadata: {
          actor: this.extractActor(entity),
          updatedAt: entity.updated_at,
          isSnapshot: true, // Mark as initial snapshot
        },
      });
    }

    return events;
  }

  /**
   * Parse both issues.jsonl and specs.jsonl from a directory
   *
   * Convenience method for parsing both entity types at once.
   *
   * @param dirPath - Path to .sudocode directory
   * @returns Object with issues and specs maps
   */
  parseDirectory(dirPath: string): {
    issues: Map<string, Issue>;
    specs: Map<string, Spec>;
  } {
    const issuesPath = `${dirPath}/issues.jsonl`;
    const specsPath = `${dirPath}/specs.jsonl`;

    const issues = this.parseJSONL(issuesPath) as Map<string, Issue>;
    const specs = this.parseJSONL(specsPath) as Map<string, Spec>;

    return { issues, specs };
  }
}
