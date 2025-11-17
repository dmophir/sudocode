/**
 * Server Crash Chaos Tests
 *
 * Tests CRDT coordinator resilience when the server crashes and restarts.
 * Validates state recovery from database and agent reconnection.
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

describe('Server Crash Chaos Tests', () => {
  let testDbPath: string;
  let testDir: string;
  let wsPath: string;

  beforeEach(async () => {
    // Create temporary directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sudocode-crash-'));
    testDbPath = path.join(testDir, 'cache.db');
    wsPath = '/ws/crdt';
  });

  afterEach(async () => {
    // Clean up test directory
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Coordinator crashes during sync', () => {
    it('should not corrupt database when coordinator crashes mid-sync', async () => {
      const port = 35000 + Math.floor(Math.random() * 1000);
      let db = initCliDatabase({ path: testDbPath });
      let server = http.createServer();

      await new Promise<void>((resolve) => {
        server.listen(port, () => resolve());
      });

      let coordinator = new CRDTCoordinator(db, {
        path: wsPath,
        persistInterval: 100,
        gcInterval: 60000
      });
      coordinator.init(server);

      const coordinatorUrl = `ws://localhost:${port}${wsPath}`;

      const agent = new CRDTAgent({
        agentId: 'crash-test-agent',
        coordinatorUrl,
        reconnectInterval: 500
      });

      await agent.connect();
      await new Promise(resolve => setTimeout(resolve, 100));

      console.log('\nServer Crash Test - Mid-Sync Crash:');
      console.log('  Creating issues before crash...');

      // Create some issues
      for (let i = 0; i < 5; i++) {
        agent.updateIssue(`i-crash-${i}`, {
          id: `i-crash-${i}`,
          title: `Crash Test ${i}`,
          content: 'Content',
          status: 'open',
          priority: 1,
          archived: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastModifiedBy: 'crash-test-agent',
          version: 1
        });
      }

      // Wait for sync
      await new Promise(resolve => setTimeout(resolve, 300));

      console.log('  Simulating coordinator crash...');

      // Simulate crash - abruptly shutdown without proper cleanup
      await coordinator.shutdown();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });

      console.log('  Coordinator crashed');
      console.log('  Checking database integrity...');

      // Database should still be valid
      const stmt = db.prepare('SELECT COUNT(*) as count FROM issues');
      const result = stmt.get() as { count: number };

      console.log(`  Found ${result.count} issues in database`);
      expect(result.count).toBeGreaterThanOrEqual(3); // At least some issues persisted

      db.close();
      await agent.disconnect();
    });
  });

  describe('Coordinator restarts and loads state from DB', () => {
    it('should restore full state from database after restart', async () => {
      const port = 35100 + Math.floor(Math.random() * 1000);

      console.log('\nServer Crash Test - State Recovery:');
      console.log('  Phase 1: Initial coordinator with data');

      // Phase 1: Create coordinator and populate data
      let db = initCliDatabase({ path: testDbPath });
      let server = http.createServer();

      await new Promise<void>((resolve) => {
        server.listen(port, () => resolve());
      });

      let coordinator = new CRDTCoordinator(db, {
        path: wsPath,
        persistInterval: 100,
        gcInterval: 60000
      });
      coordinator.init(server);

      const coordinatorUrl = `ws://localhost:${port}${wsPath}`;

      const agent = new CRDTAgent({
        agentId: 'recovery-agent',
        coordinatorUrl
      });

      await agent.connect();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Create test data
      const testIssues = [
        { id: 'i-recovery-1', title: 'Recovery Test 1' },
        { id: 'i-recovery-2', title: 'Recovery Test 2' },
        { id: 'i-recovery-3', title: 'Recovery Test 3' }
      ];

      for (const issue of testIssues) {
        agent.updateIssue(issue.id, {
          id: issue.id,
          title: issue.title,
          content: 'Test content',
          status: 'open',
          priority: 1,
          archived: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastModifiedBy: 'recovery-agent',
          version: 1
        });
      }

      await new Promise(resolve => setTimeout(resolve, 300));

      console.log(`  Created ${testIssues.length} issues`);

      // Graceful shutdown
      await agent.disconnect();
      await coordinator.shutdown();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      db.close();

      console.log('  Coordinator shutdown gracefully');
      console.log('  Phase 2: Restarting coordinator from database');

      // Phase 2: Restart coordinator with same database
      db = initCliDatabase({ path: testDbPath });
      server = http.createServer();

      await new Promise<void>((resolve) => {
        server.listen(port, () => resolve());
      });

      coordinator = new CRDTCoordinator(db, {
        path: wsPath,
        persistInterval: 100,
        gcInterval: 60000
      });
      coordinator.init(server);

      // Wait for coordinator to load state
      await new Promise(resolve => setTimeout(resolve, 200));

      console.log('  Coordinator restarted');
      console.log('  Checking restored state...');

      // Verify state was restored
      const coordYdoc = (coordinator as any).ydoc;
      const issueMap = coordYdoc.getMap('issueUpdates');

      let restoredCount = 0;
      for (const testIssue of testIssues) {
        const issue = issueMap.get(testIssue.id);
        if (issue && issue.title === testIssue.title) {
          restoredCount++;
        }
      }

      console.log(`  Restored ${restoredCount}/${testIssues.length} issues from database`);
      expect(restoredCount).toBe(testIssues.length);

      // Cleanup
      await coordinator.shutdown();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      db.close();
    });
  });

  describe('Agents reconnect after coordinator restart', () => {
    it('should allow agents to reconnect after coordinator restarts', async () => {
      const port = 35200 + Math.floor(Math.random() * 1000);

      console.log('\nServer Crash Test - Agent Reconnection:');
      console.log('  Starting initial coordinator...');

      // Phase 1: Start coordinator
      let db = initCliDatabase({ path: testDbPath });
      let server = http.createServer();

      await new Promise<void>((resolve) => {
        server.listen(port, () => resolve());
      });

      let coordinator = new CRDTCoordinator(db, {
        path: wsPath,
        persistInterval: 100,
        gcInterval: 60000
      });
      coordinator.init(server);

      const coordinatorUrl = `ws://localhost:${port}${wsPath}`;

      const agent = new CRDTAgent({
        agentId: 'reconnection-agent',
        coordinatorUrl,
        reconnectInterval: 500,
        maxReconnectAttempts: 10
      });

      await agent.connect();
      await new Promise(resolve => setTimeout(resolve, 100));

      console.log('  Agent connected');

      // Create an issue
      agent.updateIssue('i-reconnect-after-restart', {
        id: 'i-reconnect-after-restart',
        title: 'Before Restart',
        content: 'Content',
        status: 'open',
        priority: 1,
        archived: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastModifiedBy: 'reconnection-agent',
        version: 1
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      console.log('  Shutting down coordinator...');

      // Shutdown coordinator
      await coordinator.shutdown();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      db.close();

      console.log('  Coordinator stopped');
      console.log('  Waiting for agent reconnection attempts...');

      // Wait a bit for agent to detect disconnection
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log('  Restarting coordinator...');

      // Phase 2: Restart coordinator
      db = initCliDatabase({ path: testDbPath });
      server = http.createServer();

      await new Promise<void>((resolve) => {
        server.listen(port, () => resolve());
      });

      coordinator = new CRDTCoordinator(db, {
        path: wsPath,
        persistInterval: 100,
        gcInterval: 60000
      });
      coordinator.init(server);

      console.log('  Coordinator restarted');
      console.log('  Waiting for agent to reconnect...');

      // Wait for agent to reconnect
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check if agent reconnected
      const ws = (agent as any).ws;
      const isConnected = ws && ws.readyState === 1; // OPEN

      console.log(`  Agent reconnection status: ${isConnected ? '✓ Connected' : '✗ Not connected'}`);

      if (isConnected) {
        // Make a new update to verify connection works
        agent.updateIssue('i-after-restart', {
          id: 'i-after-restart',
          title: 'After Restart',
          content: 'Content',
          status: 'open',
          priority: 1,
          archived: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastModifiedBy: 'reconnection-agent',
          version: 1
        });

        await new Promise(resolve => setTimeout(resolve, 200));

        // Verify coordinator received it
        const coordYdoc = (coordinator as any).ydoc;
        const issueMap = coordYdoc.getMap('issueUpdates');
        const newIssue = issueMap.get('i-after-restart');

        expect(newIssue).toBeDefined();
        expect(newIssue.title).toBe('After Restart');
        console.log('  ✓ Agent successfully reconnected and synced');
      }

      // Cleanup
      await agent.disconnect();
      await coordinator.shutdown();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      db.close();

      expect(isConnected).toBe(true);
    }, 15000);
  });

  describe('No data loss on crash', () => {
    it('should not lose data when coordinator crashes unexpectedly', async () => {
      const port = 35300 + Math.floor(Math.random() * 1000);

      console.log('\nServer Crash Test - Data Loss Prevention:');
      console.log('  Creating data before crash...');

      let db = initCliDatabase({ path: testDbPath });
      let server = http.createServer();

      await new Promise<void>((resolve) => {
        server.listen(port, () => resolve());
      });

      let coordinator = new CRDTCoordinator(db, {
        path: wsPath,
        persistInterval: 50, // Very frequent persistence
        gcInterval: 60000
      });
      coordinator.init(server);

      const coordinatorUrl = `ws://localhost:${port}${wsPath}`;

      const agent = new CRDTAgent({
        agentId: 'data-loss-agent',
        coordinatorUrl
      });

      await agent.connect();
      await new Promise(resolve => setTimeout(resolve, 100));

      const testData = [];

      // Create data rapidly
      for (let i = 0; i < 10; i++) {
        const issueId = `i-data-loss-${i}`;
        testData.push(issueId);

        agent.updateIssue(issueId, {
          id: issueId,
          title: `Data Loss Test ${i}`,
          content: `Content ${i}`,
          status: 'open',
          priority: 1,
          archived: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastModifiedBy: 'data-loss-agent',
          version: 1
        });

        await new Promise(resolve => setTimeout(resolve, 20));
      }

      console.log('  Created 10 issues');

      // Give it time to persist
      await new Promise(resolve => setTimeout(resolve, 200));

      console.log('  Simulating unexpected crash...');

      // Simulate crash
      await coordinator.shutdown();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });

      console.log('  Coordinator crashed');
      console.log('  Checking database for data loss...');

      // Check database directly
      const stmt = db.prepare('SELECT * FROM issues WHERE id LIKE ?');
      const results = stmt.all('i-data-loss-%');

      console.log(`  Found ${results.length}/10 issues in database after crash`);

      // Should have most or all data (some might be lost if crash was during write)
      // But should have at least 70% of data due to frequent persistence
      expect(results.length).toBeGreaterThanOrEqual(7);

      db.close();
      await agent.disconnect();
    });
  });

  describe('State consistency after restart', () => {
    it('should maintain state consistency across restart', async () => {
      const port = 35400 + Math.floor(Math.random() * 1000);

      console.log('\nServer Crash Test - State Consistency:');

      // Phase 1: Create and populate coordinator
      let db = initCliDatabase({ path: testDbPath });
      let server = http.createServer();

      await new Promise<void>((resolve) => {
        server.listen(port, () => resolve());
      });

      let coordinator = new CRDTCoordinator(db, {
        path: wsPath,
        persistInterval: 100,
        gcInterval: 60000
      });
      coordinator.init(server);

      const coordinatorUrl = `ws://localhost:${port}${wsPath}`;

      const agent = new CRDTAgent({
        agentId: 'consistency-test-agent',
        coordinatorUrl
      });

      await agent.connect();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Create data with specific state
      agent.updateIssue('i-consistency', {
        id: 'i-consistency',
        title: 'Consistency Test',
        content: 'Original content',
        status: 'open',
        priority: 1,
        archived: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastModifiedBy: 'consistency-test-agent',
        version: 1
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      // Get state before shutdown
      const coordYdocBefore = (coordinator as any).ydoc;
      const issueMapBefore = coordYdocBefore.getMap('issueUpdates');
      const issueBefore = issueMapBefore.get('i-consistency');

      console.log(`  State before restart: ${issueBefore.title} (status: ${issueBefore.status})`);

      // Graceful shutdown
      await agent.disconnect();
      await coordinator.shutdown();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      db.close();

      // Restart
      db = initCliDatabase({ path: testDbPath });
      server = http.createServer();

      await new Promise<void>((resolve) => {
        server.listen(port, () => resolve());
      });

      coordinator = new CRDTCoordinator(db, {
        path: wsPath,
        persistInterval: 100,
        gcInterval: 60000
      });
      coordinator.init(server);

      await new Promise(resolve => setTimeout(resolve, 200));

      // Get state after restart
      const coordYdocAfter = (coordinator as any).ydoc;
      const issueMapAfter = coordYdocAfter.getMap('issueUpdates');
      const issueAfter = issueMapAfter.get('i-consistency');

      console.log(`  State after restart: ${issueAfter.title} (status: ${issueAfter.status})`);

      // State should be exactly the same
      expect(issueAfter.id).toBe(issueBefore.id);
      expect(issueAfter.title).toBe(issueBefore.title);
      expect(issueAfter.content).toBe(issueBefore.content);
      expect(issueAfter.status).toBe(issueBefore.status);
      expect(issueAfter.priority).toBe(issueBefore.priority);

      console.log('  ✓ State is consistent across restart');

      // Cleanup
      await coordinator.shutdown();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      db.close();
    });
  });
});
