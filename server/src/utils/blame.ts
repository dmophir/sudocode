/**
 * Blame/Attribution Computation Utilities
 *
 * Provides git-like blame functionality to track line-by-line authorship through
 * the full update history of a document.
 */

import * as Diff from 'diff';
import type { CRDTCoordinator } from '../services/crdt-coordinator.js';
import type { BlameInfo } from '@sudocode-ai/types';

/**
 * Compute line-by-line blame/attribution for an entity
 *
 * Processes the full update history chronologically to determine which author
 * (agent/client) last modified each line of the current document.
 *
 * @param coordinator - The CRDT coordinator instance
 * @param entityId - The entity ID (e.g., "i-test1", "s-test1")
 * @returns BlameInfo with line-by-line authorship details
 */
export function computeBlame(
  coordinator: CRDTCoordinator,
  entityId: string
): BlameInfo {
  const history = coordinator.getEntityHistory(entityId);

  if (history.length === 0) {
    return { lines: [] };
  }

  // Map to track authorship of each line by line number
  const lineAuthorship = new Map<number, {
    author: string;
    timestamp: number;
    line: string;
  }>();

  let previousContent = '';

  // Process each update chronologically to track how the document evolved
  for (const update of history) {
    if (!update.contentSnapshot) continue;

    const currentContent = update.contentSnapshot.content || '';
    const changes = Diff.diffLines(previousContent, currentContent);

    let currentLineNumber = 0;

    // Process each diff chunk
    for (const change of changes) {
      // Split into individual lines, filtering out empty trailing lines from split
      const lines = change.value.split('\n');
      // Remove the last element if it's empty (caused by trailing newline)
      if (lines[lines.length - 1] === '') {
        lines.pop();
      }

      if (change.added) {
        // New lines added by this author - attribute them
        for (const line of lines) {
          lineAuthorship.set(currentLineNumber, {
            author: update.clientId,
            timestamp: update.timestamp,
            line
          });
          currentLineNumber++;
        }
      } else if (!change.removed) {
        // Unchanged lines - keep existing authorship, just advance line number
        currentLineNumber += lines.length;
      }
      // Removed lines are dropped from authorship (don't increment line number)
    }

    previousContent = currentContent;
  }

  // Convert map to array and return with 1-indexed line numbers
  return {
    lines: Array.from(lineAuthorship.entries())
      .sort(([a], [b]) => a - b) // Sort by line number
      .map(([num, info]) => ({
        lineNumber: num + 1, // Convert to 1-indexed
        author: info.author,
        timestamp: info.timestamp,
        line: info.line
      }))
  };
}

/**
 * Get blame for a specific line range
 *
 * Computes full blame and then filters to the requested range.
 *
 * @param coordinator - The CRDT coordinator instance
 * @param entityId - The entity ID (e.g., "i-test1", "s-test1")
 * @param startLine - First line number (1-indexed, inclusive)
 * @param endLine - Last line number (1-indexed, inclusive)
 * @returns BlameInfo filtered to the specified range
 */
export function computeBlameForRange(
  coordinator: CRDTCoordinator,
  entityId: string,
  startLine: number,
  endLine: number
): BlameInfo {
  const fullBlame = computeBlame(coordinator, entityId);

  const filteredLines = fullBlame.lines.filter(
    line => line.lineNumber >= startLine && line.lineNumber <= endLine
  );

  return { lines: filteredLines };
}
