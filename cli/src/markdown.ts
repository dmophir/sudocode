/**
 * Markdown parser with frontmatter support
 */

import matter from "gray-matter";
import * as fs from "fs";
import type Database from "better-sqlite3";
import { getSpec } from "./operations/specs.js";
import { getIssue } from "./operations/issues.js";
import { createFeedbackAnchor } from "./operations/feedback-anchors.js";
import type { LocationAnchor } from "@sudocode-ai/types";

export interface ParsedMarkdown<T extends object = Record<string, any>> {
  /**
   * Parsed frontmatter data
   */
  data: T;
  /**
   * Markdown content (without frontmatter)
   */
  content: string;
  /**
   * Original raw content
   */
  raw: string;
  /**
   * Cross-references found in content
   */
  references: CrossReference[];
}

export interface CrossReference {
  /**
   * The full matched text (e.g., "[[spec-001]]" or "[[@issue-042]]")
   */
  match: string;
  /**
   * The entity ID (e.g., "spec-001" or "issue-042")
   */
  id: string;
  /**
   * Entity type (spec or issue)
   */
  type: "spec" | "issue";
  /**
   * Position in content
   */
  index: number;
  /**
   * Optional display text (e.g., "Authentication" from "[[spec-001|Authentication]]")
   */
  displayText?: string;
  /**
   * Optional relationship type (e.g., "blocks" from "[[spec-001]]{ blocks }")
   * Defaults to "references" if not specified
   */
  relationshipType?: string;
  /**
   * Optional location anchor for spatial context of the reference
   */
  anchor?: LocationAnchor;
}

/**
 * Parse markdown file with YAML frontmatter
 * @param content - Markdown content to parse
 * @param db - Optional database for validating cross-references
 * @param outputDir - Optional output directory for loading config metadata
 */
export function parseMarkdown<T extends object = Record<string, any>>(
  content: string,
  db?: Database.Database,
  outputDir?: string
): ParsedMarkdown<T> {
  const parsed = matter(content);

  // Extract cross-references from content
  const references = extractCrossReferences(parsed.content, db);

  return {
    data: parsed.data as T,
    content: parsed.content,
    raw: content,
    references,
  };
}

/**
 * Parse markdown file from disk
 * @param filePath - Path to markdown file
 * @param db - Optional database for validating cross-references
 * @param outputDir - Optional output directory for loading config metadata
 */
export function parseMarkdownFile<T extends object = Record<string, any>>(
  filePath: string,
  db?: Database.Database,
  outputDir?: string
): ParsedMarkdown<T> {
  const content = fs.readFileSync(filePath, "utf8");
  return parseMarkdown<T>(content, db, outputDir);
}

/**
 * Convert character index to line number
 */
function getLineNumber(content: string, charIndex: number): number {
  const beforeMatch = content.substring(0, charIndex);
  return beforeMatch.split("\n").length;
}

/**
 * Convert FeedbackAnchor to LocationAnchor (strips tracking fields)
 */
function feedbackAnchorToLocationAnchor(
  feedbackAnchor: ReturnType<typeof createFeedbackAnchor>
): LocationAnchor {
  return {
    section_heading: feedbackAnchor.section_heading,
    section_level: feedbackAnchor.section_level,
    line_number: feedbackAnchor.line_number,
    line_offset: feedbackAnchor.line_offset,
    text_snippet: feedbackAnchor.text_snippet,
    context_before: feedbackAnchor.context_before,
    context_after: feedbackAnchor.context_after,
    content_hash: feedbackAnchor.content_hash,
  };
}

/**
 * Extract cross-references from markdown content
 * Supports formats:
 * - [[i-x7k9]] or [[s-14sh]] - hash-based entity reference
 * - [[@i-x7k9]] - entity reference with @ prefix (for clarity)
 * - [[i-x7k9|Display Text]] - with custom display text
 * - [[i-x7k9]]{ blocks } - with relationship type (shorthand)
 * - [[i-x7k9]]{ type: blocks } - with relationship type (explicit)
 * - [[i-x7k9|Display]]{ blocks } - combination of display text and type
 *
 * If db is provided, validates references against the database and determines entity type.
 * Only returns references to entities that actually exist.
 *
 * If db is not provided, determines entity type from hash-based ID prefix (i- or s-).
 */
export function extractCrossReferences(
  content: string,
  db?: Database.Database
): CrossReference[] {
  const references: CrossReference[] = [];

  // Pattern: [[optional-@][entity-id][|display-text]]optional-metadata
  // Supports hash-based IDs only:
  // - [[i-x7k9]] or [[s-14sh]]
  // - [[i-x7k9|Display Text]]
  // - [[i-x7k9]]{ blocks }
  // - [[i-x7k9]]{ type: depends-on }
  const refPattern =
    /\[\[(@)?([is]-[0-9a-z]{4,8})(?:\|([^\]]+))?\]\](?:\{\s*(?:type:\s*)?([a-z-]+)\s*\})?/gi;

  let match: RegExpExecArray | null;

  while ((match = refPattern.exec(content)) !== null) {
    const hasAt = match[1] === "@";
    const id = match[2];
    const displayText = match[3]?.trim();
    const relationshipType = match[4]?.trim();

    // Create location anchor for this reference
    let anchor: LocationAnchor | undefined;
    try {
      const lineNumber = getLineNumber(content, match.index);
      const feedbackAnchor = createFeedbackAnchor(
        content,
        lineNumber,
        match.index
      );
      anchor = feedbackAnchorToLocationAnchor(feedbackAnchor);
    } catch (error) {
      // If anchor creation fails, continue without it
      anchor = undefined;
    }

    if (db) {
      let entityType: "spec" | "issue" | null = null;
      try {
        const spec = getSpec(db, id);
        if (spec) {
          entityType = "spec";
        }
      } catch (error) {}

      if (!entityType) {
        try {
          const issue = getIssue(db, id);
          if (issue) {
            entityType = "issue";
          }
        } catch (error) {}
      }

      if (entityType) {
        references.push({
          match: match[0],
          id,
          type: entityType,
          index: match.index,
          displayText,
          relationshipType,
          anchor,
        });
      }
    } else {
      // Determine type from hash-based ID prefix
      // Hash IDs always use i- for issues, s- for specs
      const type: "spec" | "issue" = id.startsWith("i-") ? "issue" : "spec";

      references.push({
        match: match[0],
        id,
        type,
        index: match.index,
        displayText,
        relationshipType,
        anchor,
      });
    }
  }

  return references;
}

/**
 * Stringify frontmatter and content back to markdown
 */
export function stringifyMarkdown<T extends object = Record<string, any>>(
  data: T,
  content: string
): string {
  return matter.stringify(content, data);
}

/**
 * Update frontmatter in an existing markdown file
 * Preserves content unchanged
 */
export function updateFrontmatter<T extends object = Record<string, any>>(
  originalContent: string,
  updates: Partial<T>
): string {
  const parsed = matter(originalContent);

  // Merge updates into existing frontmatter
  const merged = {
    ...parsed.data,
    ...updates,
  };

  // Remove keys with undefined values (allows explicit removal of fields)
  const newData = Object.fromEntries(
    Object.entries(merged).filter(([_, value]) => value !== undefined)
  );

  return matter.stringify(parsed.content, newData);
}

/**
 * Update frontmatter in a file
 */
export function updateFrontmatterFile<T extends object = Record<string, any>>(
  filePath: string,
  updates: Partial<T>
): void {
  const content = fs.readFileSync(filePath, "utf8");
  const updated = updateFrontmatter(content, updates);
  fs.writeFileSync(filePath, updated, "utf8");
}

/**
 * Check if a file has frontmatter
 */
export function hasFrontmatter(content: string): boolean {
  return content.trimStart().startsWith("---");
}

/**
 * Create markdown with frontmatter
 */
export function createMarkdown<T extends object = Record<string, any>>(
  data: T,
  content: string
): string {
  return stringifyMarkdown(data, content);
}

/**
 * Write markdown file with frontmatter
 */
export function writeMarkdownFile<T extends object = Record<string, any>>(
  filePath: string,
  data: T,
  content: string
): void {
  const markdown = createMarkdown(data, content);
  fs.writeFileSync(filePath, markdown, "utf8");
}

/**
 * Remove frontmatter from markdown content
 */
export function removeFrontmatter(content: string): string {
  const parsed = matter(content);
  return parsed.content;
}

/**
 * Get only frontmatter data from markdown
 */
export function getFrontmatter<T extends object = Record<string, any>>(
  content: string
): T {
  const parsed = matter(content);
  return parsed.data as T;
}

// ============================================================================
// FEEDBACK MARKDOWN FUNCTIONS
// ============================================================================

export interface FeedbackMarkdownData {
  id: string;
  specId: string;
  specTitle?: string;
  type: string;
  location: {
    section?: string;
    line?: number;
    status: "valid" | "relocated" | "stale";
  };
  status: string;
  content: string;
  createdAt: string;
  resolution?: string;
}

/**
 * Parse feedback section from issue markdown content
 * Looks for "## Spec Feedback Provided" section
 */
export function parseFeedbackSection(content: string): FeedbackMarkdownData[] {
  const feedback: FeedbackMarkdownData[] = [];

  // Look for "## Spec Feedback Provided" section
  const feedbackSectionMatch = content.match(/^## Spec Feedback Provided\s*$/m);
  if (!feedbackSectionMatch) {
    return feedback;
  }

  const startIndex =
    feedbackSectionMatch.index! + feedbackSectionMatch[0].length;

  // Find the end of this section (next ## heading or end of content)
  const remainingContent = content.slice(startIndex);
  const endMatch = remainingContent.match(/^## /m);
  const sectionContent = endMatch
    ? remainingContent.slice(0, endMatch.index)
    : remainingContent;

  // Parse individual feedback items (### heading for each)
  const feedbackPattern =
    /^### (FB-\d+) → ([a-z]+-\d+)(?: \((.*?)\))?\s*\n\*\*Type:\*\* (.+?)\s*\n\*\*Location:\*\* (.*?)\s*\n\*\*Status:\*\* (.+?)\s*\n\n([\s\S]*?)(?=\n###|$)/gm;

  let match;
  while ((match = feedbackPattern.exec(sectionContent)) !== null) {
    const [, id, specId, specTitle, type, locationStr, status, content] = match;

    // Parse location string: "## Section Name, line 45 ✓" or "line 45 ⚠" or "Unknown ✗"
    const locationMatch = locationStr.match(
      /(?:(.+?),\s+)?line (\d+)\s*([✓⚠✗])/
    );

    const feedbackData: FeedbackMarkdownData = {
      id,
      specId,
      specTitle: specTitle || undefined,
      type: type.trim(),
      location: {
        section: locationMatch?.[1]?.trim(),
        line: locationMatch?.[2] ? parseInt(locationMatch[2]) : undefined,
        status:
          locationMatch?.[3] === "✓"
            ? "valid"
            : locationMatch?.[3] === "⚠"
              ? "relocated"
              : "stale",
      },
      status: status.trim(),
      content: content.trim(),
      createdAt: "", // Would need to parse from content or get from DB
    };

    // Check for resolution
    const resolutionMatch = content.match(/\*\*Resolution:\*\* (.+)/);
    if (resolutionMatch) {
      feedbackData.resolution = resolutionMatch[1].trim();
    }

    feedback.push(feedbackData);
  }

  return feedback;
}

/**
 * Format feedback data for inclusion in issue markdown
 */
export function formatFeedbackForIssue(
  feedback: FeedbackMarkdownData[]
): string {
  if (feedback.length === 0) {
    return "";
  }

  let output = "\n## Spec Feedback Provided\n\n";

  for (const fb of feedback) {
    // Determine status indicator
    const statusIndicator =
      fb.location.status === "valid"
        ? "✓"
        : fb.location.status === "relocated"
          ? "⚠"
          : "✗";

    // Format location
    let locationStr = "";
    if (fb.location.section && fb.location.line) {
      locationStr = `${fb.location.section}, line ${fb.location.line} ${statusIndicator}`;
    } else if (fb.location.line) {
      locationStr = `line ${fb.location.line} ${statusIndicator}`;
    } else {
      locationStr = `Unknown ${statusIndicator}`;
    }

    const titlePart = fb.specTitle ? ` (${fb.specTitle})` : "";

    output += `### ${fb.id} → ${fb.specId}${titlePart}\n`;
    output += `**Type:** ${fb.type}  \n`;
    output += `**Location:** ${locationStr}  \n`;
    output += `**Status:** ${fb.status}\n\n`;
    output += `${fb.content}\n`;

    if (fb.resolution) {
      output += `\n**Resolution:** ${fb.resolution}\n`;
    }

    output += "\n";
  }

  return output;
}

/**
 * Append or update feedback section in issue markdown
 */
export function updateFeedbackInIssue(
  issueContent: string,
  feedback: FeedbackMarkdownData[]
): string {
  // Remove existing feedback section if present
  const feedbackSectionMatch = issueContent.match(
    /^## Spec Feedback Provided\s*$/m
  );

  if (feedbackSectionMatch) {
    const startIndex = feedbackSectionMatch.index!;

    // Find the end of this section (next ## heading or end of content)
    const remainingContent = issueContent.slice(startIndex);
    const endMatch = remainingContent.match(/^## /m);

    if (endMatch && endMatch.index! > 0) {
      // There's another section after feedback
      const endIndex = startIndex + endMatch.index!;
      issueContent =
        issueContent.slice(0, startIndex) + issueContent.slice(endIndex);
    } else {
      // Feedback section is at the end
      issueContent = issueContent.slice(0, startIndex);
    }
  }

  // Append new feedback section
  const feedbackMarkdown = formatFeedbackForIssue(feedback);
  if (feedbackMarkdown) {
    // Ensure there's a blank line before the new section
    issueContent = issueContent.trimEnd() + "\n" + feedbackMarkdown;
  }

  return issueContent;
}

// ============================================================================
// AGENT PRESET MARKDOWN FUNCTIONS
// ============================================================================

import type { AgentPreset, AgentConfig } from "@sudocode-ai/types";
import * as path from "path";

export interface AgentPresetFrontmatter {
  // Metadata
  id: string;
  name: string;
  description: string;
  version: string;

  // Agent behavior
  agent_type: string;
  model?: string;

  // Tool permissions
  tools?: string[];
  mcp_servers?: string[];

  // Execution context
  max_context_tokens?: number;
  isolation_mode?: "subagent" | "isolated" | "shared";

  // Hooks
  hooks?: {
    before_execution?: string[];
    after_execution?: string[];
    on_error?: string[];
  };

  // Platform-specific configs
  platform_configs?: Record<string, any>;

  // Variables/parameters
  variables?: Record<string, any>;

  // Interoperability
  capabilities?: string[];
  protocols?: string[];
  tags?: string[];
}

/**
 * Parse an agent preset file (.agent.md)
 * @param filePath - Path to the .agent.md file
 * @returns Parsed AgentPreset object
 */
export function parseAgentPresetFile(filePath: string): AgentPreset {
  const content = fs.readFileSync(filePath, "utf8");
  const parsed = parseMarkdown<AgentPresetFrontmatter>(content);
  const stats = fs.statSync(filePath);

  // Validate required fields
  if (!parsed.data.id) {
    throw new Error(`Agent preset missing required field: id in ${filePath}`);
  }
  if (!parsed.data.name) {
    throw new Error(`Agent preset missing required field: name in ${filePath}`);
  }
  if (!parsed.data.description) {
    throw new Error(
      `Agent preset missing required field: description in ${filePath}`
    );
  }
  if (!parsed.data.version) {
    throw new Error(
      `Agent preset missing required field: version in ${filePath}`
    );
  }
  if (!parsed.data.agent_type) {
    throw new Error(
      `Agent preset missing required field: agent_type in ${filePath}`
    );
  }

  // Build AgentConfig from frontmatter
  const config: AgentConfig = {
    preset_id: parsed.data.id,
    agent_type: parsed.data.agent_type as any,
    model: parsed.data.model,
    system_prompt: parsed.content.trim(),
    tools: parsed.data.tools,
    mcp_servers: parsed.data.mcp_servers,
    max_context_tokens: parsed.data.max_context_tokens,
    isolation_mode: parsed.data.isolation_mode,
    hooks: parsed.data.hooks,
    variables: parsed.data.variables,
    platform_configs: parsed.data.platform_configs,
    capabilities: parsed.data.capabilities,
    protocols: parsed.data.protocols,
    tags: parsed.data.tags,
  };

  return {
    id: parsed.data.id,
    name: parsed.data.name,
    description: parsed.data.description,
    version: parsed.data.version,
    file_path: filePath,
    config,
    system_prompt: parsed.content.trim(),
    created_at: stats.birthtime.toISOString(),
    updated_at: stats.mtime.toISOString(),
  };
}

/**
 * Create a new agent preset file
 * @param outputPath - Path where the .agent.md file will be created
 * @param preset - Agent preset data
 */
export function createAgentPresetFile(
  outputPath: string,
  preset: Partial<AgentPreset> & {
    id: string;
    name: string;
    description: string;
  }
): void {
  const frontmatter: AgentPresetFrontmatter = {
    id: preset.id,
    name: preset.name,
    description: preset.description,
    version: preset.version || "1.0.0",
    agent_type: preset.config?.agent_type || "claude-code",
    model: preset.config?.model,
    tools: preset.config?.tools,
    mcp_servers: preset.config?.mcp_servers,
    max_context_tokens: preset.config?.max_context_tokens,
    isolation_mode: preset.config?.isolation_mode,
    hooks: preset.config?.hooks,
    platform_configs: preset.config?.platform_configs,
    variables: preset.config?.variables,
    capabilities: preset.config?.capabilities,
    protocols: preset.config?.protocols,
    tags: preset.config?.tags,
  };

  // Remove undefined fields
  const cleanFrontmatter = Object.fromEntries(
    Object.entries(frontmatter).filter(([_, value]) => value !== undefined)
  );

  const systemPrompt =
    preset.system_prompt ||
    `# System Prompt\n\nYou are ${preset.name}.\n\n${preset.description}\n\n## Instructions\n\n[Add detailed instructions here]`;

  writeMarkdownFile(outputPath, cleanFrontmatter, systemPrompt);
}

/**
 * Validate an agent preset configuration
 * @param preset - Agent preset to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateAgentPreset(preset: AgentPreset): string[] {
  const errors: string[] = [];

  // Required fields
  if (!preset.id) {
    errors.push("Missing required field: id");
  }
  if (!preset.name) {
    errors.push("Missing required field: name");
  }
  if (!preset.description) {
    errors.push("Missing required field: description");
  }
  if (!preset.version) {
    errors.push("Missing required field: version");
  }

  // Validate version format (semantic versioning)
  if (preset.version && !/^\d+\.\d+\.\d+$/.test(preset.version)) {
    errors.push(
      `Invalid version format: ${preset.version} (expected X.Y.Z format)`
    );
  }

  // Validate agent_type
  const validAgentTypes = [
    "claude-code",
    "codex",
    "cursor",
    "gemini-cli",
    "custom",
  ];
  if (
    preset.config.agent_type &&
    !validAgentTypes.includes(preset.config.agent_type)
  ) {
    errors.push(
      `Invalid agent_type: ${preset.config.agent_type} (must be one of: ${validAgentTypes.join(", ")})`
    );
  }

  // Validate isolation_mode
  const validIsolationModes = ["subagent", "isolated", "shared"];
  if (
    preset.config.isolation_mode &&
    !validIsolationModes.includes(preset.config.isolation_mode)
  ) {
    errors.push(
      `Invalid isolation_mode: ${preset.config.isolation_mode} (must be one of: ${validIsolationModes.join(", ")})`
    );
  }

  // Validate system prompt exists
  if (!preset.system_prompt || preset.system_prompt.trim().length === 0) {
    errors.push("Missing or empty system prompt");
  }

  return errors;
}
