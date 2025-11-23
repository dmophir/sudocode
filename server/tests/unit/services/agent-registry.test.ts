/**
 * Unit tests for Agent Registry Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AgentRegistryService,
  AgentNotFoundError,
  AgentNotImplementedError,
} from '../../../src/services/agent-registry.js';
import type { AgentType } from '@sudocode-ai/types/agents';

describe('AgentRegistryService', () => {
  let service: AgentRegistryService;

  beforeEach(() => {
    service = new AgentRegistryService();
    // No need to call initialize() - it's lazy-initialized on first use
  });

  describe('initialization', () => {
    it('should initialize successfully', () => {
      expect(service).toBeDefined();
    });

    it('should register all 4 agents', () => {
      const agents = service.getAvailableAgents();
      expect(agents).toHaveLength(4);
    });

    it('should register agents with correct names', () => {
      const agents = service.getAvailableAgents();
      const names = agents.map((a) => a.name);
      expect(names).toContain('claude-code');
      expect(names).toContain('codex');
      expect(names).toContain('copilot');
      expect(names).toContain('cursor');
    });
  });

  describe('getAvailableAgents', () => {
    it('should return agent metadata with implementation status', () => {
      const agents = service.getAvailableAgents();

      agents.forEach((agent) => {
        expect(agent).toHaveProperty('name');
        expect(agent).toHaveProperty('displayName');
        expect(agent).toHaveProperty('supportedModes');
        expect(agent).toHaveProperty('supportsStreaming');
        expect(agent).toHaveProperty('supportsStructuredOutput');
        expect(agent).toHaveProperty('implemented');
        expect(typeof agent.implemented).toBe('boolean');
      });
    });

    it('should mark Claude Code as implemented', () => {
      const agents = service.getAvailableAgents();
      const claudeCode = agents.find((a) => a.name === 'claude-code');
      expect(claudeCode?.implemented).toBe(true);
    });

    it('should mark stub agents as not implemented', () => {
      const agents = service.getAvailableAgents();
      const codex = agents.find((a) => a.name === 'codex');
      const copilot = agents.find((a) => a.name === 'copilot');
      const cursor = agents.find((a) => a.name === 'cursor');

      expect(codex?.implemented).toBe(false);
      expect(copilot?.implemented).toBe(false);
      expect(cursor?.implemented).toBe(false);
    });

    it('should return agents with correct metadata', () => {
      const agents = service.getAvailableAgents();

      const claudeCode = agents.find((a) => a.name === 'claude-code');
      expect(claudeCode?.displayName).toBe('Claude Code');
      expect(claudeCode?.supportedModes).toEqual(['structured', 'interactive', 'hybrid']);
      expect(claudeCode?.supportsStreaming).toBe(true);
      expect(claudeCode?.supportsStructuredOutput).toBe(true);

      const codex = agents.find((a) => a.name === 'codex');
      expect(codex?.displayName).toBe('OpenAI Codex');
      expect(codex?.supportedModes).toEqual(['structured']);
      expect(codex?.supportsStreaming).toBe(false);
      expect(codex?.supportsStructuredOutput).toBe(true);
    });
  });

  describe('getAdapter', () => {
    it('should retrieve Claude Code adapter successfully', () => {
      const adapter = service.getAdapter('claude-code');
      expect(adapter).toBeDefined();
      expect(adapter.metadata.name).toBe('claude-code');
    });

    it('should retrieve stub adapters successfully', () => {
      const codexAdapter = service.getAdapter('codex');
      const copilotAdapter = service.getAdapter('copilot');
      const cursorAdapter = service.getAdapter('cursor');

      expect(codexAdapter.metadata.name).toBe('codex');
      expect(copilotAdapter.metadata.name).toBe('copilot');
      expect(cursorAdapter.metadata.name).toBe('cursor');
    });

    it('should throw AgentNotFoundError for unknown agent', () => {
      expect(() => {
        service.getAdapter('unknown' as AgentType);
      }).toThrow(AgentNotFoundError);
    });

    it('should throw AgentNotFoundError with correct message', () => {
      expect(() => {
        service.getAdapter('unknown' as AgentType);
      }).toThrow("Agent 'unknown' not found in registry");
    });
  });

  describe('isAgentImplemented', () => {
    it('should return true for Claude Code', () => {
      expect(service.isAgentImplemented('claude-code')).toBe(true);
    });

    it('should return false for stub agents', () => {
      expect(service.isAgentImplemented('codex')).toBe(false);
      expect(service.isAgentImplemented('copilot')).toBe(false);
      expect(service.isAgentImplemented('cursor')).toBe(false);
    });
  });

  describe('hasAgent', () => {
    it('should return true for registered agents', () => {
      expect(service.hasAgent('claude-code')).toBe(true);
      expect(service.hasAgent('codex')).toBe(true);
      expect(service.hasAgent('copilot')).toBe(true);
      expect(service.hasAgent('cursor')).toBe(true);
    });

    it('should return false for unregistered agents', () => {
      expect(service.hasAgent('unknown' as AgentType)).toBe(false);
    });
  });

  describe('stub adapters', () => {
    it('should throw AgentNotImplementedError when using Codex adapter', () => {
      const adapter = service.getAdapter('codex');
      expect(() => {
        adapter.buildProcessConfig({
          workDir: '/tmp',
        });
      }).toThrow(AgentNotImplementedError);
      expect(() => {
        adapter.buildProcessConfig({
          workDir: '/tmp',
        });
      }).toThrow("Agent 'codex' is not yet implemented");
    });

    it('should throw AgentNotImplementedError when using Copilot adapter', () => {
      const adapter = service.getAdapter('copilot');
      expect(() => {
        adapter.buildProcessConfig({
          workDir: '/tmp',
        });
      }).toThrow(AgentNotImplementedError);
    });

    it('should throw AgentNotImplementedError when using Cursor adapter', () => {
      const adapter = service.getAdapter('cursor');
      expect(() => {
        adapter.buildProcessConfig({
          workDir: '/tmp',
        });
      }).toThrow(AgentNotImplementedError);
    });
  });

  describe('markAsImplemented', () => {
    it('should mark a stub agent as implemented', () => {
      expect(service.isAgentImplemented('codex')).toBe(false);

      service.markAsImplemented('codex');

      expect(service.isAgentImplemented('codex')).toBe(true);

      const agents = service.getAvailableAgents();
      const codex = agents.find((a) => a.name === 'codex');
      expect(codex?.implemented).toBe(true);
    });

    it('should throw AgentNotFoundError for unknown agent', () => {
      expect(() => {
        service.markAsImplemented('unknown' as AgentType);
      }).toThrow(AgentNotFoundError);
    });
  });

  describe('Claude Code adapter', () => {
    it('should have working buildProcessConfig', () => {
      const adapter = service.getAdapter('claude-code');
      const config = adapter.buildProcessConfig({
        workDir: '/tmp/test',
        print: true,
        outputFormat: 'stream-json',
        verbose: true,
      });

      expect(config).toBeDefined();
      expect(config.workDir).toBe('/tmp/test');
      expect(config.args).toBeDefined();
      expect(Array.isArray(config.args)).toBe(true);
    });

    it('should have working validateConfig', () => {
      const adapter = service.getAdapter('claude-code');

      // Valid config
      const validErrors = adapter.validateConfig?.({
        workDir: '/tmp/test',
        print: true,
        outputFormat: 'stream-json',
      });
      expect(validErrors).toEqual([]);

      // Invalid config - missing workDir
      const invalidErrors = adapter.validateConfig?.({
        workDir: '',
        print: false,
        outputFormat: 'stream-json',
      });
      expect(invalidErrors).toBeDefined();
      expect(invalidErrors!.length).toBeGreaterThan(0);
    });

    it('should have working getDefaultConfig', () => {
      const adapter = service.getAdapter('claude-code');
      const defaults = adapter.getDefaultConfig?.();

      expect(defaults).toBeDefined();
      expect(defaults?.claudePath).toBe('claude');
      expect(defaults?.print).toBe(true);
      expect(defaults?.outputFormat).toBe('stream-json');
    });
  });
});
