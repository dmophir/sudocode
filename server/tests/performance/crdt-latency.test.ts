/**
 * CRDT Latency Performance Tests
 *
 * Tests update propagation latency to ensure <100ms p95 target.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CRDTAgent } from '../../src/execution/crdt-agent.js';
import { CRDTCoordinator } from '../../src/services/crdt-coordinator.js';
import * as Database from 'better-sqlite3';
import { initDatabase as initCliDatabase } from '@sudocode-ai/cli/dist/db.js';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface LatencyMeasurement {
  value: number;
  timestamp: number;
}

function calculatePercentile(measurements: number[], percentile: number): number {
  const sorted = measurements.sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[index];
}

function calculateStats(measurements: number[]) {
  const sorted = measurements.sort((a, b) => a - b);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: measurements.reduce((a, b) => a + b, 0) / measurements.length,
    p50: calculatePercentile(measurements, 50),
    p95: calculatePercentile(measurements, 95),
    p99: calculatePercentile(measurements, 99),
  };
}

describe('CRDT Latency Benchmarks', () => {
  let db: Database.Database;
  let coordinator: CRDTCoordinator;
  let agent: CRDTAgent;
  let testDbPath: string;
  let testDir: string;
  let server: http.Server;
  let port: number;
  let wsPath: string;
  let coordinatorUrl: string;

  beforeEach(async () => {
    // Create temporary directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sudocode-perf-'));
    testDbPath = path.join(testDir, 'cache.db');

    // Initialize database
    db = initCliDatabase({ path: testDbPath });

    // Use random port for testing
    port = 30000 + Math.floor(Math.random() * 1000);
    wsPath = '/ws/crdt';

    // Create HTTP server
    server = http.createServer();

    // Start server
    await new Promise<void>((resolve) => {
      server.listen(port, () => resolve());
    });

    // Create coordinator
    coordinator = new CRDTCoordinator(db, {
      path: wsPath,
      persistInterval: 100,
      gcInterval: 60000
    });
    coordinator.init(server);

    // Construct coordinator URL
    coordinatorUrl = `ws://localhost:${port}${wsPath}`;
  });

  afterEach(async () => {
    // Disconnect agent
    if (agent) {
      await agent.disconnect();
    }

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
    if (db && db.open) {
      db.close();
    }

    // Clean up test directory
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Worktree to Coordinator Latency', () => {
    it('should propagate updates in <100ms (p95)', async () => {
      agent = new CRDTAgent({
        agentId: 'latency-test',
        coordinatorUrl
      });

      await agent.connect();
      await new Promise(resolve => setTimeout(resolve, 100));

      const measurements: number[] = [];
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        const issueId = `i-latency-${i}`;

        // Agent updates issue
        agent.updateIssue(issueId, {
          id: issueId,
          title: `Latency Test ${i}`,
          content: 'Test content',
          status: 'open',
          priority: 1,
          archived: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastModifiedBy: 'latency-test',
          version: 1
        });

        // Wait for coordinator to receive update
        await new Promise<void>((resolve) => {
          const checkInterval = setInterval(() => {
            const coordYdoc = (coordinator as any).ydoc;
            const issueMap = coordYdoc.getMap('issueUpdates');
            const issue = issueMap.get(issueId);

            if (issue && issue.title === `Latency Test ${i}`) {
              clearInterval(checkInterval);
              const endTime = performance.now();
              measurements.push(endTime - startTime);
              resolve();
            }
          }, 1);
        });

        // Small delay between iterations
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const stats = calculateStats(measurements);

      console.log('\nWorktree → Coordinator Latency:');
      console.log(`  Min: ${stats.min.toFixed(2)}ms`);
      console.log(`  Mean: ${stats.mean.toFixed(2)}ms`);
      console.log(`  p50: ${stats.p50.toFixed(2)}ms`);
      console.log(`  p95: ${stats.p95.toFixed(2)}ms`);
      console.log(`  p99: ${stats.p99.toFixed(2)}ms`);
      console.log(`  Max: ${stats.max.toFixed(2)}ms`);

      // Performance target: p95 < 100ms
      expect(stats.p95).toBeLessThan(100);
    });
  });

  describe('Coordinator to Worktree Latency', () => {
    it('should propagate coordinator updates to agents in <100ms (p95)', async () => {
      agent = new CRDTAgent({
        agentId: 'reverse-latency-test',
        coordinatorUrl
      });

      await agent.connect();
      await new Promise(resolve => setTimeout(resolve, 100));

      const measurements: number[] = [];
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        const issueId = `i-reverse-${i}`;

        // Coordinator updates issue
        coordinator.updateIssue(issueId, {
          id: issueId,
          title: `Reverse Latency Test ${i}`,
          content: 'Test content',
          status: 'open',
          priority: 1,
          archived: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastModifiedBy: 'coordinator',
          version: 1
        });

        // Wait for agent to receive update
        await new Promise<void>((resolve) => {
          const checkInterval = setInterval(() => {
            const agentYdoc = (agent as any).ydoc;
            const issueMap = agentYdoc.getMap('issueUpdates');
            const issue = issueMap.get(issueId);

            if (issue && issue.title === `Reverse Latency Test ${i}`) {
              clearInterval(checkInterval);
              const endTime = performance.now();
              measurements.push(endTime - startTime);
              resolve();
            }
          }, 1);
        });

        // Small delay between iterations
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const stats = calculateStats(measurements);

      console.log('\nCoordinator → Worktree Latency:');
      console.log(`  Min: ${stats.min.toFixed(2)}ms`);
      console.log(`  Mean: ${stats.mean.toFixed(2)}ms`);
      console.log(`  p50: ${stats.p50.toFixed(2)}ms`);
      console.log(`  p95: ${stats.p95.toFixed(2)}ms`);
      console.log(`  p99: ${stats.p99.toFixed(2)}ms`);
      console.log(`  Max: ${stats.max.toFixed(2)}ms`);

      // Performance target: p95 < 100ms
      expect(stats.p95).toBeLessThan(100);
    });
  });

  describe('Agent to Agent Latency', () => {
    it('should propagate updates between agents in <100ms (p95)', async () => {
      const agent1 = new CRDTAgent({
        agentId: 'agent-1',
        coordinatorUrl
      });

      const agent2 = new CRDTAgent({
        agentId: 'agent-2',
        coordinatorUrl
      });

      await Promise.all([agent1.connect(), agent2.connect()]);
      await new Promise(resolve => setTimeout(resolve, 100));

      const measurements: number[] = [];
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        const issueId = `i-peer-${i}`;

        // Agent 1 updates issue
        agent1.updateIssue(issueId, {
          id: issueId,
          title: `Peer Latency Test ${i}`,
          content: 'Test content',
          status: 'open',
          priority: 1,
          archived: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastModifiedBy: 'agent-1',
          version: 1
        });

        // Wait for agent 2 to receive update
        await new Promise<void>((resolve) => {
          const checkInterval = setInterval(() => {
            const agent2Ydoc = (agent2 as any).ydoc;
            const issueMap = agent2Ydoc.getMap('issueUpdates');
            const issue = issueMap.get(issueId);

            if (issue && issue.title === `Peer Latency Test ${i}`) {
              clearInterval(checkInterval);
              const endTime = performance.now();
              measurements.push(endTime - startTime);
              resolve();
            }
          }, 1);
        });

        // Small delay between iterations
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const stats = calculateStats(measurements);

      console.log('\nAgent → Agent Latency (via Coordinator):');
      console.log(`  Min: ${stats.min.toFixed(2)}ms`);
      console.log(`  Mean: ${stats.mean.toFixed(2)}ms`);
      console.log(`  p50: ${stats.p50.toFixed(2)}ms`);
      console.log(`  p95: ${stats.p95.toFixed(2)}ms`);
      console.log(`  p99: ${stats.p99.toFixed(2)}ms`);
      console.log(`  Max: ${stats.max.toFixed(2)}ms`);

      // Cleanup
      await agent1.disconnect();
      await agent2.disconnect();

      // Performance target: p95 < 100ms
      expect(stats.p95).toBeLessThan(100);
    });
  });
});
