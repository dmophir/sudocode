/**
 * Feedback anchor creation and manipulation utilities
 */

import * as crypto from 'crypto';
import type { FeedbackAnchor } from '../types.js';

export interface SectionInfo {
  heading: string;
  level: number;
  startLine: number;
}

/**
 * Create a feedback anchor at a specific line in spec content
 */
export function createFeedbackAnchor(
  specContent: string,
  lineNumber: number,
  charOffset?: number
): FeedbackAnchor {
  const lines = specContent.split('\n');

  // Validate line number
  if (lineNumber < 1 || lineNumber > lines.length) {
    throw new Error(`Line number ${lineNumber} is out of range (1-${lines.length})`);
  }

  const targetLine = lines[lineNumber - 1];

  // Find containing section
  const section = findContainingSection(lines, lineNumber);

  // Extract snippet with context
  const snippet = extractSnippet(targetLine, charOffset, 50);
  const contextBefore = getContext(lines, lineNumber, -50);
  const contextAfter = getContext(lines, lineNumber, 50);

  // Calculate relative offset from section start
  const lineOffset = section ? lineNumber - section.startLine : undefined;

  // Create content hash for validation
  const hash = createContentHash(snippet);

  return {
    section_heading: section?.heading,
    section_level: section?.level,
    line_number: lineNumber,
    line_offset: lineOffset,
    text_snippet: snippet,
    context_before: contextBefore,
    context_after: contextAfter,
    content_hash: hash,
    anchor_status: 'valid',
    last_verified_at: new Date().toISOString(),
    original_location: {
      line_number: lineNumber,
      section_heading: section?.heading,
    },
  };
}

/**
 * Create a feedback anchor by searching for text in spec content
 */
export function createAnchorByText(
  specContent: string,
  searchText: string
): FeedbackAnchor | null {
  const lines = specContent.split('\n');

  // Find the first line containing the search text
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const index = line.indexOf(searchText);

    if (index !== -1) {
      // Found it! Create anchor at this location
      const lineNumber = i + 1;
      return createFeedbackAnchor(specContent, lineNumber, index);
    }
  }

  // Not found
  return null;
}

/**
 * Find the section (markdown heading) containing a given line
 * Walks backwards from the line to find the nearest heading
 */
export function findContainingSection(
  lines: string[],
  lineNumber: number
): SectionInfo | null {
  // Walk backwards from the target line
  for (let i = lineNumber - 1; i >= 0; i--) {
    const line = lines[i];
    // Handle Windows line endings by trimming \r
    const match = line.match(/^(#{1,6})\s+(.+?)(\r)?$/);

    if (match) {
      const level = match[1].length;
      const heading = match[2].trim();
      return {
        heading,
        level,
        startLine: i + 1,
      };
    }
  }

  return null;
}

/**
 * Extract a text snippet from a line with optional character offset
 */
export function extractSnippet(
  line: string,
  charOffset?: number,
  maxLength: number = 50
): string {
  if (!line || line.trim() === '') {
    return '';
  }

  // Trim the line first
  const trimmed = line.trim();
  let start = 0;
  let end = trimmed.length;

  if (charOffset !== undefined) {
    // Adjust offset for trimmed line
    const leadingSpaces = line.length - line.trimStart().length;
    const adjustedOffset = Math.max(0, charOffset - leadingSpaces);

    // Center snippet around the char offset
    const halfLen = Math.floor(maxLength / 2);
    start = Math.max(0, adjustedOffset - halfLen);
    end = Math.min(trimmed.length, adjustedOffset + halfLen);
  } else {
    // Take from start
    end = Math.min(trimmed.length, maxLength);
  }

  let snippet = trimmed.substring(start, end);

  // Add ellipsis if truncated (no space before ellipsis)
  if (start > 0) {
    snippet = '...' + snippet;
  }
  if (end < trimmed.length) {
    snippet = snippet + '...';
  }

  return snippet;
}

/**
 * Get context around a line (before or after)
 * @param chars Number of characters to get (negative for before, positive for after)
 */
export function getContext(
  lines: string[],
  fromLine: number,
  chars: number
): string {
  if (chars === 0) {
    return '';
  }

  const direction = chars > 0 ? 1 : -1;
  const maxChars = Math.abs(chars);
  let collected = '';
  let currentLine = fromLine - 1; // Convert to 0-indexed

  if (direction > 0) {
    // Get context after
    currentLine += 1; // Start from next line
  } else {
    // Get context before
    currentLine -= 1; // Start from previous line
  }

  while (
    currentLine >= 0 &&
    currentLine < lines.length &&
    collected.length < maxChars
  ) {
    const line = lines[currentLine];
    const remaining = maxChars - collected.length;

    if (direction > 0) {
      // Adding after - append
      if (collected.length > 0) {
        collected += ' ';
      }
      collected += line.substring(0, remaining);
    } else {
      // Adding before - prepend
      const start = Math.max(0, line.length - remaining);
      const chunk = line.substring(start);
      if (collected.length > 0) {
        collected = chunk + ' ' + collected;
      } else {
        collected = chunk;
      }
    }

    currentLine += direction;
  }

  return collected.trim();
}

/**
 * Create a content hash for quick validation
 */
export function createContentHash(content: string): string {
  return crypto
    .createHash('sha256')
    .update(content)
    .digest('hex')
    .substring(0, 16);
}

/**
 * Verify that an anchor still points to the expected location
 */
export function verifyAnchor(
  specContent: string,
  anchor: FeedbackAnchor
): boolean {
  if (!anchor.line_number) {
    return false;
  }

  const lines = specContent.split('\n');

  if (anchor.line_number < 1 || anchor.line_number > lines.length) {
    return false;
  }

  const targetLine = lines[anchor.line_number - 1];

  // Check if the line still contains the snippet (remove ellipsis for matching)
  if (anchor.text_snippet && anchor.text_snippet.trim()) {
    const cleanSnippet = anchor.text_snippet.replace(/\.\.\./g, '').trim();
    if (cleanSnippet && !targetLine.includes(cleanSnippet)) {
      return false;
    }
  }

  // Check content hash if available (most reliable check)
  if (anchor.content_hash && anchor.text_snippet && anchor.text_snippet.trim()) {
    const currentSnippet = extractSnippet(targetLine, undefined, 50);
    if (currentSnippet) {
      const currentHash = createContentHash(currentSnippet);
      if (currentHash !== anchor.content_hash) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Get all section headings from spec content
 */
export function getAllSections(specContent: string): SectionInfo[] {
  const lines = specContent.split('\n');
  const sections: SectionInfo[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Handle Windows line endings
    const match = line.match(/^(#{1,6})\s+(.+?)(\r)?$/);

    if (match) {
      sections.push({
        heading: match[2].trim(),
        level: match[1].length,
        startLine: i + 1,
      });
    }
  }

  return sections;
}

/**
 * Search for text with context matching
 * Returns all matching locations with confidence scores
 */
export function searchByContent(
  specContent: string,
  snippet?: string,
  contextBefore?: string,
  contextAfter?: string
): Array<{ lineNumber: number; confidence: number }> {
  if (!snippet) {
    return [];
  }

  const lines = specContent.split('\n');
  const results: Array<{ lineNumber: number; confidence: number }> = [];

  // Clean snippet (remove ellipsis)
  const cleanSnippet = snippet.replace(/\.\.\./g, '').trim();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes(cleanSnippet)) {
      let confidence = 0.5; // Base confidence for snippet match

      // Boost confidence if context matches
      if (contextBefore) {
        const actualBefore = getContext(lines, i + 1, -50);
        if (actualBefore.includes(contextBefore.substring(0, 20))) {
          confidence += 0.25;
        }
      }

      if (contextAfter) {
        const actualAfter = getContext(lines, i + 1, 50);
        if (actualAfter.includes(contextAfter.substring(0, 20))) {
          confidence += 0.25;
        }
      }

      results.push({
        lineNumber: i + 1,
        confidence: Math.min(confidence, 1.0),
      });
    }
  }

  // Sort by confidence (highest first)
  return results.sort((a, b) => b.confidence - a.confidence);
}
