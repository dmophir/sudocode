/**
 * CRDT Throughput Performance Tests
 *
 * Tests system throughput to ensure >1000 updates/min target.
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

interface ThroughputMeasurement {
  updatesPerSecond: number;
  totalUpdates: number;
  durationMs: number;
}

describe('CRDT Throughput Benchmarks', () => {
  let db: Database.Database;
  let coordinator: CRDTCoordinator;
  let testDbPath: string;
  let testDir: string;
  let server: http.Server;
  let port: number;
  let wsPath: string;
  let coordinatorUrl: string;

  beforeEach(async () => {
    // Create temporary directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sudocode-throughput-'));
    testDbPath = path.join(testDir, 'cache.db');

    // Initialize database
    db = initCliDatabase({ path: testDbPath });

    // Use random port for testing
    port = 31000 + Math.floor(Math.random() * 1000);
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

  describe('Sustained Load', () => {
    it('should handle 1000 updates/minute sustained load', async () => {
      const agent = new CRDTAgent({
        agentId: 'sustained-load',
        coordinatorUrl
      });

      await agent.connect();
      await new Promise(resolve => setTimeout(resolve, 100));

      const targetUpdatesPerMinute = 1000;
      const testDurationSeconds = 10; // 10 second test
      const targetUpdatesPerSecond = targetUpdatesPerMinute / 60;
      const totalUpdates = Math.floor(targetUpdatesPerSecond * testDurationSeconds);
      const delayBetweenUpdates = (testDurationSeconds * 1000) / totalUpdates;

      console.log(`\nSustained Load Test:`);
      console.log(`  Target: ${targetUpdatesPerMinute} updates/min`);
      console.log(`  Test duration: ${testDurationSeconds}s`);
      console.log(`  Total updates: ${totalUpdates}`);
      console.log(`  Delay between updates: ${delayBetweenUpdates.toFixed(2)}ms`);

      const startTime = performance.now();

      // Send updates at steady rate
      for (let i = 0; i < totalUpdates; i++) {
        const issueId = `i-sustained-${i}`;
        agent.updateIssue(issueId, {
          id: issueId,
          title: `Sustained Load Test ${i}`,
          content: 'Test content',
          status: 'open',
          priority: 1,
          archived: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastModifiedBy: 'sustained-load',
          version: 1
        });

        // Wait for next update interval
        await new Promise(resolve => setTimeout(resolve, delayBetweenUpdates));
      }

      const endTime = performance.now();
      const durationMs = endTime - startTime;
      const durationSec = durationMs / 1000;
      const actualUpdatesPerSecond = totalUpdates / durationSec;
      const actualUpdatesPerMinute = actualUpdatesPerSecond * 60;

      console.log(`\nSustained Load Results:`);
      console.log(`  Total updates: ${totalUpdates}`);
      console.log(`  Duration: ${durationSec.toFixed(2)}s`);
      console.log(`  Updates/sec: ${actualUpdatesPerSecond.toFixed(2)}`);
      console.log(`  Updates/min: ${actualUpdatesPerMinute.toFixed(2)}`);

      await agent.disconnect();

      // Should meet or exceed target
      expect(actualUpdatesPerMinute).toBeGreaterThanOrEqual(targetUpdatesPerMinute * 0.95); // 95% of target
    }, 30000); // 30 second timeout
  });

  describe('Burst Load', () => {
    it('should handle 100 updates in 1 second', async () => {
      const agent = new CRDTAgent({
        agentId: 'burst-load',
        coordinatorUrl
      });

      await agent.connect();
      await new Promise(resolve => setTimeout(resolve, 100));

      const burstSize = 100;
      console.log(`\nBurst Load Test:`);
      console.log(`  Burst size: ${burstSize} updates`);

      const startTime = performance.now();

      // Send all updates as fast as possible
      const promises: Promise<void>[] = [];
      for (let i = 0; i < burstSize; i++) {
        const issueId = `i-burst-${i}`;
        agent.updateIssue(issueId, {
          id: issueId,
          title: `Burst Test ${i}`,
          content: 'Test content',
          status: 'open',
          priority: 1,
          archived: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastModifiedBy: 'burst-load',
          version: 1
        });
      }

      // Wait for all updates to be sent
      await new Promise(resolve => setTimeout(resolve, 100));

      const endTime = performance.now();
      const durationMs = endTime - startTime;
      const updatesPerSecond = (burstSize / durationMs) * 1000;

      console.log(`\nBurst Load Results:`);
      console.log(`  Total updates: ${burstSize}`);
      console.log(`  Duration: ${durationMs.toFixed(2)}ms`);
      console.log(`  Updates/sec: ${updatesPerSecond.toFixed(2)}`);

      await agent.disconnect();

      // Should complete burst in under 2 seconds
      expect(durationMs).toBeLessThan(2000);
      // Should achieve at least 50 updates/sec during burst
      expect(updatesPerSecond).toBeGreaterThan(50);
    });
  });

  describe('Concurrent Agents', () => {
    it('should handle 10 concurrent agents each sending updates', async () => {
      const agentCount = 10;
      const updatesPerAgent = 50;
      const agents: CRDTAgent[] = [];

      console.log(`\nConcurrent Agents Test:`);
      console.log(`  Agent count: ${agentCount}`);
      console.log(`  Updates per agent: ${updatesPerAgent}`);
      console.log(`  Total updates: ${agentCount * updatesPerAgent}`);

      // Create and connect all agents
      for (let i = 0; i < agentCount; i++) {
        const agent = new CRDTAgent({
          agentId: `concurrent-agent-${i}`,
          coordinatorUrl
        });
        agents.push(agent);
        await agent.connect();
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      const startTime = performance.now();

      // Each agent sends updates concurrently
      const agentTasks = agents.map(async (agent, agentIndex) => {
        for (let i = 0; i < updatesPerAgent; i++) {
          const issueId = `i-agent${agentIndex}-${i}`;
          agent.updateIssue(issueId, {
            id: issueId,
            title: `Concurrent Test Agent ${agentIndex} Update ${i}`,
            content: 'Test content',
            status: 'open',
            priority: 1,
            archived: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            lastModifiedBy: `concurrent-agent-${agentIndex}`,
            version: 1
          });

          // Small delay between updates from same agent
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      });

      // Wait for all agents to complete
      await Promise.all(agentTasks);

      const endTime = performance.now();
      const durationMs = endTime - startTime;
      const totalUpdates = agentCount * updatesPerAgent;
      const updatesPerSecond = (totalUpdates / durationMs) * 1000;
      const updatesPerMinute = updatesPerSecond * 60;

      console.log(`\nConcurrent Agents Results:`);
      console.log(`  Total updates: ${totalUpdates}`);
      console.log(`  Duration: ${(durationMs / 1000).toFixed(2)}s`);
      console.log(`  Updates/sec: ${updatesPerSecond.toFixed(2)}`);
      console.log(`  Updates/min: ${updatesPerMinute.toFixed(2)}`);

      // Disconnect all agents
      await Promise.all(agents.map(agent => agent.disconnect()));

      // Should handle concurrent load efficiently
      expect(updatesPerMinute).toBeGreaterThan(1000);
    }, 60000); // 60 second timeout
  });

  describe('Memory Usage', () => {
    it('should track memory usage during sustained load', async () => {
      const agent = new CRDTAgent({
        agentId: 'memory-test',
        coordinatorUrl
      });

      await agent.connect();
      await new Promise(resolve => setTimeout(resolve, 100));

      const memorySnapshots: number[] = [];
      const updateCount = 500;

      // Take initial memory snapshot
      const initialMemory = process.memoryUsage();
      memorySnapshots.push(initialMemory.heapUsed);

      console.log(`\nMemory Usage Test:`);
      console.log(`  Initial heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);

      // Send updates and track memory
      for (let i = 0; i < updateCount; i++) {
        const issueId = `i-memory-${i}`;
        agent.updateIssue(issueId, {
          id: issueId,
          title: `Memory Test ${i}`,
          content: 'Test content with some data to track memory usage',
          status: 'open',
          priority: 1,
          archived: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastModifiedBy: 'memory-test',
          version: 1
        });

        // Take memory snapshot every 50 updates
        if ((i + 1) % 50 === 0) {
          const currentMemory = process.memoryUsage();
          memorySnapshots.push(currentMemory.heapUsed);
          console.log(`  After ${i + 1} updates: ${(currentMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
        }

        await new Promise(resolve => setTimeout(resolve, 5));
      }

      // Final memory snapshot
      const finalMemory = process.memoryUsage();
      memorySnapshots.push(finalMemory.heapUsed);

      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryGrowthMB = memoryGrowth / 1024 / 1024;
      const memoryPerUpdate = memoryGrowth / updateCount;

      console.log(`\nMemory Usage Results:`);
      console.log(`  Final heap: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Memory growth: ${memoryGrowthMB.toFixed(2)} MB`);
      console.log(`  Memory per update: ${(memoryPerUpdate / 1024).toFixed(2)} KB`);

      await agent.disconnect();

      // Memory growth should be reasonable (< 50 MB for 500 updates)
      expect(memoryGrowthMB).toBeLessThan(50);
    }, 30000);
  });
});
