/**
 * Unit tests for CRDT History Query API
 *
 * Tests the public query methods for accessing update history.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as Database from 'better-sqlite3';
import { initDatabase as initCliDatabase } from '@sudocode-ai/cli/dist/db.js';
import { CRDTCoordinator } from '../../../src/services/crdt-coordinator.js';
import { CRDTAgent } from '../../../src/execution/crdt-agent.js';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('CRDT History Query API', () => {
  let db: Database.Database;
  let coordinator: CRDTCoordinator;
  let testDbPath: string;
  let testDir: string;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    // Create temporary directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sudocode-test-query-'));
    testDbPath = path.join(testDir, 'cache.db');

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

    // Create coordinator with short retention for testing
    coordinator = new CRDTCoordinator(db, {
      path: '/ws/crdt',
      persistInterval: 100,
      gcInterval: 1000,
      historyRetentionMs: 10000, // 10 seconds for testing
      historyCleanupIntervalMs: 5000 // 5 second cleanup interval
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

  describe('getEntityHistory()', () => {
    it('should return empty array for non-existent entity', () => {
      const history = coordinator.getEntityHistory('i-nonexistent');
      expect(history).toEqual([]);
    });

    it('should return update history for an entity', async () => {
      const agent = new CRDTAgent({
        agentId: 'test-agent-1',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await agent.connect();

      // Make multiple updates to the same entity
      agent.updateIssue('i-test1', {
        title: 'Version 1',
        content: 'Content 1',
        status: 'open',
        priority: 1
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      agent.updateIssue('i-test1', {
        title: 'Version 2',
        content: 'Content 2',
        status: 'in_progress',
        priority: 2
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      agent.updateIssue('i-test1', {
        title: 'Version 3',
        content: 'Content 3',
        status: 'in_progress',
        priority: 3
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      await agent.disconnect();

      // Query history
      const history = coordinator.getEntityHistory('i-test1');

      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[0].entityId).toBe('i-test1');
      expect(history[0].entityType).toBe('issue');
      expect(history[0].clientId).toBe('test-agent-1');

      // Should be sorted by timestamp
      for (let i = 1; i < history.length; i++) {
        expect(history[i].timestamp).toBeGreaterThanOrEqual(history[i - 1].timestamp);
      }
    });

    it('should filter by time range', async () => {
      const agent = new CRDTAgent({
        agentId: 'test-agent-2',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await agent.connect();

      const startTime = Date.now();

      // First update
      agent.updateIssue('i-test2', {
        title: 'First',
        content: 'First',
        status: 'open',
        priority: 1
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      const midTime = Date.now();

      // Second update
      agent.updateIssue('i-test2', {
        title: 'Second',
        content: 'Second',
        status: 'open',
        priority: 1
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      const endTime = Date.now();

      await agent.disconnect();

      // Query with time filters
      const allHistory = coordinator.getEntityHistory('i-test2');
      const afterMid = coordinator.getEntityHistory('i-test2', { startTime: midTime });
      const beforeMid = coordinator.getEntityHistory('i-test2', { endTime: midTime });

      expect(allHistory.length).toBeGreaterThanOrEqual(2);
      expect(afterMid.length).toBeLessThan(allHistory.length);
      expect(beforeMid.length).toBeLessThan(allHistory.length);

      // All records in afterMid should be >= midTime
      afterMid.forEach(r => {
        expect(r.timestamp).toBeGreaterThanOrEqual(midTime);
      });
    });

    it('should track multiple entities independently', async () => {
      const agent = new CRDTAgent({
        agentId: 'test-agent-3',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await agent.connect();

      // Update different entities
      agent.updateIssue('i-test3a', {
        title: 'Issue A',
        content: 'Content A',
        status: 'open',
        priority: 1
      });

      agent.updateIssue('i-test3b', {
        title: 'Issue B',
        content: 'Content B',
        status: 'open',
        priority: 1
      });

      agent.updateSpec('s-test3', {
        title: 'Spec 3',
        content: 'Content 3',
        priority: 1
      });

      await new Promise(resolve => setTimeout(resolve, 300));

      await agent.disconnect();

      // Query each entity
      const historyA = coordinator.getEntityHistory('i-test3a');
      const historyB = coordinator.getEntityHistory('i-test3b');
      const historySpec = coordinator.getEntityHistory('s-test3');

      expect(historyA.length).toBeGreaterThan(0);
      expect(historyB.length).toBeGreaterThan(0);
      expect(historySpec.length).toBeGreaterThan(0);

      // Each history should only contain its entity
      historyA.forEach(r => expect(r.entityId).toBe('i-test3a'));
      historyB.forEach(r => expect(r.entityId).toBe('i-test3b'));
      historySpec.forEach(r => expect(r.entityId).toBe('s-test3'));
    });
  });

  describe('getClientHistory()', () => {
    it('should return empty array for non-existent client', () => {
      const history = coordinator.getClientHistory('nonexistent-agent');
      expect(history).toEqual([]);
    });

    it('should return all updates from a specific client', async () => {
      const agent = new CRDTAgent({
        agentId: 'test-agent-4',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await agent.connect();

      // Make updates to multiple entities
      agent.updateIssue('i-test4a', {
        title: 'Issue A',
        content: 'Content A',
        status: 'open',
        priority: 1
      });

      agent.updateIssue('i-test4b', {
        title: 'Issue B',
        content: 'Content B',
        status: 'open',
        priority: 1
      });

      agent.updateSpec('s-test4', {
        title: 'Spec 4',
        content: 'Content 4',
        priority: 1
      });

      await new Promise(resolve => setTimeout(resolve, 300));

      await agent.disconnect();

      // Query client history
      const history = coordinator.getClientHistory('test-agent-4');

      expect(history.length).toBeGreaterThanOrEqual(3);

      // All updates should be from this client
      history.forEach(r => {
        expect(r.clientId).toBe('test-agent-4');
      });

      // Should include updates to different entities
      const entityIds = new Set(history.map(r => r.entityId));
      expect(entityIds.size).toBeGreaterThanOrEqual(3);
    });

    it('should distinguish between different clients', async () => {
      const agent1 = new CRDTAgent({
        agentId: 'test-agent-5a',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      const agent2 = new CRDTAgent({
        agentId: 'test-agent-5b',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await Promise.all([agent1.connect(), agent2.connect()]);

      // Each agent makes updates
      agent1.updateIssue('i-test5', {
        title: 'From Agent 1',
        content: 'Content 1',
        status: 'open',
        priority: 1
      });

      agent2.updateIssue('i-test5', {
        title: 'From Agent 2',
        content: 'Content 2',
        status: 'in_progress',
        priority: 2
      });

      await new Promise(resolve => setTimeout(resolve, 300));

      await Promise.all([agent1.disconnect(), agent2.disconnect()]);

      // Query each client's history
      const history1 = coordinator.getClientHistory('test-agent-5a');
      const history2 = coordinator.getClientHistory('test-agent-5b');

      expect(history1.length).toBeGreaterThan(0);
      expect(history2.length).toBeGreaterThan(0);

      // Each history should only contain its client's updates
      history1.forEach(r => expect(r.clientId).toBe('test-agent-5a'));
      history2.forEach(r => expect(r.clientId).toBe('test-agent-5b'));
    });

    it('should filter by time range', async () => {
      const agent = new CRDTAgent({
        agentId: 'test-agent-6',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await agent.connect();

      const startTime = Date.now();

      agent.updateIssue('i-test6a', {
        title: 'First',
        content: 'First',
        status: 'open',
        priority: 1
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      const midTime = Date.now();

      agent.updateIssue('i-test6b', {
        title: 'Second',
        content: 'Second',
        status: 'open',
        priority: 1
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      await agent.disconnect();

      // Query with time filters
      const allHistory = coordinator.getClientHistory('test-agent-6');
      const afterMid = coordinator.getClientHistory('test-agent-6', { startTime: midTime });

      expect(allHistory.length).toBeGreaterThanOrEqual(2);
      expect(afterMid.length).toBeLessThan(allHistory.length);
    });
  });

  describe('reconstructVersionAtTime()', () => {
    it('should return undefined for non-existent entity', () => {
      const version = coordinator.reconstructVersionAtTime('i-nonexistent', Date.now());
      expect(version).toBeUndefined();
    });

    it('should return undefined if timestamp is before any updates', async () => {
      const beforeTime = Date.now();

      const agent = new CRDTAgent({
        agentId: 'test-agent-7',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await agent.connect();

      await new Promise(resolve => setTimeout(resolve, 100));

      agent.updateIssue('i-test7', {
        title: 'Test',
        content: 'Content',
        status: 'open',
        priority: 1
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      await agent.disconnect();

      const version = coordinator.reconstructVersionAtTime('i-test7', beforeTime);
      expect(version).toBeUndefined();
    });

    it('should reconstruct version at specific timestamp', async () => {
      const agent = new CRDTAgent({
        agentId: 'test-agent-8',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await agent.connect();

      // First version
      agent.updateIssue('i-test8', {
        title: 'Version 1',
        content: 'Content 1',
        status: 'open',
        priority: 1
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      const timestamp1 = Date.now();

      await new Promise(resolve => setTimeout(resolve, 100));

      // Second version
      agent.updateIssue('i-test8', {
        title: 'Version 2',
        content: 'Content 2',
        status: 'in_progress',
        priority: 2
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      const timestamp2 = Date.now();

      await agent.disconnect();

      // Reconstruct version at timestamp1 (should get version 1)
      const version1 = coordinator.reconstructVersionAtTime('i-test8', timestamp1);

      expect(version1).toBeDefined();
      expect(version1!.lastModifiedBy).toBe('test-agent-8');
      expect(version1!.title).toBeDefined();
      expect(version1!.content).toBeDefined();

      // Reconstruct version at timestamp2 (should get version 2)
      const version2 = coordinator.reconstructVersionAtTime('i-test8', timestamp2);

      expect(version2).toBeDefined();
      expect(version2!.timestamp).toBeGreaterThan(version1!.timestamp);
    });

    it('should use content snapshot from closest update', async () => {
      const agent = new CRDTAgent({
        agentId: 'test-agent-9',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await agent.connect();

      agent.updateSpec('s-test9', {
        title: 'Initial Spec',
        content: 'Initial content',
        priority: 1
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      const futureTime = Date.now() + 10000;

      await agent.disconnect();

      // Query future time - should get latest version
      const version = coordinator.reconstructVersionAtTime('s-test9', futureTime);

      expect(version).toBeDefined();
      expect(version!.title).toBeDefined();
      expect(version!.content).toBeDefined();
    });
  });

  describe('getHistoryMetadata()', () => {
    it('should return metadata for empty history', () => {
      const metadata = coordinator.getHistoryMetadata();

      expect(metadata).toBeDefined();
      expect(metadata.totalUpdates).toBe(0);
      expect(metadata.entitiesTracked).toBe(0);
      expect(metadata.memoryUsageMB).toBeGreaterThanOrEqual(0);
      expect(metadata.retentionWindowMs).toBe(10000); // From beforeEach config
    });

    it('should track total updates and entities', async () => {
      const agent = new CRDTAgent({
        agentId: 'test-agent-10',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await agent.connect();

      // Make updates to multiple entities
      agent.updateIssue('i-test10a', {
        title: 'Issue A',
        content: 'Content A',
        status: 'open',
        priority: 1
      });

      agent.updateIssue('i-test10b', {
        title: 'Issue B',
        content: 'Content B',
        status: 'open',
        priority: 1
      });

      agent.updateSpec('s-test10', {
        title: 'Spec',
        content: 'Content',
        priority: 1
      });

      await new Promise(resolve => setTimeout(resolve, 300));

      await agent.disconnect();

      const metadata = coordinator.getHistoryMetadata();

      expect(metadata.totalUpdates).toBeGreaterThan(0);
      expect(metadata.entitiesTracked).toBeGreaterThanOrEqual(3);
      expect(metadata.memoryUsageMB).toBeGreaterThan(0);
      expect(metadata.oldestTimestamp).toBeLessThanOrEqual(metadata.newestTimestamp);
    });

    it('should estimate memory usage', async () => {
      const agent = new CRDTAgent({
        agentId: 'test-agent-11',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await agent.connect();

      const metadataBefore = coordinator.getHistoryMetadata();

      // Make several updates
      for (let i = 0; i < 5; i++) {
        agent.updateIssue(`i-test11-${i}`, {
          title: `Issue ${i}`,
          content: `Content ${i}`,
          status: 'open',
          priority: i
        });
      }

      await new Promise(resolve => setTimeout(resolve, 300));

      await agent.disconnect();

      const metadataAfter = coordinator.getHistoryMetadata();

      // Memory usage should increase after updates
      expect(metadataAfter.memoryUsageMB).toBeGreaterThanOrEqual(metadataBefore.memoryUsageMB);
      expect(metadataAfter.totalUpdates).toBeGreaterThan(metadataBefore.totalUpdates);
    });
  });
});
