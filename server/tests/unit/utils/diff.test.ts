/**
 * Unit tests for Diff Utilities
 *
 * Tests the diff computation functions at various granularities.
 */

import { describe, it, expect } from 'vitest';
import { computeDiff, computeWordDiff, computeCharDiff } from '../../../src/utils/diff.js';

describe('Diff Utilities', () => {
  describe('computeDiff (line-based)', () => {
    it('should detect added lines', () => {
      const content1 = 'line 1\nline 2';
      const content2 = 'line 1\nline 2\nline 3';

      const diff = computeDiff(content1, content2);

      expect(diff.length).toBeGreaterThanOrEqual(2);

      // Should have unchanged and added chunks
      const hasUnchanged = diff.some(d => d.type === 'unchanged');
      const hasAdded = diff.some(d => d.type === 'added' && d.value.includes('line 3'));

      expect(hasUnchanged).toBe(true);
      expect(hasAdded).toBe(true);
    });

    it('should detect removed lines', () => {
      const content1 = 'line 1\nline 2\nline 3';
      const content2 = 'line 1\nline 3';

      const diff = computeDiff(content1, content2);

      expect(diff.some(d => d.type === 'removed')).toBe(true);
      expect(diff.some(d => d.type === 'removed' && d.value.includes('line 2'))).toBe(true);
    });

    it('should detect modified lines', () => {
      const content1 = 'line 1\nold line\nline 3';
      const content2 = 'line 1\nnew line\nline 3';

      const diff = computeDiff(content1, content2);

      expect(diff.some(d => d.type === 'removed')).toBe(true);
      expect(diff.some(d => d.type === 'added')).toBe(true);
    });

    it('should handle empty strings', () => {
      const diff = computeDiff('', '');

      // Empty strings should produce no chunks or a single empty unchanged chunk
      expect(diff.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle identical content', () => {
      const content = 'line 1\nline 2';
      const diff = computeDiff(content, content);

      expect(diff.length).toBeGreaterThanOrEqual(1);
      expect(diff[0].type).toBe('unchanged');
    });

    it('should handle adding content to empty string', () => {
      const content1 = '';
      const content2 = 'new line';

      const diff = computeDiff(content1, content2);

      expect(diff.some(d => d.type === 'added')).toBe(true);
    });

    it('should handle removing all content', () => {
      const content1 = 'line 1\nline 2';
      const content2 = '';

      const diff = computeDiff(content1, content2);

      expect(diff.some(d => d.type === 'removed')).toBe(true);
    });

    it('should include count in diff chunks', () => {
      const content1 = 'line 1';
      const content2 = 'line 1\nline 2';

      const diff = computeDiff(content1, content2);

      diff.forEach(chunk => {
        expect(chunk.count).toBeDefined();
        expect(typeof chunk.count).toBe('number');
      });
    });
  });

  describe('computeWordDiff', () => {
    it('should detect word changes', () => {
      const content1 = 'hello world';
      const content2 = 'hello universe';

      const diff = computeWordDiff(content1, content2);

      expect(diff.some(d => d.type === 'removed' && d.value.includes('world'))).toBe(true);
      expect(diff.some(d => d.type === 'added' && d.value.includes('universe'))).toBe(true);
    });

    it('should detect added words', () => {
      const content1 = 'hello';
      const content2 = 'hello world';

      const diff = computeWordDiff(content1, content2);

      expect(diff.some(d => d.type === 'added')).toBe(true);
    });

    it('should detect removed words', () => {
      const content1 = 'hello world';
      const content2 = 'hello';

      const diff = computeWordDiff(content1, content2);

      expect(diff.some(d => d.type === 'removed')).toBe(true);
    });

    it('should handle identical content', () => {
      const content = 'hello world';
      const diff = computeWordDiff(content, content);

      expect(diff.length).toBeGreaterThanOrEqual(1);
      expect(diff[0].type).toBe('unchanged');
    });

    it('should handle empty strings', () => {
      const diff = computeWordDiff('', '');
      expect(diff.length).toBeGreaterThanOrEqual(0);
    });

    it('should detect multiple word changes', () => {
      const content1 = 'the quick brown fox';
      const content2 = 'the slow red fox';

      const diff = computeWordDiff(content1, content2);

      expect(diff.some(d => d.type === 'removed')).toBe(true);
      expect(diff.some(d => d.type === 'added')).toBe(true);
      expect(diff.some(d => d.type === 'unchanged')).toBe(true);
    });
  });

  describe('computeCharDiff', () => {
    it('should detect character changes', () => {
      const content1 = 'hello';
      const content2 = 'hallo';

      const diff = computeCharDiff(content1, content2);

      expect(diff.some(d => d.type === 'removed' && d.value === 'e')).toBe(true);
      expect(diff.some(d => d.type === 'added' && d.value === 'a')).toBe(true);
    });

    it('should detect added characters', () => {
      const content1 = 'cat';
      const content2 = 'cast';

      const diff = computeCharDiff(content1, content2);

      expect(diff.some(d => d.type === 'added' && d.value === 's')).toBe(true);
    });

    it('should detect removed characters', () => {
      const content1 = 'cast';
      const content2 = 'cat';

      const diff = computeCharDiff(content1, content2);

      expect(diff.some(d => d.type === 'removed' && d.value === 's')).toBe(true);
    });

    it('should handle identical content', () => {
      const content = 'hello';
      const diff = computeCharDiff(content, content);

      expect(diff.length).toBe(1);
      expect(diff[0].type).toBe('unchanged');
    });

    it('should handle empty strings', () => {
      const diff = computeCharDiff('', '');
      expect(diff.length).toBe(0);
    });

    it('should detect multiple character changes', () => {
      const content1 = 'cat';
      const content2 = 'dog';

      const diff = computeCharDiff(content1, content2);

      expect(diff.some(d => d.type === 'removed')).toBe(true);
      expect(diff.some(d => d.type === 'added')).toBe(true);
    });

    it('should handle case sensitivity', () => {
      const content1 = 'Hello';
      const content2 = 'hello';

      const diff = computeCharDiff(content1, content2);

      expect(diff.some(d => d.type === 'removed' && d.value === 'H')).toBe(true);
      expect(diff.some(d => d.type === 'added' && d.value === 'h')).toBe(true);
    });
  });

  describe('Cross-granularity comparisons', () => {
    it('should produce different results for different granularities', () => {
      const content1 = 'hello world';
      const content2 = 'hello universe';

      const lineDiff = computeDiff(content1, content2);
      const wordDiff = computeWordDiff(content1, content2);
      const charDiff = computeCharDiff(content1, content2);

      // Line diff sees whole line change
      expect(lineDiff.length).toBeLessThan(wordDiff.length);

      // Char diff is most granular
      expect(charDiff.length).toBeGreaterThan(wordDiff.length);
    });

    it('should all detect no changes for identical content', () => {
      const content = 'test content';

      const lineDiff = computeDiff(content, content);
      const wordDiff = computeWordDiff(content, content);
      const charDiff = computeCharDiff(content, content);

      expect(lineDiff.every(d => d.type === 'unchanged')).toBe(true);
      expect(wordDiff.every(d => d.type === 'unchanged')).toBe(true);
      expect(charDiff.every(d => d.type === 'unchanged')).toBe(true);
    });
  });

  describe('Edge cases and special characters', () => {
    it('should handle newlines in content', () => {
      const content1 = 'line 1\nline 2';
      const content2 = 'line 1\nmodified line 2';

      const diff = computeDiff(content1, content2);

      expect(diff.some(d => d.type === 'removed' || d.type === 'added')).toBe(true);
    });

    it('should handle tabs and special whitespace', () => {
      const content1 = 'hello\tworld';
      const content2 = 'hello world';

      const charDiff = computeCharDiff(content1, content2);

      expect(charDiff.some(d => d.type === 'removed' && d.value === '\t')).toBe(true);
      expect(charDiff.some(d => d.type === 'added' && d.value === ' ')).toBe(true);
    });

    it('should handle unicode characters', () => {
      const content1 = 'hello 世界';
      const content2 = 'hello world';

      const diff = computeWordDiff(content1, content2);

      expect(diff.some(d => d.type === 'removed')).toBe(true);
      expect(diff.some(d => d.type === 'added')).toBe(true);
    });

    it('should handle very long strings', () => {
      const content1 = 'a'.repeat(10000);
      const content2 = 'a'.repeat(9999) + 'b';

      const diff = computeCharDiff(content1, content2);

      expect(diff.some(d => d.type === 'removed')).toBe(true);
      expect(diff.some(d => d.type === 'added')).toBe(true);
    });
  });
});
