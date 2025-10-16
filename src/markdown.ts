/**
 * Markdown parser with frontmatter support
 */

import matter from 'gray-matter';
import * as fs from 'fs';

export interface ParsedMarkdown<T = Record<string, any>> {
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
export function parseMarkdown<T = Record<string, any>>(
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
export function parseMarkdownFile<T = Record<string, any>>(
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
export function stringifyMarkdown<T = Record<string, any>>(
  data: T,
  content: string
): string {
  return matter.stringify(content, data);
}

/**
 * Update frontmatter in an existing markdown file
 * Preserves content unchanged
 */
export function updateFrontmatter<T = Record<string, any>>(
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
export function updateFrontmatterFile<T = Record<string, any>>(
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
export function createMarkdown<T = Record<string, any>>(
  data: T,
  content: string
): string {
  return stringifyMarkdown(data, content);
}

/**
 * Write markdown file with frontmatter
 */
export function writeMarkdownFile<T = Record<string, any>>(
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
export function getFrontmatter<T = Record<string, any>>(
  content: string
): T {
  const parsed = matter(content);
  return parsed.data as T;
}
