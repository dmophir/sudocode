/**
 * JSONL merge conflict resolution
 *
 * Resolves git merge conflicts in issues.jsonl and specs.jsonl using:
 * - UUID-based deduplication
 * - Timestamp-based prioritization
 * - Metadata merging (relationships, tags)
 */

import * as fs from "fs";
import type { IssueJSONL, SpecJSONL } from "./types.js";
import { toYaml, fromYaml } from "./yaml-converter.js";
import { mergeYamlContent } from "./git-merge.js";
import { resolveConflicts } from "./yaml-conflict-resolver.js";

export type JSONLEntity = IssueJSONL | SpecJSONL | Record<string, any>;

/**
 * Conflict section from parsing git conflict markers
 */
export interface ConflictSection {
  type: "clean" | "conflict";
  lines: string[];
  ours?: string[];
  theirs?: string[];
  marker?: ConflictMarker;
}

/**
 * Conflict marker metadata
 */
export interface ConflictMarker {
  start: number;
  middle: number;
  end: number;
  oursLabel: string;
  theirsLabel: string;
}

/**
 * Resolution options
 */
export interface ResolveOptions {
  verbose?: boolean;
}

/**
 * Resolution result with statistics
 */
export interface ResolvedResult<T> {
  entities: T[];
  stats: ResolutionStats;
}

/**
 * Resolution statistics
 */
export interface ResolutionStats {
  totalInput: number;
  totalOutput: number;
  conflicts: ConflictResolution[];
}

/**
 * Individual conflict resolution record
 */
export interface ConflictResolution {
  type: "different-uuids" | "same-uuid-different-id" | "same-uuid-same-id";
  uuid: string;
  originalIds: string[];
  resolvedIds: string[];
  action: string;
}

/**
 * Check if file contains git conflict markers
 */
export function hasGitConflictMarkers(filePath: string): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const content = fs.readFileSync(filePath, "utf8");
  return (
    content.includes("<<<<<<<") &&
    content.includes("=======") &&
    content.includes(">>>>>>>")
  );
}

/**
 * Parse JSONL file containing git conflict markers
 * Returns structured representation of clean sections and conflicts
 */
export function parseMergeConflictFile(content: string): ConflictSection[] {
  const lines = content.split("\n");
  const sections: ConflictSection[] = [];
  let currentSection: ConflictSection | null = null;
  let inConflict = false;
  let conflictStart = -1;
  let conflictMiddle = -1;
  let oursLabel = "";
  let theirsLabel = "";
  let oursLines: string[] = [];
  let theirsLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Start of conflict
    if (line.startsWith("<<<<<<<")) {
      // Save any clean section
      if (currentSection) {
        sections.push(currentSection);
      }

      inConflict = true;
      conflictStart = i;
      oursLabel = line.substring(7).trim();
      oursLines = [];
      currentSection = null;
      continue;
    }

    // Middle of conflict
    if (line.startsWith("=======") && inConflict) {
      conflictMiddle = i;
      theirsLines = [];
      continue;
    }

    // End of conflict
    if (line.startsWith(">>>>>>>") && inConflict) {
      theirsLabel = line.substring(7).trim();

      sections.push({
        type: "conflict",
        lines: [],
        ours: oursLines,
        theirs: theirsLines,
        marker: {
          start: conflictStart,
          middle: conflictMiddle,
          end: i,
          oursLabel,
          theirsLabel,
        },
      });

      inConflict = false;
      conflictStart = -1;
      conflictMiddle = -1;
      oursLabel = "";
      theirsLabel = "";
      oursLines = [];
      theirsLines = [];
      continue;
    }

    // Accumulate lines
    if (inConflict) {
      if (conflictMiddle === -1) {
        oursLines.push(line);
      } else {
        theirsLines.push(line);
      }
    } else {
      // Clean line
      if (!currentSection || currentSection.type !== "clean") {
        currentSection = {
          type: "clean",
          lines: [],
        };
      }
      currentSection.lines.push(line);
    }
  }

  // Save final clean section
  if (currentSection) {
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Compare timestamps with normalization
 */
function compareTimestamps(
  a: string | undefined,
  b: string | undefined
): number {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;

  // Normalize timestamps to ISO format
  const normalizeTs = (ts: string) => {
    const hasZone =
      ts.endsWith("Z") ||
      ts.includes("+") ||
      /[+-]\d{2}:\d{2}$/.test(ts);
    return hasZone ? ts : ts.replace(" ", "T") + "Z";
  };

  const dateA = new Date(normalizeTs(a));
  const dateB = new Date(normalizeTs(b));

  return dateA.getTime() - dateB.getTime();
}

/**
 * Generate deterministic conflict ID
 */
function generateConflictId(originalId: string, uuid: string): string {
  return `${originalId}-conflict-${uuid.slice(0, 8)}`;
}

/**
 * Merge metadata from multiple versions of same entity
 */
export function mergeMetadata<T extends JSONLEntity>(entities: T[]): T {
  // Sort by updated_at, keep most recent as base
  const sorted = [...entities].sort((a, b) =>
    compareTimestamps(b.updated_at, a.updated_at)
  );

  const base = { ...sorted[0] };

  // Merge relationships (union of unique)
  const relationshipSet = new Set<string>();
  for (const entity of entities) {
    if ((entity as any).relationships) {
      for (const rel of (entity as any).relationships) {
        relationshipSet.add(JSON.stringify(rel));
      }
    }
  }
  if (relationshipSet.size > 0) {
    (base as any).relationships = Array.from(relationshipSet).map((r) =>
      JSON.parse(r)
    );
  }

  // Merge tags (union of unique)
  const tagSet = new Set<string>();
  for (const entity of entities) {
    if ((entity as any).tags) {
      for (const tag of (entity as any).tags) {
        tagSet.add(tag);
      }
    }
  }
  if (tagSet.size > 0) {
    (base as any).tags = Array.from(tagSet);
  }

  // Merge feedback if present (union of unique by id)
  if ((entities[0] as any).feedback) {
    const feedbackMap = new Map<string, any>();
    for (const entity of entities) {
      if ((entity as any).feedback) {
        for (const fb of (entity as any).feedback) {
          if (!feedbackMap.has(fb.id)) {
            feedbackMap.set(fb.id, fb);
          }
        }
      }
    }
    if (feedbackMap.size > 0) {
      (base as any).feedback = Array.from(feedbackMap.values());
    }
  }

  return base;
}

/**
 * Resolve all entities using UUID-based deduplication
 * Handles different UUIDs, same UUID conflicts, and metadata merging
 *
 * USE CASE: TWO-WAY MERGE
 * - Manual conflict resolution (sudocode resolve-conflicts)
 * - Conflicts already isolated by git conflict markers
 * - No base version available (git index cleared after conflict)
 * - Simple UUID deduplication is sufficient and faster
 * - No benefit from YAML expansion overhead
 *
 * DO NOT USE FOR: Three-way merge with base/ours/theirs
 * For that case, use mergeThreeWay() instead.
 */
export function resolveEntities<T extends JSONLEntity>(
  entities: T[],
  options: ResolveOptions = {}
): ResolvedResult<T> {
  const stats: ResolutionStats = {
    totalInput: entities.length,
    totalOutput: 0,
    conflicts: [],
  };

  // Group entities by UUID
  const byUuid = new Map<string, T[]>();
  for (const entity of entities) {
    if (!byUuid.has(entity.uuid)) {
      byUuid.set(entity.uuid, []);
    }
    byUuid.get(entity.uuid)!.push(entity);
  }

  const resolved: T[] = [];

  // Process each UUID group
  for (const [uuid, group] of Array.from(byUuid.entries())) {
    if (group.length === 1) {
      // No conflict - single entity with this UUID
      resolved.push(group[0]);
      continue;
    }

    // Check if all have same ID
    const ids = new Set(group.map((e) => e.id));

    if (ids.size === 1) {
      // Same UUID, same ID → Keep most recent, merge metadata
      const merged = mergeMetadata(group);
      resolved.push(merged);

      stats.conflicts.push({
        type: "same-uuid-same-id",
        uuid,
        originalIds: [group[0].id],
        resolvedIds: [merged.id],
        action: `Kept most recent version, merged ${group.length} versions`,
      });
    } else {
      // Same UUID, different IDs → Keep all, rename duplicates
      const sorted = [...group].sort((a, b) =>
        compareTimestamps(a.updated_at, b.updated_at)
      );

      // Keep most recent ID as-is
      const keeper = sorted[sorted.length - 1];
      resolved.push(keeper);

      const originalIds: string[] = [];
      const resolvedIds: string[] = [keeper.id];

      // Rename older versions
      for (let i = 0; i < sorted.length - 1; i++) {
        const entity = { ...sorted[i] } as T;
        originalIds.push(entity.id);

        // Always rename older versions
        entity.id = generateConflictId(entity.id, uuid);

        resolvedIds.push(entity.id);
        resolved.push(entity);
      }

      stats.conflicts.push({
        type: "same-uuid-different-id",
        uuid,
        originalIds,
        resolvedIds,
        action: `Renamed ${sorted.length - 1} conflicting IDs`,
      });
    }
  }

  // Handle ID collisions across different UUIDs (hash collisions)
  const idCounts = new Map<string, number>();
  const finalResolved: T[] = [];

  for (const entity of resolved) {
    const currentId = entity.id;

    if (!idCounts.has(currentId)) {
      // First entity with this ID
      idCounts.set(currentId, 1);
      finalResolved.push(entity);
    } else {
      // ID collision - rename with suffix
      const count = idCounts.get(currentId)!;
      const newEntity = { ...entity } as T;
      const newId = `${currentId}.${count}`;
      newEntity.id = newId;

      idCounts.set(currentId, count + 1);
      finalResolved.push(newEntity);

      stats.conflicts.push({
        type: "different-uuids",
        uuid: entity.uuid,
        originalIds: [currentId],
        resolvedIds: [newId],
        action: `Renamed ID to resolve hash collision (different UUIDs)`,
      });
    }
  }

  // Sort by created_at (git-friendly)
  finalResolved.sort((a, b) => {
    const aDate = a.created_at || "";
    const bDate = b.created_at || "";
    if (aDate < bDate) return -1;
    if (aDate > bDate) return 1;
    return (a.id || "").localeCompare(b.id || "");
  });

  stats.totalOutput = finalResolved.length;

  return { entities: finalResolved, stats };
}

/**
 * Three-way merge for git merge driver
 * Uses YAML expansion for line-level merging of multi-line text fields
 *
 * USE CASE: THREE-WAY MERGE
 * - Git merge driver operations (automatic merge)
 * - Worktree sync with true base/ours/theirs versions
 * - Line-level merging needed for multi-line text fields
 * - Enables auto-merging changes to different paragraphs/sections
 *
 * DO NOT USE FOR: Manual conflict resolution (use resolveEntities)
 *
 * This function implements true three-way merge semantics:
 * 1. Group entities by UUID across base/ours/theirs
 * 2. Handle deletion cases (modification wins over deletion)
 * 3. Merge metadata FIRST (tags, relationships, feedback)
 * 4. Apply merged metadata to all three versions
 * 5. Convert to YAML with multi-line text expansion
 * 6. Run git merge-file (line-level merging)
 * 7. Resolve remaining YAML conflicts (latest-wins)
 * 8. Convert back to JSON
 * 9. Handle ID collisions (hash conflicts with .1, .2 suffixes)
 * 10. Sort by created_at (git-friendly)
 */
export function mergeThreeWay<T extends JSONLEntity>(
  base: T[],
  ours: T[],
  theirs: T[]
): ResolvedResult<T> {
  const stats: ResolutionStats = {
    totalInput: base.length + ours.length + theirs.length,
    totalOutput: 0,
    conflicts: [],
  };

  // Step 1: Group entities by UUID across all three versions
  const byUuid = new Map<
    string,
    {
      base?: T;
      ours?: T;
      theirs?: T;
    }
  >();

  // Populate from all three versions
  for (const entity of base) {
    const existing = byUuid.get(entity.uuid) || {};
    byUuid.set(entity.uuid, { ...existing, base: entity });
  }
  for (const entity of ours) {
    const existing = byUuid.get(entity.uuid) || {};
    byUuid.set(entity.uuid, { ...existing, ours: entity });
  }
  for (const entity of theirs) {
    const existing = byUuid.get(entity.uuid) || {};
    byUuid.set(entity.uuid, { ...existing, theirs: entity });
  }

  const mergedEntities: T[] = [];

  // Step 2: Process each UUID group
  for (const [uuid, versions] of Array.from(byUuid.entries())) {
    const { base: baseEntity, ours: oursEntity, theirs: theirsEntity } =
      versions;

    // Step 2a: Handle deletion cases
    // Deleted in both → skip
    if (!oursEntity && !theirsEntity) {
      continue;
    }

    // Deleted in theirs, modified in ours → modification wins
    if (baseEntity && !theirsEntity && oursEntity) {
      mergedEntities.push(oursEntity);
      stats.conflicts.push({
        type: "same-uuid-same-id",
        uuid,
        originalIds: [baseEntity.id],
        resolvedIds: [oursEntity.id],
        action: `Kept ours (deleted in theirs, modified in ours)`,
      });
      continue;
    }

    // Deleted in ours, modified in theirs → modification wins
    if (baseEntity && !oursEntity && theirsEntity) {
      mergedEntities.push(theirsEntity);
      stats.conflicts.push({
        type: "same-uuid-same-id",
        uuid,
        originalIds: [baseEntity.id],
        resolvedIds: [theirsEntity.id],
        action: `Kept theirs (deleted in ours, modified in theirs)`,
      });
      continue;
    }

    // Added in only one side (no base)
    if (!baseEntity && oursEntity && !theirsEntity) {
      mergedEntities.push(oursEntity);
      continue;
    }
    if (!baseEntity && !oursEntity && theirsEntity) {
      mergedEntities.push(theirsEntity);
      continue;
    }

    // Added in both sides (no base) → use standard resolution
    if (!baseEntity && oursEntity && theirsEntity) {
      const resolved = resolveEntities([oursEntity, theirsEntity]);
      mergedEntities.push(...resolved.entities);
      stats.conflicts.push(...resolved.stats.conflicts);
      continue;
    }

    // Step 2b-c: Merge metadata FIRST (tags, relationships, feedback)
    // This eliminates metadata conflicts before YAML stage
    const versionsForMetadata = [baseEntity, oursEntity, theirsEntity].filter(
      (e): e is T => e !== undefined
    );
    const metadataMerged = mergeMetadata(versionsForMetadata);

    // Apply merged metadata to all versions
    const baseWithMetadata = baseEntity
      ? ({ ...baseEntity, ...metadataMerged } as T)
      : undefined;
    const oursWithMetadata = oursEntity
      ? ({ ...oursEntity, ...metadataMerged } as T)
      : ({ ...metadataMerged } as T);
    const theirsWithMetadata = theirsEntity
      ? ({ ...theirsEntity, ...metadataMerged } as T)
      : ({ ...metadataMerged } as T);

    // Step 3: Convert to YAML with multi-line text expansion
    const baseYaml = baseWithMetadata ? toYaml(baseWithMetadata) : "";
    const oursYaml = toYaml(oursWithMetadata);
    const theirsYaml = toYaml(theirsWithMetadata);

    try {
      // Step 4: Run git merge-file (line-level merging)
      const gitMergeResult = mergeYamlContent({
        base: baseYaml,
        ours: oursYaml,
        theirs: theirsYaml,
      });

      let finalYaml = gitMergeResult.content;

      // Step 5: Resolve remaining YAML conflicts (latest-wins)
      if (gitMergeResult.hasConflicts) {
        const resolveResult = resolveConflicts(
          finalYaml,
          oursWithMetadata.updated_at,
          theirsWithMetadata.updated_at
        );

        finalYaml = resolveResult.content;

        if (resolveResult.conflictsResolved > 0) {
          stats.conflicts.push({
            type: "same-uuid-same-id",
            uuid,
            originalIds: [baseEntity?.id || oursEntity?.id || theirsEntity?.id || "unknown"],
            resolvedIds: [oursEntity?.id || theirsEntity?.id || "unknown"],
            action: `Resolved ${resolveResult.conflictsResolved} YAML conflicts (latest-wins)`,
          });
        }
      }

      // Step 6: Convert back to JSON
      const mergedEntity = fromYaml(finalYaml) as T;
      mergedEntities.push(mergedEntity);
    } catch (error) {
      // If YAML merge fails, fall back to standard resolution
      const fallbackResolved = resolveEntities(versionsForMetadata);
      mergedEntities.push(...fallbackResolved.entities);
      stats.conflicts.push({
        type: "same-uuid-same-id",
        uuid,
        originalIds: versionsForMetadata.map((e) => e.id),
        resolvedIds: fallbackResolved.entities.map((e) => e.id),
        action: `YAML merge failed, used fallback resolution: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  // Step 7: Handle ID collisions (hash conflicts)
  const idCounts = new Map<string, number>();
  const finalResolved: T[] = [];

  for (const entity of mergedEntities) {
    const currentId = entity.id;

    if (!idCounts.has(currentId)) {
      // First entity with this ID
      idCounts.set(currentId, 1);
      finalResolved.push(entity);
    } else {
      // ID collision - rename with suffix
      const count = idCounts.get(currentId)!;
      const newEntity = { ...entity } as T;
      const newId = `${currentId}.${count}`;
      newEntity.id = newId;

      idCounts.set(currentId, count + 1);
      finalResolved.push(newEntity);

      stats.conflicts.push({
        type: "different-uuids",
        uuid: entity.uuid,
        originalIds: [currentId],
        resolvedIds: [newId],
        action: `Renamed ID to resolve hash collision (different UUIDs)`,
      });
    }
  }

  // Step 8: Sort by created_at (git-friendly)
  finalResolved.sort((a, b) => {
    const aDate = a.created_at || "";
    const bDate = b.created_at || "";
    if (aDate < bDate) return -1;
    if (aDate > bDate) return 1;
    return (a.id || "").localeCompare(b.id || "");
  });

  stats.totalOutput = finalResolved.length;

  return { entities: finalResolved, stats };
}
