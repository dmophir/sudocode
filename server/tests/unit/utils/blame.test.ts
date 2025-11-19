/**
 * Unit tests for Blame Computation
 *
 * Tests the blame/attribution utilities that track line-by-line authorship.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as Database from 'better-sqlite3';
import { initDatabase as initCliDatabase } from '@sudocode-ai/cli/dist/db.js';
import { CRDTCoordinator } from '../../../src/services/crdt-coordinator.js';
import { CRDTAgent } from '../../../src/execution/crdt-agent.js';
import { computeBlame, computeBlameForRange } from '../../../src/utils/blame.js';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Blame Computation', () => {
  let db: Database.Database;
  let coordinator: CRDTCoordinator;
  let testDir: string;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    // Create temporary directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sudocode-test-blame-'));
    const testDbPath = path.join(testDir, 'cache.db');

    // Initialize database
    db = initCliDatabase({ path: testDbPath });

    // Use random port for testing
    port = 30000 + Math.floor(Math.random() * 1000);

    // Create HTTP server
    server = http.createServer();

    // Start server
    await new Promise<void>((resolve) => {
      server.listen(port, () => resolve());
    });

    // Create coordinator
    coordinator = new CRDTCoordinator(db, {
      path: '/ws/crdt',
      persistInterval: 100,
      gcInterval: 1000,
      historyRetentionMs: 60000 // 60 seconds for testing
    });

    // Initialize WebSocket server
    coordinator.init(server);
  });

  afterEach(async () => {
    // Shutdown coordinator
    if (coordinator) {
      await coordinator.shutdown();
    }

    // Close HTTP server
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }

    // Close database
    if (db) {
      db.close();
    }

    // Clean up test directory
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('computeBlame()', () => {
    it('should return empty blame for entity with no history', () => {
      const blame = computeBlame(coordinator, 's-nonexistent');
      expect(blame.lines).toHaveLength(0);
    });

    it('should attribute all lines to single author', async () => {
      const agent = new CRDTAgent({
        agentId: 'test-agent-1',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await agent.connect();

      agent.updateSpec('s-test1', {
        title: 'Test Spec',
        content: 'line 1\nline 2\nline 3',
        priority: 1
      });

      await new Promise(resolve => setTimeout(resolve, 200));
      await agent.disconnect();

      const blame = computeBlame(coordinator, 's-test1');

      expect(blame.lines.length).toBeGreaterThanOrEqual(3);

      // All lines should be attributed to test-agent-1
      blame.lines.forEach(line => {
        expect(line.author).toBe('test-agent-1');
        expect(line.timestamp).toBeDefined();
        expect(line.line).toBeDefined();
      });
    });

    it('should track multi-author changes', async () => {
      const agent1 = new CRDTAgent({
        agentId: 'author-1',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      const agent2 = new CRDTAgent({
        agentId: 'author-2',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await Promise.all([agent1.connect(), agent2.connect()]);

      // Agent 1 creates initial content
      agent1.updateSpec('s-collab', {
        title: 'Collaborative Spec',
        content: 'line 1\nline 2',
        priority: 1
      });

      await new Promise(resolve => setTimeout(resolve, 300));

      // Agent 2 adds a line
      agent2.updateSpec('s-collab', {
        title: 'Collaborative Spec',
        content: 'line 1\nline 2\nline 3 by agent2',
        priority: 1
      });

      await new Promise(resolve => setTimeout(resolve, 300));
      await Promise.all([agent1.disconnect(), agent2.disconnect()]);

      const blame = computeBlame(coordinator, 's-collab');

      expect(blame.lines.length).toBeGreaterThanOrEqual(3);

      // At least one line should be from author-1
      const hasAuthor1Lines = blame.lines.some(l => l.author === 'author-1');
      expect(hasAuthor1Lines).toBe(true);

      // Third line (with "agent2" in it) should be from author-2
      const line3 = blame.lines.find(l => l.line.includes('agent2'));
      expect(line3?.author).toBe('author-2');
    });

    it('should handle line modifications', async () => {
      const agent1 = new CRDTAgent({
        agentId: 'author-1',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      const agent2 = new CRDTAgent({
        agentId: 'author-2',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await Promise.all([agent1.connect(), agent2.connect()]);

      // Agent 1 creates initial content
      agent1.updateIssue('i-modify', {
        title: 'Test Issue',
        content: 'original line 1\noriginal line 2',
        status: 'open',
        priority: 1
      });

      await new Promise(resolve => setTimeout(resolve, 300));

      // Agent 2 modifies the second line
      agent2.updateIssue('i-modify', {
        content: 'original line 1\nmodified line 2 by agent2',
        status: 'open'
      });

      await new Promise(resolve => setTimeout(resolve, 300));
      await Promise.all([agent1.disconnect(), agent2.disconnect()]);

      const blame = computeBlame(coordinator, 'i-modify');

      expect(blame.lines.length).toBeGreaterThanOrEqual(2);

      // First line still from author-1
      const line1 = blame.lines.find(l => l.lineNumber === 1);
      expect(line1?.author).toBe('author-1');

      // Second line now from author-2
      const line2 = blame.lines.find(l => l.line.includes('modified'));
      expect(line2?.author).toBe('author-2');
    });

    it('should handle line deletions', async () => {
      const agent = new CRDTAgent({
        agentId: 'test-agent',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await agent.connect();

      // Create content with 3 lines
      agent.updateSpec('s-delete', {
        title: 'Delete Test',
        content: 'line 1\nline 2\nline 3',
        priority: 1
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      // Delete middle line
      agent.updateSpec('s-delete', {
        content: 'line 1\nline 3'
      });

      await new Promise(resolve => setTimeout(resolve, 200));
      await agent.disconnect();

      const blame = computeBlame(coordinator, 's-delete');

      // Should only have 2 lines now
      expect(blame.lines.length).toBeGreaterThanOrEqual(2);

      // Line numbers should be sequential
      const lineNumbers = blame.lines.map(l => l.lineNumber);
      expect(lineNumbers).toContain(1);
      expect(lineNumbers).toContain(2);
    });

    it('should use 1-indexed line numbers', async () => {
      const agent = new CRDTAgent({
        agentId: 'test-agent',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await agent.connect();

      agent.updateSpec('s-index', {
        title: 'Index Test',
        content: 'first line\nsecond line',
        priority: 1
      });

      await new Promise(resolve => setTimeout(resolve, 200));
      await agent.disconnect();

      const blame = computeBlame(coordinator, 's-index');

      expect(blame.lines.length).toBeGreaterThanOrEqual(2);
      expect(blame.lines[0].lineNumber).toBe(1);
      expect(blame.lines[1].lineNumber).toBe(2);
    });

    it('should include line content in blame', async () => {
      const agent = new CRDTAgent({
        agentId: 'test-agent',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await agent.connect();

      agent.updateSpec('s-content', {
        title: 'Content Test',
        content: 'hello world\nfoo bar',
        priority: 1
      });

      await new Promise(resolve => setTimeout(resolve, 200));
      await agent.disconnect();

      const blame = computeBlame(coordinator, 's-content');

      expect(blame.lines.length).toBeGreaterThanOrEqual(2);
      expect(blame.lines.some(l => l.line === 'hello world')).toBe(true);
      expect(blame.lines.some(l => l.line === 'foo bar')).toBe(true);
    });

    it('should handle empty content', async () => {
      const agent = new CRDTAgent({
        agentId: 'test-agent',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await agent.connect();

      agent.updateSpec('s-empty', {
        title: 'Empty Test',
        content: '',
        priority: 1
      });

      await new Promise(resolve => setTimeout(resolve, 200));
      await agent.disconnect();

      const blame = computeBlame(coordinator, 's-empty');

      expect(blame.lines).toHaveLength(0);
    });

    it('should handle single line content', async () => {
      const agent = new CRDTAgent({
        agentId: 'test-agent',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await agent.connect();

      agent.updateSpec('s-single', {
        title: 'Single Line',
        content: 'only one line',
        priority: 1
      });

      await new Promise(resolve => setTimeout(resolve, 200));
      await agent.disconnect();

      const blame = computeBlame(coordinator, 's-single');

      expect(blame.lines.length).toBeGreaterThanOrEqual(1);
      expect(blame.lines[0].line).toBe('only one line');
    });
  });

  describe('computeBlameForRange()', () => {
    it('should filter to requested range', async () => {
      const agent = new CRDTAgent({
        agentId: 'test-agent',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await agent.connect();

      agent.updateSpec('s-range', {
        title: 'Range Test',
        content: 'line 1\nline 2\nline 3\nline 4\nline 5',
        priority: 1
      });

      await new Promise(resolve => setTimeout(resolve, 200));
      await agent.disconnect();

      const blame = computeBlameForRange(coordinator, 's-range', 2, 4);

      expect(blame.lines.length).toBeGreaterThanOrEqual(3);

      const lineNumbers = blame.lines.map(l => l.lineNumber);
      expect(Math.min(...lineNumbers)).toBe(2);
      expect(Math.max(...lineNumbers)).toBe(4);
    });

    it('should handle single line range', async () => {
      const agent = new CRDTAgent({
        agentId: 'test-agent',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await agent.connect();

      agent.updateSpec('s-single-range', {
        title: 'Single Range',
        content: 'line 1\nline 2\nline 3',
        priority: 1
      });

      await new Promise(resolve => setTimeout(resolve, 200));
      await agent.disconnect();

      const blame = computeBlameForRange(coordinator, 's-single-range', 2, 2);

      expect(blame.lines.length).toBeGreaterThanOrEqual(1);
      expect(blame.lines[0].lineNumber).toBe(2);
    });

    it('should return empty for out-of-range query', async () => {
      const agent = new CRDTAgent({
        agentId: 'test-agent',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await agent.connect();

      agent.updateSpec('s-out-of-range', {
        title: 'Out of Range',
        content: 'line 1\nline 2',
        priority: 1
      });

      await new Promise(resolve => setTimeout(resolve, 200));
      await agent.disconnect();

      const blame = computeBlameForRange(coordinator, 's-out-of-range', 10, 20);

      expect(blame.lines).toHaveLength(0);
    });

    it('should handle partial overlap with document', async () => {
      const agent = new CRDTAgent({
        agentId: 'test-agent',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await agent.connect();

      agent.updateSpec('s-partial', {
        title: 'Partial Overlap',
        content: 'line 1\nline 2\nline 3',
        priority: 1
      });

      await new Promise(resolve => setTimeout(resolve, 200));
      await agent.disconnect();

      // Request lines 2-10, should only get 2-3
      const blame = computeBlameForRange(coordinator, 's-partial', 2, 10);

      expect(blame.lines.length).toBeGreaterThanOrEqual(2);

      const lineNumbers = blame.lines.map(l => l.lineNumber);
      expect(lineNumbers).toContain(2);
      expect(lineNumbers).toContain(3);
      expect(lineNumbers.every(n => n <= 3)).toBe(true);
    });
  });

  describe('Performance and edge cases', () => {
    it('should handle many updates efficiently', async () => {
      const agent = new CRDTAgent({
        agentId: 'perf-agent',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await agent.connect();

      // Make multiple sequential updates
      for (let i = 1; i <= 10; i++) {
        agent.updateSpec('s-perf', {
          title: 'Performance Test',
          content: `line 1\nline 2\nline ${i}`,
          priority: 1
        });
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      await agent.disconnect();

      const startTime = Date.now();
      const blame = computeBlame(coordinator, 's-perf');
      const duration = Date.now() - startTime;

      expect(blame.lines.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(1000); // Should complete in <1 second
    });

    it('should handle content with special characters', async () => {
      const agent = new CRDTAgent({
        agentId: 'test-agent',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await agent.connect();

      agent.updateSpec('s-special', {
        title: 'Special Chars',
        content: 'line with\ttabs\nline with "quotes"\nline with émojis 🎉',
        priority: 1
      });

      await new Promise(resolve => setTimeout(resolve, 200));
      await agent.disconnect();

      const blame = computeBlame(coordinator, 's-special');

      expect(blame.lines.length).toBeGreaterThanOrEqual(3);
      expect(blame.lines.some(l => l.line.includes('\t'))).toBe(true);
      expect(blame.lines.some(l => l.line.includes('"'))).toBe(true);
    });
  });
});
