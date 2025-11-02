/**
 * Integration test for real-time issue updates via WebSocket
 * Tests CRUD operations broadcasting to subscribed clients
 *
 * NOTE: These tests require a running server at http://localhost:3002
 * Run the server with: npm run dev:server
 * Then run these tests with: npm test -- --run tests/integration/issue-broadcasts.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
// @ts-ignore - node-fetch types not available
import fetch from 'node-fetch';

const WS_URL = process.env.WS_URL || 'ws://localhost:3002/ws';
const API_URL = process.env.API_URL || 'http://localhost:3002/api/issues';

// Helper function to wait for a specific WebSocket message
function waitForMessage(
  ws: WebSocket,
  predicate: (message: any) => boolean,
  timeoutMs = 5000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for message after ${timeoutMs}ms`));
    }, timeoutMs);

    const handler = (data: any) => {
      try {
        const message = JSON.parse(data.toString());
        if (predicate(message)) {
          clearTimeout(timeout);
          ws.off('message', handler);
          resolve(message);
        }
      } catch (error) {
        // Ignore parse errors
      }
    };

    ws.on('message', handler);
  });
}

// Helper to create an issue via API
async function createIssue(title: string, description = 'Test issue') {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, description }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create issue: ${response.statusText}`);
  }

  const result: any = await response.json();
  return result.data;
}

// Helper to update an issue via API
async function updateIssue(id: string, updates: any) {
  const response = await fetch(`${API_URL}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    throw new Error(`Failed to update issue: ${response.statusText}`);
  }

  const result: any = await response.json();
  return result.data;
}

// Helper to delete an issue via API
async function deleteIssue(id: string) {
  const response = await fetch(`${API_URL}/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to delete issue: ${response.statusText}`);
  }

  const result: any = await response.json();
  return result.data;
}

describe.skip('Issue Broadcast Integration Tests', () => {
  let ws: WebSocket;

  beforeAll(async () => {
    // Connect to WebSocket server
    ws = new WebSocket(WS_URL);

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    // Subscribe to all issues
    ws.send(JSON.stringify({ type: 'subscribe', entity_type: 'issue' }));

    // Wait for subscription confirmation
    await waitForMessage(
      ws,
      (msg) => msg.type === 'subscribed' && msg.subscription === 'issue:*'
    );
  });

  afterAll(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });

  it('should broadcast issue creation', async () => {
    // Set up listener BEFORE creating the issue
    const createBroadcastPromise = waitForMessage(
      ws,
      (msg) => msg.type === 'issue_created'
    );

    const createdIssue = await createIssue(
      'Real-time Test Issue',
      'Testing WebSocket broadcast'
    );

    const createBroadcast = await createBroadcastPromise;

    expect(createBroadcast.type).toBe('issue_created');
    expect(createBroadcast.data.id).toBe(createdIssue.id);
    expect(createBroadcast.data.title).toBe('Real-time Test Issue');

    // Cleanup
    const deletePromise = waitForMessage(
      ws,
      (msg) => msg.type === 'issue_deleted' && msg.data.id === createdIssue.id
    );
    await deleteIssue(createdIssue.id);
    await deletePromise;
  });

  it('should broadcast issue updates', async () => {
    // Create an issue first
    const createPromise = waitForMessage(
      ws,
      (msg) => msg.type === 'issue_created'
    );
    const createdIssue = await createIssue(
      'Update Test Issue',
      'Testing update broadcasts'
    );
    await createPromise;

    // Set up listener BEFORE updating
    const updateBroadcastPromise = waitForMessage(
      ws,
      (msg) => msg.type === 'issue_updated' && msg.data.id === createdIssue.id
    );

    await updateIssue(createdIssue.id, {
      title: 'Updated Real-time Test Issue',
      status: 'in_progress',
    });

    const updateBroadcast = await updateBroadcastPromise;

    expect(updateBroadcast.type).toBe('issue_updated');
    expect(updateBroadcast.data.id).toBe(createdIssue.id);
    expect(updateBroadcast.data.title).toBe('Updated Real-time Test Issue');
    expect(updateBroadcast.data.status).toBe('in_progress');

    // Cleanup
    const deletePromise = waitForMessage(
      ws,
      (msg) => msg.type === 'issue_deleted' && msg.data.id === createdIssue.id
    );
    await deleteIssue(createdIssue.id);
    await deletePromise;
  });

  it('should broadcast issue deletion', async () => {
    // Create an issue first
    const createPromise = waitForMessage(
      ws,
      (msg) => msg.type === 'issue_created'
    );
    const createdIssue = await createIssue(
      'Delete Test Issue',
      'Testing delete broadcasts'
    );
    await createPromise;

    // Set up listener BEFORE deleting
    const deleteBroadcastPromise = waitForMessage(
      ws,
      (msg) => msg.type === 'issue_deleted' && msg.data.id === createdIssue.id
    );

    await deleteIssue(createdIssue.id);

    const deleteBroadcast = await deleteBroadcastPromise;

    expect(deleteBroadcast.type).toBe('issue_deleted');
    expect(deleteBroadcast.data.id).toBe(createdIssue.id);
  });

  it('should handle specific issue subscription', async () => {
    // Create an issue
    const createPromise = waitForMessage(
      ws,
      (msg) => msg.type === 'issue_created'
    );
    const specificIssue = await createIssue(
      'Specific Subscription Test',
      'Testing specific issue subscription'
    );
    await createPromise;

    // Subscribe to this specific issue
    ws.send(
      JSON.stringify({
        type: 'subscribe',
        entity_type: 'issue',
        entity_id: specificIssue.id,
      })
    );

    const subscribeMessage = await waitForMessage(
      ws,
      (msg) =>
        msg.type === 'subscribed' &&
        msg.subscription === `issue:${specificIssue.id}`
    );

    expect(subscribeMessage.type).toBe('subscribed');
    expect(subscribeMessage.subscription).toBe(`issue:${specificIssue.id}`);

    // Set up listener BEFORE updating
    const specificUpdatePromise = waitForMessage(
      ws,
      (msg) => msg.type === 'issue_updated' && msg.data.id === specificIssue.id
    );

    // Update the specific issue
    await updateIssue(specificIssue.id, { priority: 0 });

    const specificUpdateBroadcast = await specificUpdatePromise;

    expect(specificUpdateBroadcast.type).toBe('issue_updated');
    expect(specificUpdateBroadcast.data.id).toBe(specificIssue.id);
    expect(specificUpdateBroadcast.data.priority).toBe(0);

    // Cleanup
    const cleanupDeletePromise = waitForMessage(
      ws,
      (msg) => msg.type === 'issue_deleted' && msg.data.id === specificIssue.id
    );
    await deleteIssue(specificIssue.id);
    await cleanupDeletePromise;
  });
});
