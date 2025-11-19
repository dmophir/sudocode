/**
 * History API Routes Tests
 *
 * Tests for all history API endpoints that expose CRDT history data.
 *
 * @module routes/tests/history
 */

import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import * as Database from 'better-sqlite3';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { initDatabase as initCliDatabase } from '@sudocode-ai/cli/dist/db.js';
import { createHistoryRouter } from '../../../src/routes/history.js';
import { CRDTCoordinator } from '../../../src/services/crdt-coordinator.js';
import { CRDTAgent } from '../../../src/execution/crdt-agent.js';

describe('History API Routes', () => {
  let app: Express;
  let db: Database.Database;
  let coordinator: CRDTCoordinator;
  let testDir: string;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    // Create temporary directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sudocode-test-history-routes-'));
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

    // Set up Express app with history routes
    app = express();
    app.use(express.json());
    app.use(createHistoryRouter(coordinator));
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

  describe('GET /api/history/metadata', () => {
    it('should return global history metadata', async () => {
      const response = await request(app)
        .get('/api/history/metadata')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('totalUpdates');
      expect(response.body).toHaveProperty('oldestTimestamp');
      expect(response.body).toHaveProperty('newestTimestamp');
      expect(response.body).toHaveProperty('retentionWindowMs');
      expect(response.body).toHaveProperty('entitiesTracked');
      expect(response.body).toHaveProperty('memoryUsageMB');
      expect(typeof response.body.totalUpdates).toBe('number');
    });

    it('should show non-zero counts after updates', async () => {
      const agent = new CRDTAgent({
        agentId: 'test-agent',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await agent.connect();
      agent.updateSpec('s-test', {
        title: 'Test Spec',
        content: 'Test content',
        priority: 1
      });
      await new Promise(resolve => setTimeout(resolve, 200));
      await agent.disconnect();

      const response = await request(app)
        .get('/api/history/metadata')
        .expect(200);

      expect(response.body.totalUpdates).toBeGreaterThan(0);
    });
  });

  describe('GET /api/:entityType/:id/history', () => {
    it('should return empty array for entity with no history', async () => {
      const response = await request(app)
        .get('/api/spec/s-nonexistent/history')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toEqual([]);
    });

    it('should return update history for an entity', async () => {
      const agent = new CRDTAgent({
        agentId: 'test-agent',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await agent.connect();
      agent.updateSpec('s-test1', {
        title: 'Test Spec',
        content: 'Initial content',
        priority: 1
      });
      await new Promise(resolve => setTimeout(resolve, 200));
      await agent.disconnect();

      const response = await request(app)
        .get('/api/spec/s-test1/history')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('entityType');
      expect(response.body[0]).toHaveProperty('entityId', 's-test1');
      expect(response.body[0]).toHaveProperty('clientId', 'test-agent');
      expect(response.body[0]).toHaveProperty('timestamp');
      expect(response.body[0]).toHaveProperty('contentSnapshot');
    });

    it('should validate entity type', async () => {
      const response = await request(app)
        .get('/api/invalid/s-test/history')
        .expect(400);

      expect(response.body.error).toContain('Invalid entity type');
    });

    it('should filter by time range', async () => {
      const agent = new CRDTAgent({
        agentId: 'test-agent',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await agent.connect();

      const timestamp1 = Date.now();
      agent.updateSpec('s-range', {
        title: 'Test',
        content: 'Update 1',
        priority: 1
      });
      await new Promise(resolve => setTimeout(resolve, 200));

      const timestamp2 = Date.now();
      agent.updateSpec('s-range', {
        content: 'Update 2'
      });
      await new Promise(resolve => setTimeout(resolve, 200));

      await agent.disconnect();

      // Get history from timestamp2 onwards
      const response = await request(app)
        .get(`/api/spec/s-range/history?from=${timestamp2}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      // Should have at least the second update
      expect(response.body.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/:entityType/:id/version/:timestamp', () => {
    it('should return 404 for entity with no history', async () => {
      const response = await request(app)
        .get(`/api/spec/s-nonexistent/version/${Date.now()}`)
        .expect(404);

      expect(response.body.error).toContain('No history available');
    });

    it('should reconstruct version at specific timestamp', async () => {
      const agent = new CRDTAgent({
        agentId: 'test-agent',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await agent.connect();

      agent.updateSpec('s-version', {
        title: 'Version Test',
        content: 'Version 1',
        priority: 1
      });
      await new Promise(resolve => setTimeout(resolve, 200));

      const timestamp = Date.now();

      agent.updateSpec('s-version', {
        content: 'Version 2'
      });
      await new Promise(resolve => setTimeout(resolve, 200));

      await agent.disconnect();

      const response = await request(app)
        .get(`/api/spec/s-version/version/${timestamp}`)
        .expect(200);

      expect(response.body).toHaveProperty('content');
      expect(response.body).toHaveProperty('lastModifiedBy', 'test-agent');
    });

    it('should validate timestamp parameter', async () => {
      const response = await request(app)
        .get('/api/spec/s-test/version/invalid')
        .expect(400);

      expect(response.body.error).toContain('Invalid timestamp');
    });

    it('should validate entity type', async () => {
      const response = await request(app)
        .get(`/api/invalid/s-test/version/${Date.now()}`)
        .expect(400);

      expect(response.body.error).toContain('Invalid entity type');
    });
  });

  describe('GET /api/:entityType/:id/diff', () => {
    it('should return diff between two timestamps', async () => {
      const agent = new CRDTAgent({
        agentId: 'test-agent',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await agent.connect();

      agent.updateSpec('s-diff', {
        title: 'Diff Test',
        content: 'line 1\nline 2',
        priority: 1
      });
      await new Promise(resolve => setTimeout(resolve, 200));

      const timestamp1 = Date.now();

      agent.updateSpec('s-diff', {
        content: 'line 1\nline 2\nline 3'
      });
      await new Promise(resolve => setTimeout(resolve, 200));

      const timestamp2 = Date.now();

      await agent.disconnect();

      const response = await request(app)
        .get(`/api/spec/s-diff/diff?from=${timestamp1}&to=${timestamp2}`)
        .expect(200);

      expect(response.body).toHaveProperty('from');
      expect(response.body).toHaveProperty('to');
      expect(response.body).toHaveProperty('diff');
      expect(response.body).toHaveProperty('author', 'test-agent');
      expect(Array.isArray(response.body.diff)).toBe(true);
    });

    it('should validate entity type', async () => {
      const response = await request(app)
        .get(`/api/invalid/s-test/diff?from=1&to=2`)
        .expect(400);

      expect(response.body.error).toContain('Invalid entity type');
    });

    it('should require from and to timestamps', async () => {
      const response = await request(app)
        .get('/api/spec/s-test/diff')
        .expect(400);

      expect(response.body.error).toContain('Missing from or to timestamp');
    });

    it('should validate timestamp format', async () => {
      const response = await request(app)
        .get('/api/spec/s-test/diff?from=invalid&to=123')
        .expect(400);

      expect(response.body.error).toContain('Invalid timestamp format');
    });
  });

  describe('GET /api/:entityType/:id/blame', () => {
    it('should return blame for entity', async () => {
      const agent = new CRDTAgent({
        agentId: 'test-agent',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await agent.connect();

      agent.updateSpec('s-blame', {
        title: 'Blame Test',
        content: 'line 1\nline 2\nline 3',
        priority: 1
      });
      await new Promise(resolve => setTimeout(resolve, 200));

      await agent.disconnect();

      const response = await request(app)
        .get('/api/spec/s-blame/blame')
        .expect(200);

      expect(response.body).toHaveProperty('lines');
      expect(Array.isArray(response.body.lines)).toBe(true);
      expect(response.body.lines.length).toBeGreaterThanOrEqual(3);

      // Each line should have authorship info
      response.body.lines.forEach((line: any) => {
        expect(line).toHaveProperty('lineNumber');
        expect(line).toHaveProperty('author', 'test-agent');
        expect(line).toHaveProperty('timestamp');
        expect(line).toHaveProperty('line');
      });
    });

    it('should return empty blame for entity with no history', async () => {
      const response = await request(app)
        .get('/api/spec/s-nonexistent/blame')
        .expect(200);

      expect(response.body).toEqual({ lines: [] });
    });

    it('should validate entity type', async () => {
      const response = await request(app)
        .get('/api/invalid/s-test/blame')
        .expect(400);

      expect(response.body.error).toContain('Invalid entity type');
    });
  });

  describe('GET /api/history/client/:clientId', () => {
    it('should return empty array for client with no updates', async () => {
      const response = await request(app)
        .get('/api/history/client/nonexistent-agent')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should return all updates by a specific client', async () => {
      const agent1 = new CRDTAgent({
        agentId: 'agent-1',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      const agent2 = new CRDTAgent({
        agentId: 'agent-2',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await Promise.all([agent1.connect(), agent2.connect()]);

      agent1.updateSpec('s-client1', {
        title: 'Agent 1 Spec',
        content: 'Content by agent 1',
        priority: 1
      });

      agent2.updateSpec('s-client2', {
        title: 'Agent 2 Spec',
        content: 'Content by agent 2',
        priority: 1
      });

      await new Promise(resolve => setTimeout(resolve, 200));
      await Promise.all([agent1.disconnect(), agent2.disconnect()]);

      const response = await request(app)
        .get('/api/history/client/agent-1')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);

      // All updates should be from agent-1
      response.body.forEach((update: any) => {
        expect(update.entityId).toBe('s-client1');
      });
    });

    it('should filter client history by time range', async () => {
      const agent = new CRDTAgent({
        agentId: 'test-agent',
        coordinatorUrl: `ws://localhost:${port}/ws/crdt`
      });

      await agent.connect();

      const timestamp1 = Date.now();
      agent.updateSpec('s-time1', {
        title: 'Test 1',
        content: 'Update 1',
        priority: 1
      });
      await new Promise(resolve => setTimeout(resolve, 200));

      const timestamp2 = Date.now();
      agent.updateSpec('s-time2', {
        title: 'Test 2',
        content: 'Update 2',
        priority: 1
      });
      await new Promise(resolve => setTimeout(resolve, 200));

      await agent.disconnect();

      // Get history from timestamp2 onwards
      const response = await request(app)
        .get(`/api/history/client/test-agent?from=${timestamp2}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });
  });
});
