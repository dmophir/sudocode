/**
 * CRDT Memory Profiling Tests
 *
 * Tests memory usage patterns to ensure efficient resource utilization.
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
import * as Y from 'yjs';

interface MemorySnapshot {
  heapUsed: number;
  heapTotal: number;
  external: number;
  timestamp: number;
}

function formatBytes(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

describe('CRDT Memory Profiling', () => {
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
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sudocode-memory-'));
    testDbPath = path.join(testDir, 'cache.db');

    // Initialize database
    db = initCliDatabase({ path: testDbPath });

    // Use random port for testing
    port = 32000 + Math.floor(Math.random() * 1000);
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

  describe('Agent Memory Usage', () => {
    it('should track memory per CRDT agent', async () => {
      const agentCount = 5;
      const agents: CRDTAgent[] = [];
      const snapshots: MemorySnapshot[] = [];

      // Force GC before starting
      if (global.gc) {
        global.gc();
      }
      await new Promise(resolve => setTimeout(resolve, 100));

      // Take baseline snapshot
      const baseline = process.memoryUsage();
      snapshots.push({
        heapUsed: baseline.heapUsed,
        heapTotal: baseline.heapTotal,
        external: baseline.external,
        timestamp: Date.now()
      });

      console.log('\nAgent Memory Usage:');
      console.log(`Baseline: ${formatBytes(baseline.heapUsed)}`);

      // Create agents one by one and measure
      for (let i = 0; i < agentCount; i++) {
        const agent = new CRDTAgent({
          agentId: `memory-agent-${i}`,
          coordinatorUrl
        });

        await agent.connect();
        await new Promise(resolve => setTimeout(resolve, 100));

        agents.push(agent);

        const snapshot = process.memoryUsage();
        snapshots.push({
          heapUsed: snapshot.heapUsed,
          heapTotal: snapshot.heapTotal,
          external: snapshot.external,
          timestamp: Date.now()
        });

        const memoryIncrease = snapshot.heapUsed - baseline.heapUsed;
        const memoryPerAgent = memoryIncrease / (i + 1);

        console.log(`After ${i + 1} agent(s): ${formatBytes(snapshot.heapUsed)} (+${formatBytes(memoryIncrease)}, avg ${formatBytes(memoryPerAgent)}/agent)`);
      }

      // Disconnect all agents
      await Promise.all(agents.map(agent => agent.disconnect()));

      // Final snapshot after cleanup
      await new Promise(resolve => setTimeout(resolve, 200));
      if (global.gc) {
        global.gc();
      }
      await new Promise(resolve => setTimeout(resolve, 100));

      const final = process.memoryUsage();
      const memoryRecovered = snapshots[snapshots.length - 1].heapUsed - final.heapUsed;

      console.log(`After cleanup: ${formatBytes(final.heapUsed)} (recovered ${formatBytes(memoryRecovered)})`);

      // Each agent should use less than 5 MB on average
      const totalIncrease = snapshots[snapshots.length - 1].heapUsed - baseline.heapUsed;
      const avgPerAgent = totalIncrease / agentCount;
      expect(avgPerAgent).toBeLessThan(5 * 1024 * 1024);
    });
  });

  describe('Coordinator Memory Growth', () => {
    it('should track coordinator memory growth over time', async () => {
      const agent = new CRDTAgent({
        agentId: 'growth-test',
        coordinatorUrl
      });

      await agent.connect();
      await new Promise(resolve => setTimeout(resolve, 100));

      const snapshots: MemorySnapshot[] = [];
      const updateBatches = 10;
      const updatesPerBatch = 100;

      // Force GC and take baseline
      if (global.gc) {
        global.gc();
      }
      await new Promise(resolve => setTimeout(resolve, 100));

      const baseline = process.memoryUsage();
      snapshots.push({
        heapUsed: baseline.heapUsed,
        heapTotal: baseline.heapTotal,
        external: baseline.external,
        timestamp: Date.now()
      });

      console.log('\nCoordinator Memory Growth:');
      console.log(`Baseline: ${formatBytes(baseline.heapUsed)}`);

      // Send updates in batches
      for (let batch = 0; batch < updateBatches; batch++) {
        for (let i = 0; i < updatesPerBatch; i++) {
          const issueId = `i-growth-${batch}-${i}`;
          agent.updateIssue(issueId, {
            id: issueId,
            title: `Growth Test Batch ${batch} Update ${i}`,
            content: 'Test content for memory growth tracking',
            status: 'open',
            priority: 1,
            archived: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            lastModifiedBy: 'growth-test',
            version: 1
          });

          await new Promise(resolve => setTimeout(resolve, 5));
        }

        // Take snapshot after each batch
        await new Promise(resolve => setTimeout(resolve, 100));
        const snapshot = process.memoryUsage();
        snapshots.push({
          heapUsed: snapshot.heapUsed,
          heapTotal: snapshot.heapTotal,
          external: snapshot.external,
          timestamp: Date.now()
        });

        const totalUpdates = (batch + 1) * updatesPerBatch;
        const growth = snapshot.heapUsed - baseline.heapUsed;
        const bytesPerUpdate = growth / totalUpdates;

        console.log(`After ${totalUpdates} updates: ${formatBytes(snapshot.heapUsed)} (+${formatBytes(growth)}, ${(bytesPerUpdate / 1024).toFixed(2)} KB/update)`);
      }

      await agent.disconnect();

      // Calculate growth rate
      const totalGrowth = snapshots[snapshots.length - 1].heapUsed - baseline.heapUsed;
      const totalUpdates = updateBatches * updatesPerBatch;
      const bytesPerUpdate = totalGrowth / totalUpdates;

      console.log(`\nTotal memory growth: ${formatBytes(totalGrowth)}`);
      console.log(`Average per update: ${(bytesPerUpdate / 1024).toFixed(2)} KB`);

      // Memory growth should be linear and reasonable (< 10 KB per update)
      expect(bytesPerUpdate).toBeLessThan(10 * 1024);
    }, 60000);
  });

  describe('CRDT Document Size', () => {
    it('should measure CRDT document size after N updates', async () => {
      const agent = new CRDTAgent({
        agentId: 'doc-size-test',
        coordinatorUrl
      });

      await agent.connect();
      await new Promise(resolve => setTimeout(resolve, 100));

      console.log('\nCRDT Document Size:');

      const measurements = [100, 500, 1000];

      for (const targetUpdates of measurements) {
        // Send updates
        for (let i = 0; i < targetUpdates; i++) {
          const issueId = `i-docsize-${targetUpdates}-${i}`;
          agent.updateIssue(issueId, {
            id: issueId,
            title: `Doc Size Test ${i}`,
            content: 'Test content for document size measurement',
            status: 'open',
            priority: 1,
            archived: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            lastModifiedBy: 'doc-size-test',
            version: 1
          });

          if (i % 100 === 99) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }

        await new Promise(resolve => setTimeout(resolve, 200));

        // Get document state size
        const coordYdoc = (coordinator as any).ydoc;
        const state = Y.encodeStateAsUpdate(coordYdoc);
        const docSize = state.length;

        const bytesPerUpdate = docSize / targetUpdates;

        console.log(`After ${targetUpdates} updates:`);
        console.log(`  Document size: ${(docSize / 1024).toFixed(2)} KB`);
        console.log(`  Per update: ${bytesPerUpdate.toFixed(2)} bytes`);

        // Document should grow linearly
        expect(bytesPerUpdate).toBeLessThan(500); // Less than 500 bytes per update
      }

      await agent.disconnect();
    }, 90000);
  });

  describe('Memory Leak Detection', () => {
    it('should not leak memory when agents connect and disconnect', async () => {
      const iterations = 10;
      const snapshots: number[] = [];

      // Force GC and baseline
      if (global.gc) {
        global.gc();
      }
      await new Promise(resolve => setTimeout(resolve, 100));

      const baseline = process.memoryUsage().heapUsed;
      snapshots.push(baseline);

      console.log('\nMemory Leak Detection:');
      console.log(`Baseline: ${formatBytes(baseline)}`);

      // Connect and disconnect agents repeatedly
      for (let i = 0; i < iterations; i++) {
        const agent = new CRDTAgent({
          agentId: `leak-test-${i}`,
          coordinatorUrl
        });

        await agent.connect();
        await new Promise(resolve => setTimeout(resolve, 50));

        // Send some updates
        for (let j = 0; j < 10; j++) {
          agent.updateIssue(`i-leak-${i}-${j}`, {
            id: `i-leak-${i}-${j}`,
            title: `Leak Test ${i}-${j}`,
            content: 'Test',
            status: 'open',
            priority: 1,
            archived: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            lastModifiedBy: `leak-test-${i}`,
            version: 1
          });
        }

        await new Promise(resolve => setTimeout(resolve, 50));
        await agent.disconnect();

        // Force GC
        if (global.gc) {
          global.gc();
        }
        await new Promise(resolve => setTimeout(resolve, 100));

        const current = process.memoryUsage().heapUsed;
        snapshots.push(current);

        const growth = current - baseline;
        console.log(`After iteration ${i + 1}: ${formatBytes(current)} (+${formatBytes(growth)})`);
      }

      // Calculate memory growth trend
      const finalMemory = snapshots[snapshots.length - 1];
      const totalGrowth = finalMemory - baseline;
      const growthPerIteration = totalGrowth / iterations;

      console.log(`\nTotal growth: ${formatBytes(totalGrowth)}`);
      console.log(`Per iteration: ${formatBytes(growthPerIteration)}`);

      // Memory growth should be minimal (< 1 MB per iteration)
      // Some growth is expected due to CRDT history, but should stabilize
      expect(growthPerIteration).toBeLessThan(1 * 1024 * 1024);
    }, 60000);
  });
});
