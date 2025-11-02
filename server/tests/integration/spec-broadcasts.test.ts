/**
 * Integration test for real-time spec updates via WebSocket
 * Tests CRUD operations broadcasting to subscribed clients
 *
 * NOTE: These tests require a running server at http://localhost:3002
 * Run the server with: npm run dev:server
 * Then run these tests with: npm test -- --run tests/integration/spec-broadcasts.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
// @ts-ignore - node-fetch types not available
import fetch from 'node-fetch';

const WS_URL = process.env.WS_URL || 'ws://localhost:3002/ws';
const API_URL = process.env.API_URL || 'http://localhost:3002/api/specs';

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

// Helper to create a spec via API
async function createSpec(title: string, content = 'Test spec content') {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, content }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create spec: ${response.statusText}`);
  }

  const result: any = await response.json();
  return result.data;
}

// Helper to update a spec via API
async function updateSpec(id: string, updates: any) {
  const response = await fetch(`${API_URL}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    throw new Error(`Failed to update spec: ${response.statusText}`);
  }

  const result: any = await response.json();
  return result.data;
}

// Helper to delete a spec via API
async function deleteSpec(id: string) {
  const response = await fetch(`${API_URL}/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to delete spec: ${response.statusText}`);
  }

  const result: any = await response.json();
  return result.data;
}

describe.skip('Spec Broadcast Integration Tests', () => {
  let ws: WebSocket;

  beforeAll(async () => {
    // Connect to WebSocket server
    ws = new WebSocket(WS_URL);

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    // Subscribe to all specs
    ws.send(JSON.stringify({ type: 'subscribe', entity_type: 'spec' }));

    // Wait for subscription confirmation
    await waitForMessage(
      ws,
      (msg) => msg.type === 'subscribed' && msg.subscription === 'spec:*'
    );
  });

  afterAll(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });

  it('should broadcast spec creation', async () => {
    // Set up listener BEFORE creating the spec
    const createBroadcastPromise = waitForMessage(
      ws,
      (msg) => msg.type === 'spec_created'
    );

    const createdSpec = await createSpec(
      'Real-time Test Spec',
      'Testing WebSocket broadcast for specs'
    );

    const createBroadcast = await createBroadcastPromise;

    expect(createBroadcast.type).toBe('spec_created');
    expect(createBroadcast.data.id).toBe(createdSpec.id);
    expect(createBroadcast.data.title).toBe('Real-time Test Spec');

    // Cleanup
    const deletePromise = waitForMessage(
      ws,
      (msg) => msg.type === 'spec_deleted' && msg.data.id === createdSpec.id
    );
    await deleteSpec(createdSpec.id);
    await deletePromise;
  });

  it('should broadcast spec updates', async () => {
    // Create a spec first
    const createPromise = waitForMessage(
      ws,
      (msg) => msg.type === 'spec_created'
    );
    const createdSpec = await createSpec(
      'Update Test Spec',
      'Testing update broadcasts'
    );
    await createPromise;

    // Set up listener BEFORE updating
    const updateBroadcastPromise = waitForMessage(
      ws,
      (msg) => msg.type === 'spec_updated' && msg.data.id === createdSpec.id
    );

    await updateSpec(createdSpec.id, {
      title: 'Updated Real-time Test Spec',
      priority: 1,
    });

    const updateBroadcast = await updateBroadcastPromise;

    expect(updateBroadcast.type).toBe('spec_updated');
    expect(updateBroadcast.data.id).toBe(createdSpec.id);
    expect(updateBroadcast.data.title).toBe('Updated Real-time Test Spec');
    expect(updateBroadcast.data.priority).toBe(1);

    // Cleanup
    const deletePromise = waitForMessage(
      ws,
      (msg) => msg.type === 'spec_deleted' && msg.data.id === createdSpec.id
    );
    await deleteSpec(createdSpec.id);
    await deletePromise;
  });

  it('should broadcast spec deletion', async () => {
    // Create a spec first
    const createPromise = waitForMessage(
      ws,
      (msg) => msg.type === 'spec_created'
    );
    const createdSpec = await createSpec(
      'Delete Test Spec',
      'Testing delete broadcasts'
    );
    await createPromise;

    // Set up listener BEFORE deleting
    const deleteBroadcastPromise = waitForMessage(
      ws,
      (msg) => msg.type === 'spec_deleted' && msg.data.id === createdSpec.id
    );

    await deleteSpec(createdSpec.id);

    const deleteBroadcast = await deleteBroadcastPromise;

    expect(deleteBroadcast.type).toBe('spec_deleted');
    expect(deleteBroadcast.data.id).toBe(createdSpec.id);
  });

  it('should handle specific spec subscription', async () => {
    // Create a spec
    const createPromise = waitForMessage(
      ws,
      (msg) => msg.type === 'spec_created'
    );
    const specificSpec = await createSpec(
      'Specific Subscription Test',
      'Testing specific spec subscription'
    );
    await createPromise;

    // Subscribe to this specific spec
    ws.send(
      JSON.stringify({
        type: 'subscribe',
        entity_type: 'spec',
        entity_id: specificSpec.id,
      })
    );

    const subscribeMessage = await waitForMessage(
      ws,
      (msg) =>
        msg.type === 'subscribed' &&
        msg.subscription === `spec:${specificSpec.id}`
    );

    expect(subscribeMessage.type).toBe('subscribed');
    expect(subscribeMessage.subscription).toBe(`spec:${specificSpec.id}`);

    // Set up listener BEFORE updating
    const specificUpdatePromise = waitForMessage(
      ws,
      (msg) => msg.type === 'spec_updated' && msg.data.id === specificSpec.id
    );

    // Update the specific spec
    await updateSpec(specificSpec.id, { priority: 0 });

    const specificUpdateBroadcast = await specificUpdatePromise;

    expect(specificUpdateBroadcast.type).toBe('spec_updated');
    expect(specificUpdateBroadcast.data.id).toBe(specificSpec.id);
    expect(specificUpdateBroadcast.data.priority).toBe(0);

    // Cleanup
    const cleanupDeletePromise = waitForMessage(
      ws,
      (msg) => msg.type === 'spec_deleted' && msg.data.id === specificSpec.id
    );
    await deleteSpec(specificSpec.id);
    await cleanupDeletePromise;
  });
});
