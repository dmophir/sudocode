/**
 * Concurrent CRDT Stress Tests
 *
 * Tests CRDT system behavior under concurrent load from multiple agents
 * to validate performance and conflict resolution.
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

describe('Concurrent CRDT Stress Tests', () => {
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
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sudocode-stress-'));
    testDbPath = path.join(testDir, 'cache.db');

    // Initialize database
    db = initCliDatabase({ path: testDbPath });

    // Use random port for testing
    port = 33000 + Math.floor(Math.random() * 1000);
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

  describe('10 Concurrent Agents', () => {
    it('should handle 10 agents making concurrent updates', async () => {
      const agentCount = 10;
      const updatesPerAgent = 50;
      const agents: CRDTAgent[] = [];

      console.log(`\n10 Concurrent Agents Test:`);
      console.log(`  Agents: ${agentCount}`);
      console.log(`  Updates per agent: ${updatesPerAgent}`);
      console.log(`  Total updates: ${agentCount * updatesPerAgent}`);

      // Create and connect all agents
      for (let i = 0; i < agentCount; i++) {
        const agent = new CRDTAgent({
          agentId: `stress-agent-${i}`,
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
          const issueId = `i-agent${agentIndex}-update${i}`;
          agent.updateIssue(issueId, {
            id: issueId,
            title: `Agent ${agentIndex} Update ${i}`,
            content: `Content from agent ${agentIndex}, update ${i}`,
            status: 'open',
            priority: 1,
            archived: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            lastModifiedBy: `stress-agent-${agentIndex}`,
            version: 1
          });

          // Small delay between updates from same agent
          await new Promise(resolve => setTimeout(resolve, 5));
        }
      });

      // Wait for all agents to complete sending updates
      await Promise.all(agentTasks);

      // Wait for sync to settle
      await new Promise(resolve => setTimeout(resolve, 500));

      const endTime = performance.now();
      const duration = endTime - startTime;
      const totalUpdates = agentCount * updatesPerAgent;
      const updatesPerSecond = (totalUpdates / duration) * 1000;

      console.log(`  Duration: ${(duration / 1000).toFixed(2)}s`);
      console.log(`  Updates/sec: ${updatesPerSecond.toFixed(2)}`);

      // Disconnect all agents
      await Promise.all(agents.map(agent => agent.disconnect()));

      // Should complete in reasonable time
      expect(duration).toBeLessThan(30000); // 30 seconds
      expect(updatesPerSecond).toBeGreaterThan(10); // At least 10 updates/sec
    }, 60000);
  });

  describe('Concurrent Updates to Same Issue', () => {
    it('should handle multiple agents updating the same issue', async () => {
      const agentCount = 5;
      const agents: CRDTAgent[] = [];
      const sharedIssueId = 'i-shared-conflict';

      console.log(`\nConcurrent Updates to Same Issue:`);
      console.log(`  Agents: ${agentCount}`);

      // Create and connect all agents
      for (let i = 0; i < agentCount; i++) {
        const agent = new CRDTAgent({
          agentId: `conflict-agent-${i}`,
          coordinatorUrl
        });
        agents.push(agent);
        await agent.connect();
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      const startTime = performance.now();

      // All agents update the same issue concurrently
      const updateTasks = agents.map(async (agent, agentIndex) => {
        for (let i = 0; i < 20; i++) {
          agent.updateIssue(sharedIssueId, {
            id: sharedIssueId,
            title: `Updated by agent ${agentIndex} (${i})`,
            content: `Content from agent ${agentIndex}, iteration ${i}`,
            status: 'open',
            priority: agentIndex % 5,
            archived: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            lastModifiedBy: `conflict-agent-${agentIndex}`,
            version: i + 1
          });

          await new Promise(resolve => setTimeout(resolve, 10));
        }
      });

      // Wait for all updates
      await Promise.all(updateTasks);

      // Wait for final sync
      await new Promise(resolve => setTimeout(resolve, 1000));

      const endTime = performance.now();
      const duration = endTime - startTime;

      console.log(`  Duration: ${(duration / 1000).toFixed(2)}s`);

      // Verify all agents have the issue (CRDT converged)
      const coordYdoc = (coordinator as any).ydoc;
      const issueMap = coordYdoc.getMap('issueUpdates');
      const finalIssue = issueMap.get(sharedIssueId);

      console.log(`  Final issue state:`);
      console.log(`    Title: ${finalIssue?.title}`);
      console.log(`    Last modified by: ${finalIssue?.lastModifiedBy}`);

      // Disconnect all agents
      await Promise.all(agents.map(agent => agent.disconnect()));

      // Should have converged to some final state
      expect(finalIssue).toBeDefined();
      expect(finalIssue.id).toBe(sharedIssueId);
    }, 60000);
  });

  describe('Agent Churn', () => {
    it('should handle agents connecting and disconnecting under load', async () => {
      const iterations = 10;
      const updatesPerIteration = 20;

      console.log(`\nAgent Churn Test:`);
      console.log(`  Iterations: ${iterations}`);
      console.log(`  Updates per iteration: ${updatesPerIteration}`);

      const startTime = performance.now();

      for (let iter = 0; iter < iterations; iter++) {
        const agent = new CRDTAgent({
          agentId: `churn-agent-${iter}`,
          coordinatorUrl
        });

        await agent.connect();
        await new Promise(resolve => setTimeout(resolve, 50));

        // Send some updates
        for (let i = 0; i < updatesPerIteration; i++) {
          agent.updateIssue(`i-churn-${iter}-${i}`, {
            id: `i-churn-${iter}-${i}`,
            title: `Churn Test ${iter}-${i}`,
            content: 'Test',
            status: 'open',
            priority: 1,
            archived: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            lastModifiedBy: `churn-agent-${iter}`,
            version: 1
          });

          await new Promise(resolve => setTimeout(resolve, 5));
        }

        await agent.disconnect();
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const endTime = performance.now();
      const duration = endTime - startTime;
      const totalUpdates = iterations * updatesPerIteration;

      console.log(`  Duration: ${(duration / 1000).toFixed(2)}s`);
      console.log(`  Total updates: ${totalUpdates}`);
      console.log(`  Avg time per iteration: ${(duration / iterations).toFixed(2)}ms`);

      // Should complete without crashing
      expect(duration).toBeLessThan(30000);
    }, 60000);
  });

  describe('Mixed Operations', () => {
    it('should handle mixed issue and spec updates concurrently', async () => {
      const agentCount = 8;
      const agents: CRDTAgent[] = [];

      console.log(`\nMixed Operations Test:`);
      console.log(`  Agents: ${agentCount}`);

      // Create and connect all agents
      for (let i = 0; i < agentCount; i++) {
        const agent = new CRDTAgent({
          agentId: `mixed-agent-${i}`,
          coordinatorUrl
        });
        agents.push(agent);
        await agent.connect();
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      const startTime = performance.now();

      // Each agent does mix of issue and spec updates
      const tasks = agents.map(async (agent, agentIndex) => {
        for (let i = 0; i < 30; i++) {
          if (i % 2 === 0) {
            // Update issue
            agent.updateIssue(`i-mixed-${agentIndex}-${i}`, {
              id: `i-mixed-${agentIndex}-${i}`,
              title: `Mixed Issue ${agentIndex}-${i}`,
              content: 'Issue content',
              status: 'open',
              priority: 1,
              archived: false,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              lastModifiedBy: `mixed-agent-${agentIndex}`,
              version: 1
            });
          } else {
            // Update spec
            agent.updateSpec(`s-mixed-${agentIndex}-${i}`, {
              id: `s-mixed-${agentIndex}-${i}`,
              title: `Mixed Spec ${agentIndex}-${i}`,
              content: 'Spec content',
              priority: 1,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              lastModifiedBy: `mixed-agent-${agentIndex}`
            });
          }

          await new Promise(resolve => setTimeout(resolve, 10));
        }
      });

      await Promise.all(tasks);
      await new Promise(resolve => setTimeout(resolve, 500));

      const endTime = performance.now();
      const duration = endTime - startTime;

      console.log(`  Duration: ${(duration / 1000).toFixed(2)}s`);

      // Disconnect all agents
      await Promise.all(agents.map(agent => agent.disconnect()));

      // Should complete successfully
      expect(duration).toBeLessThan(40000);
    }, 60000);
  });

  describe('Sustained Load', () => {
    it('should maintain performance under sustained load', async () => {
      const agent = new CRDTAgent({
        agentId: 'sustained-agent',
        coordinatorUrl
      });

      await agent.connect();
      await new Promise(resolve => setTimeout(resolve, 100));

      const testDuration = 10000; // 10 seconds
      const targetRate = 20; // 20 updates per second
      const delayBetweenUpdates = 1000 / targetRate;

      console.log(`\nSustained Load Test:`);
      console.log(`  Duration: ${testDuration / 1000}s`);
      console.log(`  Target rate: ${targetRate} updates/sec`);

      let updateCount = 0;
      const startTime = performance.now();
      let currentTime = startTime;

      while (currentTime - startTime < testDuration) {
        agent.updateIssue(`i-sustained-${updateCount}`, {
          id: `i-sustained-${updateCount}`,
          title: `Sustained ${updateCount}`,
          content: 'Sustained load test',
          status: 'open',
          priority: 1,
          archived: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastModifiedBy: 'sustained-agent',
          version: 1
        });

        updateCount++;
        await new Promise(resolve => setTimeout(resolve, delayBetweenUpdates));
        currentTime = performance.now();
      }

      const endTime = performance.now();
      const actualDuration = endTime - startTime;
      const actualRate = (updateCount / actualDuration) * 1000;

      console.log(`  Actual duration: ${(actualDuration / 1000).toFixed(2)}s`);
      console.log(`  Total updates: ${updateCount}`);
      console.log(`  Actual rate: ${actualRate.toFixed(2)} updates/sec`);

      await agent.disconnect();

      // Should maintain target rate (within 20% tolerance)
      expect(actualRate).toBeGreaterThan(targetRate * 0.8);
      expect(actualRate).toBeLessThan(targetRate * 1.2);
    }, 20000);
  });
});
