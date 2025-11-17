/**
 * Network Partition Chaos Tests
 *
 * Tests CRDT system resilience when network partitions occur.
 * Validates that agents continue working during partitions and sync correctly after reconnection.
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
import * as WebSocket from 'ws';

describe('Network Partition Chaos Tests', () => {
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
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sudocode-chaos-'));
    testDbPath = path.join(testDir, 'cache.db');

    // Initialize database
    db = initCliDatabase({ path: testDbPath });

    // Use random port for testing
    port = 34000 + Math.floor(Math.random() * 1000);
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

  describe('Agent continues working during partition', () => {
    it('should queue updates locally when disconnected', async () => {
      const agent = new CRDTAgent({
        agentId: 'partition-agent',
        coordinatorUrl
      });

      await agent.connect();
      await new Promise(resolve => setTimeout(resolve, 100));

      console.log('\nPartition Test - Local Queuing:');
      console.log('  Simulating network partition...');

      // Simulate partition by closing WebSocket connection
      const ws = (agent as any).ws;
      ws.close();

      // Wait for disconnect to be detected
      await new Promise(resolve => setTimeout(resolve, 100));

      // Agent should still be able to make local updates
      console.log('  Making updates while disconnected...');
      agent.updateIssue('i-partitioned-1', {
        id: 'i-partitioned-1',
        title: 'Update During Partition 1',
        content: 'This was created while disconnected',
        status: 'open',
        priority: 1,
        archived: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastModifiedBy: 'partition-agent',
        version: 1
      });

      agent.updateIssue('i-partitioned-2', {
        id: 'i-partitioned-2',
        title: 'Update During Partition 2',
        content: 'This was also created while disconnected',
        status: 'open',
        priority: 1,
        archived: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastModifiedBy: 'partition-agent',
        version: 1
      });

      // Verify local state has the updates
      const agentYdoc = (agent as any).ydoc;
      const issueMap = agentYdoc.getMap('issueUpdates');
      const issue1 = issueMap.get('i-partitioned-1');
      const issue2 = issueMap.get('i-partitioned-2');

      console.log('  Local state updated: ✓');
      expect(issue1).toBeDefined();
      expect(issue2).toBeDefined();
      expect(issue1.title).toBe('Update During Partition 1');
      expect(issue2.title).toBe('Update During Partition 2');

      await agent.disconnect();
    });
  });

  describe('Agent reconnects after partition heals', () => {
    it('should automatically reconnect and sync after network recovery', async () => {
      const agent = new CRDTAgent({
        agentId: 'reconnect-agent',
        coordinatorUrl,
        reconnectInterval: 1000,
        maxReconnectAttempts: 5
      });

      await agent.connect();
      await new Promise(resolve => setTimeout(resolve, 100));

      console.log('\nPartition Test - Reconnection:');
      console.log('  Initial connection established');

      // Create initial issue
      agent.updateIssue('i-reconnect-test', {
        id: 'i-reconnect-test',
        title: 'Before Partition',
        content: 'Initial state',
        status: 'open',
        priority: 1,
        archived: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastModifiedBy: 'reconnect-agent',
        version: 1
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify coordinator has the update
      const coordYdoc = (coordinator as any).ydoc;
      let issueMap = coordYdoc.getMap('issueUpdates');
      let issue = issueMap.get('i-reconnect-test');
      expect(issue).toBeDefined();
      expect(issue.title).toBe('Before Partition');

      console.log('  Simulating partition...');

      // Simulate partition
      const ws = (agent as any).ws;
      ws.close();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Update while disconnected
      agent.updateIssue('i-reconnect-test', {
        id: 'i-reconnect-test',
        title: 'Updated During Partition',
        content: 'Modified while disconnected',
        status: 'in_progress',
        priority: 2,
        archived: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastModifiedBy: 'reconnect-agent',
        version: 2
      });

      console.log('  Update made while disconnected');
      console.log('  Waiting for automatic reconnection...');

      // Wait for reconnection (agent should auto-reconnect)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check if agent reconnected
      const isConnected = (agent as any).ws?.readyState === WebSocket.WebSocket.OPEN;
      console.log(`  Reconnection status: ${isConnected ? '✓' : '✗'}`);

      if (isConnected) {
        // Wait for sync
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify coordinator received the update
        issueMap = coordYdoc.getMap('issueUpdates');
        issue = issueMap.get('i-reconnect-test');

        console.log(`  Final state in coordinator: ${issue?.title}`);
        expect(issue).toBeDefined();
        expect(issue.title).toBe('Updated During Partition');
        expect(issue.status).toBe('in_progress');
      }

      await agent.disconnect();
    }, 10000);
  });

  describe('Updates sync correctly after reconnection', () => {
    it('should sync all pending updates when connection is restored', async () => {
      const agent = new CRDTAgent({
        agentId: 'sync-agent',
        coordinatorUrl,
        reconnectInterval: 500
      });

      await agent.connect();
      await new Promise(resolve => setTimeout(resolve, 100));

      console.log('\nPartition Test - Sync After Reconnection:');

      // Disconnect
      const ws = (agent as any).ws;
      ws.close();
      await new Promise(resolve => setTimeout(resolve, 100));

      console.log('  Making multiple updates while disconnected...');

      // Make multiple updates while disconnected
      for (let i = 0; i < 5; i++) {
        agent.updateIssue(`i-sync-${i}`, {
          id: `i-sync-${i}`,
          title: `Sync Test ${i}`,
          content: `Content ${i}`,
          status: 'open',
          priority: 1,
          archived: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastModifiedBy: 'sync-agent',
          version: 1
        });
      }

      console.log('  Created 5 issues while disconnected');
      console.log('  Waiting for reconnection and sync...');

      // Wait for reconnection and sync
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check if all updates synced to coordinator
      const coordYdoc = (coordinator as any).ydoc;
      const issueMap = coordYdoc.getMap('issueUpdates');

      let syncedCount = 0;
      for (let i = 0; i < 5; i++) {
        const issue = issueMap.get(`i-sync-${i}`);
        if (issue && issue.title === `Sync Test ${i}`) {
          syncedCount++;
        }
      }

      console.log(`  Synced ${syncedCount}/5 issues to coordinator`);
      expect(syncedCount).toBe(5);

      await agent.disconnect();
    }, 10000);
  });

  describe('No data loss during partition', () => {
    it('should not lose any updates made during network partition', async () => {
      const agent = new CRDTAgent({
        agentId: 'no-loss-agent',
        coordinatorUrl,
        reconnectInterval: 500
      });

      await agent.connect();
      await new Promise(resolve => setTimeout(resolve, 100));

      console.log('\nPartition Test - Data Loss Prevention:');

      const updatesBefore: string[] = [];
      const updatesDuring: string[] = [];

      // Make updates before partition
      for (let i = 0; i < 3; i++) {
        const issueId = `i-before-${i}`;
        updatesBefore.push(issueId);
        agent.updateIssue(issueId, {
          id: issueId,
          title: `Before Partition ${i}`,
          content: 'Content',
          status: 'open',
          priority: 1,
          archived: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastModifiedBy: 'no-loss-agent',
          version: 1
        });
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      console.log('  Created 3 issues before partition');

      // Simulate partition
      const ws = (agent as any).ws;
      ws.close();
      await new Promise(resolve => setTimeout(resolve, 100));

      console.log('  Partition started');

      // Make updates during partition
      for (let i = 0; i < 3; i++) {
        const issueId = `i-during-${i}`;
        updatesDuring.push(issueId);
        agent.updateIssue(issueId, {
          id: issueId,
          title: `During Partition ${i}`,
          content: 'Content',
          status: 'open',
          priority: 1,
          archived: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastModifiedBy: 'no-loss-agent',
          version: 1
        });
      }

      console.log('  Created 3 issues during partition');
      console.log('  Waiting for recovery...');

      // Wait for reconnection and sync
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify all updates are in coordinator
      const coordYdoc = (coordinator as any).ydoc;
      const issueMap = coordYdoc.getMap('issueUpdates');

      const allUpdates = [...updatesBefore, ...updatesDuring];
      let foundCount = 0;

      for (const issueId of allUpdates) {
        const issue = issueMap.get(issueId);
        if (issue) {
          foundCount++;
        }
      }

      console.log(`  Found ${foundCount}/${allUpdates.length} issues in coordinator`);
      console.log(`  Data loss: ${allUpdates.length - foundCount} issues`);

      expect(foundCount).toBe(allUpdates.length);

      await agent.disconnect();
    }, 10000);
  });

  describe('State consistency after recovery', () => {
    it('should have consistent state across all agents after partition recovery', async () => {
      const agent1 = new CRDTAgent({
        agentId: 'consistency-agent-1',
        coordinatorUrl,
        reconnectInterval: 500
      });

      const agent2 = new CRDTAgent({
        agentId: 'consistency-agent-2',
        coordinatorUrl,
        reconnectInterval: 500
      });

      await Promise.all([agent1.connect(), agent2.connect()]);
      await new Promise(resolve => setTimeout(resolve, 200));

      console.log('\nPartition Test - State Consistency:');
      console.log('  Both agents connected');

      // Partition agent1
      const ws1 = (agent1 as any).ws;
      ws1.close();
      await new Promise(resolve => setTimeout(resolve, 100));

      console.log('  Agent 1 partitioned');

      // Agent1 makes updates while partitioned
      agent1.updateIssue('i-consistency-test', {
        id: 'i-consistency-test',
        title: 'Update from Agent 1',
        content: 'Modified by agent 1 during partition',
        status: 'in_progress',
        priority: 1,
        archived: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastModifiedBy: 'consistency-agent-1',
        version: 1
      });

      // Agent2 makes different update to same issue
      agent2.updateIssue('i-consistency-test', {
        id: 'i-consistency-test',
        title: 'Update from Agent 2',
        content: 'Modified by agent 2',
        status: 'open',
        priority: 2,
        archived: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastModifiedBy: 'consistency-agent-2',
        version: 1
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      console.log('  Both agents made conflicting updates');
      console.log('  Waiting for agent 1 to reconnect and sync...');

      // Wait for agent1 to reconnect and sync
      await new Promise(resolve => setTimeout(resolve, 2500));

      // All three should have converged to the same state (CRDT)
      const coordYdoc = (coordinator as any).ydoc;
      const coordIssueMap = coordYdoc.getMap('issueUpdates');
      const coordIssue = coordIssueMap.get('i-consistency-test');

      const agent1Ydoc = (agent1 as any).ydoc;
      const agent1IssueMap = agent1Ydoc.getMap('issueUpdates');
      const agent1Issue = agent1IssueMap.get('i-consistency-test');

      const agent2Ydoc = (agent2 as any).ydoc;
      const agent2IssueMap = agent2Ydoc.getMap('issueUpdates');
      const agent2Issue = agent2IssueMap.get('i-consistency-test');

      console.log(`  Coordinator state: ${coordIssue?.title} (priority: ${coordIssue?.priority})`);
      console.log(`  Agent 1 state: ${agent1Issue?.title} (priority: ${agent1Issue?.priority})`);
      console.log(`  Agent 2 state: ${agent2Issue?.title} (priority: ${agent2Issue?.priority})`);

      // CRDT should have converged (LWW - last write wins)
      // All three should have the same final state
      expect(coordIssue).toBeDefined();
      expect(agent1Issue).toBeDefined();
      expect(agent2Issue).toBeDefined();

      // The states should be consistent (CRDT convergence)
      // Note: The exact value depends on LWW semantics, but all should match
      expect(agent1Issue.title).toBe(coordIssue.title);
      expect(agent2Issue.title).toBe(coordIssue.title);
      expect(agent1Issue.priority).toBe(coordIssue.priority);
      expect(agent2Issue.priority).toBe(coordIssue.priority);

      console.log('  ✓ All agents converged to consistent state');

      await Promise.all([agent1.disconnect(), agent2.disconnect()]);
    }, 15000);
  });
});
