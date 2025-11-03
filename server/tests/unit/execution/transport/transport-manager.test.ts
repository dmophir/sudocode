/**
 * TransportManager Tests
 *
 * Tests for the transport manager that coordinates AG-UI adapters with SSE transport.
 *
 * @module execution/transport/tests/transport-manager
 */

import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import { TransportManager, type AgUiEvent } from '../../../../src/execution/transport/transport-manager.js';
import { AgUiEventAdapter } from '../../../../src/execution/output/ag-ui-adapter.js';
import { EventType } from '@ag-ui/core';

describe('TransportManager', () => {
  let manager: TransportManager;

  beforeEach(() => {
    manager = new TransportManager();
  });

  afterEach(() => {
    manager.shutdown();
  });

  describe('constructor', () => {
    it('should create manager with SSE transport', () => {
      expect(manager).toBeTruthy();
      expect(manager.getSseTransport()).toBeTruthy();
    });

    it('should start with no connected adapters', () => {
      expect(manager.getAdapterCount()).toBe(0);
    });
  });

  describe('connectAdapter', () => {
    it('should connect adapter and forward events to transport', () => {
      const adapter = new AgUiEventAdapter('run-123');
      const transport = manager.getSseTransport();

      // Spy on broadcast method
      const broadcastSpy = vi.spyOn(transport, 'broadcast');

      // Connect adapter
      manager.connectAdapter(adapter);

      // Emit event from adapter using public method
      adapter.emitRunStarted();

      // Verify event was broadcast
      expect(broadcastSpy.mock.calls.length).toBe(2); // RUN_STARTED + STATE_SNAPSHOT
    });

    it('should use broadcastToRun when runId is provided', () => {
      const adapter = new AgUiEventAdapter('run-123');
      const transport = manager.getSseTransport();

      // Spy on broadcastToRun method
      const broadcastToRunSpy = vi.spyOn(transport, 'broadcastToRun');

      // Connect adapter with runId
      manager.connectAdapter(adapter, 'run-123');

      // Emit event from adapter
      adapter.emitRunStarted();

      // Verify event was broadcast to run
      expect(broadcastToRunSpy.mock.calls.length).toBe(2); // RUN_STARTED + STATE_SNAPSHOT
      expect(broadcastToRunSpy.mock.calls[0][0]).toBe('run-123');
    });

    it('should support multiple adapters', () => {
      const adapter1 = new AgUiEventAdapter('run-1');
      const adapter2 = new AgUiEventAdapter('run-2');
      const transport = manager.getSseTransport();

      const broadcastSpy = vi.spyOn(transport, 'broadcast');

      manager.connectAdapter(adapter1);
      manager.connectAdapter(adapter2);

      expect(manager.getAdapterCount()).toBe(2);

      // Emit from both adapters
      adapter1.emitRunStarted();
      adapter2.emitRunStarted();

      expect(broadcastSpy.mock.calls.length).toBe(4); // 2 adapters * 2 events each
    });

    it('should increment adapter count', () => {
      const adapter = new AgUiEventAdapter('run-123');

      expect(manager.getAdapterCount()).toBe(0);
      manager.connectAdapter(adapter);
      expect(manager.getAdapterCount()).toBe(1);
    });
  });

  describe('disconnectAdapter', () => {
    it('should disconnect adapter and stop forwarding events', () => {
      const adapter = new AgUiEventAdapter('run-123');
      const transport = manager.getSseTransport();

      const broadcastSpy = vi.spyOn(transport, 'broadcast');

      manager.connectAdapter(adapter);
      const disconnected = manager.disconnectAdapter(adapter);

      expect(disconnected).toBe(true);
      expect(manager.getAdapterCount()).toBe(0);

      // Emit event after disconnect
      adapter.emitRunStarted();

      // Verify event was NOT broadcast (still 0 because we disconnected before emitting)
      expect(broadcastSpy.mock.calls.length).toBe(0);
    });

    it('should return false for non-existent adapter', () => {
      const adapter = new AgUiEventAdapter('run-123');
      const disconnected = manager.disconnectAdapter(adapter);

      expect(disconnected).toBe(false);
    });

    it('should decrement adapter count', () => {
      const adapter = new AgUiEventAdapter('run-123');

      manager.connectAdapter(adapter);
      expect(manager.getAdapterCount()).toBe(1);

      manager.disconnectAdapter(adapter);
      expect(manager.getAdapterCount()).toBe(0);
    });
  });

  describe('broadcast', () => {
    it('should broadcast event to all clients', () => {
      const transport = manager.getSseTransport();
      const broadcastSpy = vi.spyOn(transport, 'broadcast').mockImplementation(() => 2);

      const event: AgUiEvent = {
        type: EventType.RUN_STARTED,
        runId: 'run-123',
        threadId: 'run-123',
        timestamp: Date.now(),
      };

      const count = manager.broadcast(event);

      expect(count).toBe(2);
      expect(broadcastSpy.mock.calls.length).toBe(1);
      // Verify SSE event format
      const sseEvent = broadcastSpy.mock.calls[0][0];
      expect(sseEvent).toBeTruthy();
      expect(sseEvent.event).toBe(EventType.RUN_STARTED);
      expect(sseEvent.data).toEqual(event);
    });
  });

  describe('broadcastToRun', () => {
    it('should broadcast event to specific run', () => {
      const transport = manager.getSseTransport();
      const broadcastToRunSpy = vi.spyOn(transport, 'broadcastToRun').mockImplementation(() => 1);

      const event: AgUiEvent = {
        type: EventType.TOOL_CALL_START,
        toolCallId: 'tool-1',
        toolCallName: 'Read',
        timestamp: Date.now(),
      };

      const count = manager.broadcastToRun('run-123', event);

      expect(count).toBe(1);
      expect(broadcastToRunSpy.mock.calls.length).toBe(1);
      expect(broadcastToRunSpy.mock.calls[0][0]).toBe('run-123');
      // Verify SSE event format
      const sseEvent = broadcastToRunSpy.mock.calls[0][1];
      expect(sseEvent).toBeTruthy();
      expect(sseEvent.event).toBe(EventType.TOOL_CALL_START);
      expect(sseEvent.data).toEqual(event);
    });
  });

  describe('getSseTransport', () => {
    it('should return SSE transport instance', () => {
      const transport = manager.getSseTransport();

      expect(transport).toBeTruthy();
      expect(typeof transport.handleConnection).toBe('function');
      expect(typeof transport.broadcast).toBe('function');
      expect(typeof transport.broadcastToRun).toBe('function');
    });

    it('should return same transport instance', () => {
      const transport1 = manager.getSseTransport();
      const transport2 = manager.getSseTransport();

      expect(transport1).toBe(transport2);
    });
  });

  describe('getAdapterCount', () => {
    it('should return correct count', () => {
      expect(manager.getAdapterCount()).toBe(0);

      const adapter1 = new AgUiEventAdapter('run-1');
      manager.connectAdapter(adapter1);
      expect(manager.getAdapterCount()).toBe(1);

      const adapter2 = new AgUiEventAdapter('run-2');
      manager.connectAdapter(adapter2);
      expect(manager.getAdapterCount()).toBe(2);

      manager.disconnectAdapter(adapter1);
      expect(manager.getAdapterCount()).toBe(1);

      manager.disconnectAdapter(adapter2);
      expect(manager.getAdapterCount()).toBe(0);
    });
  });

  describe('shutdown', () => {
    it('should disconnect all adapters', () => {
      const adapter1 = new AgUiEventAdapter('run-1');
      const adapter2 = new AgUiEventAdapter('run-2');

      manager.connectAdapter(adapter1);
      manager.connectAdapter(adapter2);

      expect(manager.getAdapterCount()).toBe(2);

      manager.shutdown();

      expect(manager.getAdapterCount()).toBe(0);
    });

    it('should shutdown SSE transport', () => {
      const transport = manager.getSseTransport();
      const shutdownSpy = vi.spyOn(transport, 'shutdown');

      manager.shutdown();

      expect(shutdownSpy.mock.calls.length).toBe(1);
    });

    it('should be idempotent', () => {
      const adapter = new AgUiEventAdapter('run-123');
      manager.connectAdapter(adapter);

      manager.shutdown();
      manager.shutdown(); // Should not throw

      expect(manager.getAdapterCount()).toBe(0);
    });

    it('should stop forwarding events after shutdown', () => {
      const adapter = new AgUiEventAdapter('run-123');
      const transport = manager.getSseTransport();

      const broadcastSpy = vi.spyOn(transport, 'broadcast');

      manager.connectAdapter(adapter);
      manager.shutdown();

      // Try to emit after shutdown
      adapter.emitRunStarted();

      // Verify event was NOT broadcast (adapter was disconnected)
      expect(broadcastSpy.mock.calls.length).toBe(0);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete adapter lifecycle', () => {
      const adapter = new AgUiEventAdapter('run-123');
      const transport = manager.getSseTransport();

      const broadcastToRunSpy = vi.spyOn(transport, 'broadcastToRun').mockImplementation(() => 1);

      // Connect
      manager.connectAdapter(adapter, 'run-123');

      // Emit lifecycle events
      adapter.emitRunStarted();
      adapter.emitStateSnapshot();
      adapter.emitRunFinished();

      // Verify all events were broadcast
      // emitRunStarted = RUN_STARTED + STATE_SNAPSHOT (2 events)
      // emitStateSnapshot = 1 event
      // emitRunFinished = 1 event
      // Total: 4 events
      expect(broadcastToRunSpy.mock.calls.length).toBe(4);

      // Disconnect
      manager.disconnectAdapter(adapter);

      // Reset the spy count for next check
      broadcastToRunSpy.mockClear();

      // Emit after disconnect
      adapter.emitRunStarted();

      // Should be 0 (no new broadcast)
      expect(broadcastToRunSpy.mock.calls.length).toBe(0);
    });

    it('should support run-specific and global broadcasts simultaneously', () => {
      const globalAdapter = new AgUiEventAdapter('global');
      const runAdapter = new AgUiEventAdapter('run-123');
      const transport = manager.getSseTransport();

      const broadcastSpy = vi.spyOn(transport, 'broadcast').mockImplementation(() => 5);
      const broadcastToRunSpy = vi.spyOn(transport, 'broadcastToRun').mockImplementation(() => 1);

      // Connect one globally, one to specific run
      manager.connectAdapter(globalAdapter);
      manager.connectAdapter(runAdapter, 'run-123');

      // Emit from both
      globalAdapter.emitRunStarted();
      runAdapter.emitRunStarted();

      // Global adapter emits 2 events via broadcast
      expect(broadcastSpy.mock.calls.length).toBe(2);
      // Run adapter emits 2 events via broadcastToRun
      expect(broadcastToRunSpy.mock.calls.length).toBe(2);
    });

    it('should handle rapid event emissions', () => {
      const adapter = new AgUiEventAdapter('run-123');
      const transport = manager.getSseTransport();

      const broadcastSpy = vi.spyOn(transport, 'broadcast').mockImplementation(() => 1);

      manager.connectAdapter(adapter);

      // Emit events rapidly using public methods
      for (let i = 0; i < 10; i++) {
        adapter.emitStateSnapshot();
      }

      expect(broadcastSpy.mock.calls.length).toBe(10);
    });
  });
});
