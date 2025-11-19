/**
 * Diff Computation Utilities
 *
 * Provides functions to compute diffs between content strings at various granularities.
 * Uses the 'diff' package for efficient diff computation.
 */

import * as Diff from 'diff';
import type { DiffChunk } from '@sudocode-ai/types';

/**
 * Compute line-based diff between two content strings
 *
 * @param content1 - The original content
 * @param content2 - The new content
 * @returns Array of diff chunks showing added, removed, and unchanged lines
 */
export function computeDiff(content1: string, content2: string): DiffChunk[] {
  const changes = Diff.diffLines(content1, content2);

  return changes.map((change) => ({
    type: change.added ? 'added' : change.removed ? 'removed' : 'unchanged',
    value: change.value,
    count: change.count || 0
  }));
}

/**
 * Compute word-based diff for more granular changes
 *
 * @param content1 - The original content
 * @param content2 - The new content
 * @returns Array of diff chunks showing added, removed, and unchanged words
 */
export function computeWordDiff(content1: string, content2: string): DiffChunk[] {
  const changes = Diff.diffWords(content1, content2);

  return changes.map((change) => ({
    type: change.added ? 'added' : change.removed ? 'removed' : 'unchanged',
    value: change.value,
    count: change.count || 0
  }));
}

/**
 * Compute character-based diff for fine-grained changes
 *
 * @param content1 - The original content
 * @param content2 - The new content
 * @returns Array of diff chunks showing added, removed, and unchanged characters
 */
export function computeCharDiff(content1: string, content2: string): DiffChunk[] {
  const changes = Diff.diffChars(content1, content2);

  return changes.map((change) => ({
    type: change.added ? 'added' : change.removed ? 'removed' : 'unchanged',
    value: change.value,
    count: change.count || 0
  }));
}
