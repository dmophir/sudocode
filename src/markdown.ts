/**
 * Markdown parser with frontmatter support
 */

import matter from 'gray-matter';
import * as fs from 'fs';

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
  type: 'spec' | 'issue';
  /**
   * Position in content
   */
  index: number;
}

/**
 * Parse markdown file with YAML frontmatter
 */
export function parseMarkdown<T extends object = Record<string, any>>(
  content: string
): ParsedMarkdown<T> {
  const parsed = matter(content);

  // Extract cross-references from content
  const references = extractCrossReferences(parsed.content);

  return {
    data: parsed.data as T,
    content: parsed.content,
    raw: content,
    references,
  };
}

/**
 * Parse markdown file from disk
 */
export function parseMarkdownFile<T extends object = Record<string, any>>(
  filePath: string
): ParsedMarkdown<T> {
  const content = fs.readFileSync(filePath, 'utf8');
  return parseMarkdown<T>(content);
}

/**
 * Extract cross-references from markdown content
 * Supports formats:
 * - [[spec-001]] - spec reference
 * - [[@issue-042]] - issue reference (with @ prefix)
 * - [[issue-001]] - issue reference (without @ prefix, detected by pattern)
 */
export function extractCrossReferences(content: string): CrossReference[] {
  const references: CrossReference[] = [];

  // Pattern: [[optional-@][entity-id]]
  // Matches: [[spec-001]], [[@issue-042]], [[issue-001]]
  const refPattern = /\[\[(@)?([a-z]+-\d+)\]\]/gi;

  let match: RegExpExecArray | null;

  while ((match = refPattern.exec(content)) !== null) {
    const hasAt = match[1] === '@';
    const id = match[2];

    // Determine type: @ prefix or starts with "issue"
    let type: 'spec' | 'issue';
    if (hasAt || id.startsWith('issue-')) {
      type = 'issue';
    } else {
      type = 'spec';
    }

    references.push({
      match: match[0],
      id,
      type,
      index: match.index,
    });
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
  const newData = {
    ...parsed.data,
    ...updates,
  };

  return matter.stringify(parsed.content, newData);
}

/**
 * Update frontmatter in a file
 */
export function updateFrontmatterFile<T extends object = Record<string, any>>(
  filePath: string,
  updates: Partial<T>
): void {
  const content = fs.readFileSync(filePath, 'utf8');
  const updated = updateFrontmatter(content, updates);
  fs.writeFileSync(filePath, updated, 'utf8');
}

/**
 * Check if a file has frontmatter
 */
export function hasFrontmatter(content: string): boolean {
  return content.trimStart().startsWith('---');
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
  fs.writeFileSync(filePath, markdown, 'utf8');
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
    status: 'valid' | 'relocated' | 'stale';
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

  const startIndex = feedbackSectionMatch.index! + feedbackSectionMatch[0].length;

  // Find the end of this section (next ## heading or end of content)
  const remainingContent = content.slice(startIndex);
  const endMatch = remainingContent.match(/^## /m);
  const sectionContent = endMatch
    ? remainingContent.slice(0, endMatch.index)
    : remainingContent;

  // Parse individual feedback items (### heading for each)
  const feedbackPattern = /^### (FB-\d+) → ([a-z]+-\d+)(?: \((.*?)\))?\s*\n\*\*Type:\*\* (.+?)\s*\n\*\*Location:\*\* (.*?)\s*\n\*\*Status:\*\* (.+?)\s*\n\n([\s\S]*?)(?=\n###|$)/gm;

  let match;
  while ((match = feedbackPattern.exec(sectionContent)) !== null) {
    const [, id, specId, specTitle, type, locationStr, status, content] = match;

    // Parse location string: "## Section Name, line 45 ✓" or "line 45 ⚠" or "Unknown ✗"
    const locationMatch = locationStr.match(/(?:(.+?),\s+)?line (\d+)\s*([✓⚠✗])/);

    const feedbackData: FeedbackMarkdownData = {
      id,
      specId,
      specTitle: specTitle || undefined,
      type: type.trim(),
      location: {
        section: locationMatch?.[1]?.trim(),
        line: locationMatch?.[2] ? parseInt(locationMatch[2]) : undefined,
        status: locationMatch?.[3] === '✓' ? 'valid' : locationMatch?.[3] === '⚠' ? 'relocated' : 'stale',
      },
      status: status.trim(),
      content: content.trim(),
      createdAt: '', // Would need to parse from content or get from DB
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
export function formatFeedbackForIssue(feedback: FeedbackMarkdownData[]): string {
  if (feedback.length === 0) {
    return '';
  }

  let output = '\n## Spec Feedback Provided\n\n';

  for (const fb of feedback) {
    // Determine status indicator
    const statusIndicator =
      fb.location.status === 'valid' ? '✓' :
      fb.location.status === 'relocated' ? '⚠' :
      '✗';

    // Format location
    let locationStr = '';
    if (fb.location.section && fb.location.line) {
      locationStr = `${fb.location.section}, line ${fb.location.line} ${statusIndicator}`;
    } else if (fb.location.line) {
      locationStr = `line ${fb.location.line} ${statusIndicator}`;
    } else {
      locationStr = `Unknown ${statusIndicator}`;
    }

    const titlePart = fb.specTitle ? ` (${fb.specTitle})` : '';

    output += `### ${fb.id} → ${fb.specId}${titlePart}\n`;
    output += `**Type:** ${fb.type}  \n`;
    output += `**Location:** ${locationStr}  \n`;
    output += `**Status:** ${fb.status}\n\n`;
    output += `${fb.content}\n`;

    if (fb.resolution) {
      output += `\n**Resolution:** ${fb.resolution}\n`;
    }

    output += '\n';
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
  const feedbackSectionMatch = issueContent.match(/^## Spec Feedback Provided\s*$/m);

  if (feedbackSectionMatch) {
    const startIndex = feedbackSectionMatch.index!;

    // Find the end of this section (next ## heading or end of content)
    const remainingContent = issueContent.slice(startIndex);
    const endMatch = remainingContent.match(/^## /m);

    if (endMatch && endMatch.index! > 0) {
      // There's another section after feedback
      const endIndex = startIndex + endMatch.index!;
      issueContent = issueContent.slice(0, startIndex) + issueContent.slice(endIndex);
    } else {
      // Feedback section is at the end
      issueContent = issueContent.slice(0, startIndex);
    }
  }

  // Append new feedback section
  const feedbackMarkdown = formatFeedbackForIssue(feedback);
  if (feedbackMarkdown) {
    // Ensure there's a blank line before the new section
    issueContent = issueContent.trimEnd() + '\n' + feedbackMarkdown;
  }

  return issueContent;
}
