/**
 * Prompt resolver service
 *
 * Resolves entity references and file mentions in agent prompts:
 * - Injects [[s-xxxxx]] or @s-xxxxx spec references with markdown content
 * - Injects [[i-xxxxx]] or @i-xxxxx issue references with markdown content
 * - Tracks @file mentions but leaves them for agent to handle
 */

import type Database from "better-sqlite3";
import type { Spec, Issue } from "@sudocode-ai/types";
import { getSpecById } from "./specs.js";
import { getIssueById } from "./issues.js";

/**
 * Reference types found in prompts
 */
export type ReferenceType = "spec" | "issue" | "file";

/**
 * A reference found in a prompt
 */
export interface PromptReference {
  type: ReferenceType;
  id: string;
  found: boolean;
  error?: string;
}

/**
 * Result of prompt resolution
 */
export interface PromptResolutionResult {
  resolvedPrompt: string;
  references: PromptReference[];
  errors: string[];
  /** IDs of entities that were expanded (for tracking in follow-ups) */
  expandedEntityIds: string[];
}

/**
 * PromptResolver service
 *
 * Extracts and resolves entity references in agent prompts
 */
export class PromptResolver {
  constructor(private db: Database.Database) {}

  /**
   * Resolve all references in a prompt
   *
   * @param prompt - The raw prompt with [[entity-id]], @entity-id, and @file references
   * @param alreadyExpandedIds - Optional set of entity IDs that were already expanded in parent executions
   * @param implicitIssueId - Optional issue ID to automatically include even if not mentioned in prompt (for issue-based executions)
   * @returns Resolution result with resolved prompt, references, and errors
   */
  async resolve(
    prompt: string,
    alreadyExpandedIds: Set<string> = new Set(),
    implicitIssueId?: string
  ): Promise<PromptResolutionResult> {
    const references: PromptReference[] = [];
    const errors: string[] = [];
    const expandedEntityIds: string[] = [];

    // Extract all references (order matters - extract entity IDs first)
    const specRefs = this.extractSpecReferences(prompt);
    const issueRefs = this.extractIssueReferences(prompt);

    // Extract entity IDs for filtering file mentions
    const entityIds = new Set([
      ...specRefs.map((r) => r.id),
      ...issueRefs.map((r) => r.id),
    ]);

    const fileRefs = this.extractFileMentions(prompt, entityIds);

    // Track all references
    references.push(...fileRefs);

    // Resolve and inject specs (replace inline)
    let resolvedPrompt = prompt;
    for (const ref of specRefs) {
      // Skip if already expanded in parent execution
      if (alreadyExpandedIds.has(ref.id)) {
        ref.found = true;
        references.push(ref);
        continue;
      }

      const spec = getSpecById(this.db, ref.id);
      if (spec) {
        ref.found = true;
        resolvedPrompt = this.replaceReference(
          resolvedPrompt,
          ref.id,
          this.formatSpec(spec)
        );
        expandedEntityIds.push(ref.id);
      } else {
        ref.found = false;
        ref.error = `Spec ${ref.id} not found`;
        errors.push(ref.error);
      }
      references.push(ref);
    }

    // Resolve issues (keep reference, append content at end)
    const issueAppendixes: string[] = [];
    for (const ref of issueRefs) {
      // Skip if already expanded in parent execution
      if (alreadyExpandedIds.has(ref.id)) {
        ref.found = true;
        references.push(ref);
        continue;
      }

      const issue = getIssueById(this.db, ref.id);
      if (issue) {
        ref.found = true;
        // Don't replace the reference - append content at end instead
        issueAppendixes.push(
          `\n\nIssue ${ref.id}:\n${this.formatIssue(issue)}`
        );
        expandedEntityIds.push(ref.id);
      } else {
        ref.found = false;
        ref.error = `Issue ${ref.id} not found`;
        errors.push(ref.error);
      }
      references.push(ref);
    }

    // If an implicit issue ID is provided (for issue-based executions),
    // automatically include it even if not mentioned in the prompt
    if (implicitIssueId && !alreadyExpandedIds.has(implicitIssueId)) {
      // Check if it's already in the issueRefs (explicitly mentioned)
      const alreadyMentioned = issueRefs.some(
        (ref) => ref.id === implicitIssueId
      );

      if (!alreadyMentioned) {
        const issue = getIssueById(this.db, implicitIssueId);
        if (issue) {
          // Add implicit issue reference
          references.push({
            type: "issue",
            id: implicitIssueId,
            found: true,
          });
          // Append content at the end
          issueAppendixes.push(
            `\n\nIssue ${implicitIssueId}:\n${this.formatIssue(issue)}`
          );
          expandedEntityIds.push(implicitIssueId);
        } else {
          const error = `Implicit issue ${implicitIssueId} not found`;
          errors.push(error);
          references.push({
            type: "issue",
            id: implicitIssueId,
            found: false,
            error,
          });
        }
      }
    }

    // Append all issue contents at the end
    if (issueAppendixes.length > 0) {
      resolvedPrompt += issueAppendixes.join("");
    }

    return {
      resolvedPrompt,
      references,
      errors,
      expandedEntityIds,
    };
  }

  /**
   * Extract spec references from prompt
   * Supports two patterns:
   * - [[s-xxxxx]] (bracket syntax)
   * - @s-xxxxx (@ mention syntax)
   */
  private extractSpecReferences(prompt: string): PromptReference[] {
    const refs: PromptReference[] = [];

    // Extract bracket syntax: [[s-xxxxx]]
    const bracketPattern = /\[\[(s-[a-z0-9]+)\]\]/gi;
    const bracketMatches = prompt.matchAll(bracketPattern);
    for (const match of bracketMatches) {
      const id = match[1].toLowerCase();
      if (!refs.some((r) => r.id === id)) {
        refs.push({
          type: "spec",
          id,
          found: false,
        });
      }
    }

    // Extract @ mention syntax: @s-xxxxx
    const mentionPattern = /@(s-[a-z0-9]+)(?=\s|$|[^\w-])/gi;
    const mentionMatches = prompt.matchAll(mentionPattern);
    for (const match of mentionMatches) {
      const id = match[1].toLowerCase();
      if (!refs.some((r) => r.id === id)) {
        refs.push({
          type: "spec",
          id,
          found: false,
        });
      }
    }

    return refs;
  }

  /**
   * Extract issue references from prompt
   * Supports two patterns:
   * - [[i-xxxxx]] (bracket syntax)
   * - @i-xxxxx (@ mention syntax)
   */
  private extractIssueReferences(prompt: string): PromptReference[] {
    const refs: PromptReference[] = [];

    // Extract bracket syntax: [[i-xxxxx]]
    const bracketPattern = /\[\[(i-[a-z0-9]+)\]\]/gi;
    const bracketMatches = prompt.matchAll(bracketPattern);
    for (const match of bracketMatches) {
      const id = match[1].toLowerCase();
      if (!refs.some((r) => r.id === id)) {
        refs.push({
          type: "issue",
          id,
          found: false,
        });
      }
    }

    // Extract @ mention syntax: @i-xxxxx
    const mentionPattern = /@(i-[a-z0-9]+)(?=\s|$|[^\w-])/gi;
    const mentionMatches = prompt.matchAll(mentionPattern);
    for (const match of mentionMatches) {
      const id = match[1].toLowerCase();
      if (!refs.some((r) => r.id === id)) {
        refs.push({
          type: "issue",
          id,
          found: false,
        });
      }
    }

    return refs;
  }

  /**
   * Extract file mentions from prompt
   * Pattern: @filepath (but not @s-xxxxx or @i-xxxxx)
   *
   * Note: File mentions are tracked but not resolved (agent handles them)
   */
  private extractFileMentions(
    prompt: string,
    entityIds: Set<string>
  ): PromptReference[] {
    const pattern = /@([^\s@]+)/g;
    const matches = prompt.matchAll(pattern);
    const refs: PromptReference[] = [];

    for (const match of matches) {
      let path = match[1];

      // Remove trailing punctuation (period, comma, etc.)
      path = path.replace(/[.,;:!?]+$/, "");

      // Skip if it's a spec or issue ID (already handled)
      if (entityIds.has(path.toLowerCase())) {
        continue;
      }

      // Avoid duplicates
      if (!refs.some((r) => r.id === path)) {
        refs.push({
          type: "file",
          id: path,
          found: true, // Files are not resolved here, just tracked
        });
      }
    }

    return refs;
  }

  /**
   * Replace a reference with formatted content
   * Handles both [[id]] and @id syntaxes
   */
  private replaceReference(
    prompt: string,
    id: string,
    content: string
  ): string {
    // Replace bracket syntax: [[id]]
    const bracketPattern = new RegExp(`\\[\\[${id}\\]\\]`, "gi");
    prompt = prompt.replace(bracketPattern, content);

    // Replace @ mention syntax: @id
    const mentionPattern = new RegExp(`@${id}(?=\\s|$|[^\\w-])`, "gi");
    prompt = prompt.replace(mentionPattern, content);

    return prompt;
  }

  /**
   * Format spec - returns all information shown in CLI show command
   */
  private formatSpec(spec: Spec): string {
    const parts: string[] = [];

    // Header
    parts.push(`**${spec.id}: ${spec.title}**`);
    parts.push("");

    // Metadata
    parts.push(`**Priority:** ${spec.priority}`);
    if (spec.file_path) {
      parts.push(`**File:** ${spec.file_path}`);
    }
    if (spec.parent_id) {
      parts.push(`**Parent:** ${spec.parent_id}`);
    }
    parts.push(`**Created:** ${spec.created_at}`);
    parts.push(`**Updated:** ${spec.updated_at}`);

    // Tags
    const tags = this.getTags(spec.id, "spec");
    if (tags.length > 0) {
      parts.push(`**Tags:** ${tags.join(", ")}`);
    }

    // Relationships
    const outgoing = this.getOutgoingRelationships(spec.id, "spec");
    if (outgoing.length > 0) {
      parts.push("");
      parts.push("**Outgoing Relationships:**");
      for (const rel of outgoing) {
        parts.push(`- ${rel.relationship_type} → ${rel.to_id} (${rel.to_type})`);
      }
    }

    const incoming = this.getIncomingRelationships(spec.id, "spec");
    if (incoming.length > 0) {
      parts.push("");
      parts.push("**Incoming Relationships:**");
      for (const rel of incoming) {
        parts.push(`- ${rel.from_id} (${rel.from_type}) → ${rel.relationship_type}`);
      }
    }

    // Content
    if (spec.content) {
      parts.push("");
      parts.push("**Content:**");
      parts.push(spec.content);
    }

    return parts.join("\n");
  }

  /**
   * Format issue - returns all information shown in CLI show command
   */
  private formatIssue(issue: Issue): string {
    const parts: string[] = [];

    // Header
    parts.push(`**${issue.id}: ${issue.title}**`);
    parts.push("");

    // Metadata
    parts.push(`**Status:** ${issue.status}`);
    parts.push(`**Priority:** ${issue.priority}`);
    if (issue.assignee) {
      parts.push(`**Assignee:** ${issue.assignee}`);
    }
    if (issue.parent_id) {
      parts.push(`**Parent:** ${issue.parent_id}`);
    }
    parts.push(`**Created:** ${issue.created_at}`);
    parts.push(`**Updated:** ${issue.updated_at}`);
    if (issue.closed_at) {
      parts.push(`**Closed:** ${issue.closed_at}`);
    }

    // Tags
    const tags = this.getTags(issue.id, "issue");
    if (tags.length > 0) {
      parts.push(`**Tags:** ${tags.join(", ")}`);
    }

    // Relationships
    const outgoing = this.getOutgoingRelationships(issue.id, "issue");
    if (outgoing.length > 0) {
      parts.push("");
      parts.push("**Outgoing Relationships:**");
      for (const rel of outgoing) {
        parts.push(`- ${rel.relationship_type} → ${rel.to_id} (${rel.to_type})`);
      }
    }

    const incoming = this.getIncomingRelationships(issue.id, "issue");
    if (incoming.length > 0) {
      parts.push("");
      parts.push("**Incoming Relationships:**");
      for (const rel of incoming) {
        parts.push(`- ${rel.from_id} (${rel.from_type}) → ${rel.relationship_type}`);
      }
    }

    // Content
    if (issue.content) {
      parts.push("");
      parts.push("**Content:**");
      parts.push(issue.content);
    }

    return parts.join("\n");
  }

  /**
   * Get tags for an entity
   */
  private getTags(entityId: string, entityType: "spec" | "issue"): string[] {
    const query = this.db.prepare(`
      SELECT tag FROM tags WHERE entity_id = ? AND entity_type = ?
    `);
    const rows = query.all(entityId, entityType) as { tag: string }[];
    return rows.map((r) => r.tag);
  }

  /**
   * Get outgoing relationships for an entity
   */
  private getOutgoingRelationships(
    entityId: string,
    entityType: "spec" | "issue"
  ): Array<{
    relationship_type: string;
    to_id: string;
    to_type: string;
  }> {
    const query = this.db.prepare(`
      SELECT relationship_type, to_id, to_type
      FROM relationships
      WHERE from_id = ? AND from_type = ?
    `);
    return query.all(entityId, entityType) as Array<{
      relationship_type: string;
      to_id: string;
      to_type: string;
    }>;
  }

  /**
   * Get incoming relationships for an entity
   */
  private getIncomingRelationships(
    entityId: string,
    entityType: "spec" | "issue"
  ): Array<{
    relationship_type: string;
    from_id: string;
    from_type: string;
  }> {
    const query = this.db.prepare(`
      SELECT relationship_type, from_id, from_type
      FROM relationships
      WHERE to_id = ? AND to_type = ?
    `);
    return query.all(entityId, entityType) as Array<{
      relationship_type: string;
      from_id: string;
      from_type: string;
    }>;
  }
}
