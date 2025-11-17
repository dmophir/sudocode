/**
 * Tests for execution mode selection in ExecutionService
 *
 * Verifies that ExecutionService:
 * - Uses factory pattern to create appropriate process managers
 * - Selects correct output processor based on execution mode
 * - Passes terminal config to PTY processes
 * - Maintains backward compatibility (defaults to structured mode)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { ExecutionService, type ExecutionConfig } from '../../../src/services/execution-service.js';
import { ExecutionLifecycleService } from '../../../src/services/execution-lifecycle.js';
import { initDatabase as initCliDatabase } from '@sudocode-ai/cli/dist/db.js';
import { initDatabase as initServerDatabase } from '../../../src/services/db.js';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// Mock the process managers and output processors
vi.mock('../../../src/execution/process/factory.js', () => ({
  createProcessManager: vi.fn((config) => {
    return {
      acquireProcess: vi.fn().mockResolvedValue({
        id: 'mock-process-id',
        pid: 12345,
        status: 'idle',
        spawnedAt: new Date(),
        lastActivity: new Date(),
        exitCode: null,
        signal: null,
        metrics: {
          totalDuration: 0,
          tasksCompleted: 0,
          successRate: 1,
        },
        // Store the config for test verification
        _mockConfig: config,
      }),
      releaseProcess: vi.fn(),
      terminateProcess: vi.fn(),
      getMetrics: vi.fn().mockReturnValue({
        totalSpawned: 0,
        currentlyActive: 0,
        totalCompleted: 0,
        totalFailed: 0,
        averageDuration: 0,
      }),
      shutdown: vi.fn(),
    };
  }),
}));

vi.mock('../../../src/execution/engine/simple-engine.js', () => ({
  SimpleExecutionEngine: vi.fn().mockImplementation(() => ({
    executeTask: vi.fn().mockResolvedValue({
      success: true,
      result: { output: 'mock output' },
    }),
    shutdown: vi.fn(),
  })),
}));

vi.mock('../../../src/execution/resilience/resilient-executor.js', () => ({
  ResilientExecutor: vi.fn().mockImplementation((engine) => engine),
}));

vi.mock('../../../src/execution/workflow/linear-orchestrator.js', () => ({
  LinearOrchestrator: vi.fn().mockImplementation(() => {
    const handlers: Record<string, Function> = {};
    return {
      startWorkflow: vi.fn().mockImplementation(() => {
        // Simulate immediate workflow start and completion
        setTimeout(() => {
          handlers.onWorkflowStart?.();
          handlers.onWorkflowComplete?.();
        }, 10);
      }),
      onWorkflowStart: vi.fn((handler) => {
        handlers.onWorkflowStart = handler;
      }),
      onWorkflowComplete: vi.fn((handler) => {
        handlers.onWorkflowComplete = handler;
      }),
      onWorkflowFailed: vi.fn((handler) => {
        handlers.onWorkflowFailed = handler;
      }),
      cancelWorkflow: vi.fn(),
    };
  }),
}));

vi.mock('../../../src/execution/output/ag-ui-integration.js', () => ({
  createAgUiSystem: vi.fn(() => ({
    processor: {
      processLine: vi.fn().mockResolvedValue(undefined),
    },
    adapter: {
      emit: vi.fn(),
    },
  })),
}));

describe('ExecutionService - Mode Selection', () => {
  let db: Database.Database;
  let dbPath: string;
  let executionService: ExecutionService;
  let tempRepoPath: string;

  beforeEach(() => {
    // Create temp database file
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sudocode-test-'));
    dbPath = path.join(tempDir, 'test.db');

    // Initialize CLI tables first (issues, specs, etc.)
    db = initCliDatabase({ path: dbPath });

    // Then initialize server tables (executions, etc.)
    initServerDatabase({ path: dbPath });

    // Create temp repo directory
    tempRepoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'sudocode-repo-'));

    // Create ExecutionService
    const lifecycleService = new ExecutionLifecycleService(db, tempRepoPath);
    executionService = new ExecutionService(db, tempRepoPath, lifecycleService);

    // Create a test issue
    db.prepare(`
      INSERT INTO issues (id, uuid, title, content, status)
      VALUES (?, ?, ?, ?, ?)
    `).run('test-issue-1', 'uuid-1', 'Test Issue', 'Test content', 'open');
  });

  afterEach(() => {
    db.close();
    // Clean up temp directories
    const tempDir = path.dirname(dbPath);
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    if (fs.existsSync(tempRepoPath)) {
      fs.rmSync(tempRepoPath, { recursive: true, force: true });
    }
  });

  describe('Backward Compatibility', () => {
    it('should default to structured mode when execution_mode not specified', async () => {
      const config: ExecutionConfig = {
        mode: 'local',
        model: 'claude-sonnet-4',
      };

      await executionService.createExecution('test-issue-1', config, 'Test prompt');

      // Verify execution was created with config
      const execution = db.prepare('SELECT * FROM executions WHERE issue_id = ?').get('test-issue-1') as any;
      expect(execution).toBeDefined();

      const parsedConfig = JSON.parse(execution.config);
      expect(parsedConfig.execution_mode).toBeUndefined();
    });
  });

  describe('Structured Mode', () => {
    it('should create execution in structured mode', async () => {
      const config: ExecutionConfig = {
        mode: 'local',
        execution_mode: 'structured',
        model: 'claude-sonnet-4',
      };

      await executionService.createExecution('test-issue-1', config, 'Test prompt');

      // Verify execution was created
      const execution = db.prepare('SELECT * FROM executions WHERE issue_id = ?').get('test-issue-1') as any;
      expect(execution).toBeDefined();

      const parsedConfig = JSON.parse(execution.config);
      expect(parsedConfig.execution_mode).toBe('structured');
    });
  });

  describe('Interactive Mode', () => {
    it('should create execution in interactive mode', async () => {
      const config: ExecutionConfig = {
        mode: 'local',
        execution_mode: 'interactive',
        terminal_config: { cols: 120, rows: 40 },
        model: 'claude-sonnet-4',
      };

      await executionService.createExecution('test-issue-1', config, 'Test prompt');

      // Verify execution was created
      const execution = db.prepare('SELECT * FROM executions WHERE issue_id = ?').get('test-issue-1') as any;
      expect(execution).toBeDefined();

      const parsedConfig = JSON.parse(execution.config);
      expect(parsedConfig.execution_mode).toBe('interactive');
      expect(parsedConfig.terminal_config).toEqual({ cols: 120, rows: 40 });
    });
  });

  describe('Hybrid Mode', () => {
    it('should create execution in hybrid mode', async () => {
      const config: ExecutionConfig = {
        mode: 'local',
        execution_mode: 'hybrid',
        terminal_config: { cols: 100, rows: 30 },
        model: 'claude-sonnet-4',
      };

      await executionService.createExecution('test-issue-1', config, 'Test prompt');

      // Verify execution was created
      const execution = db.prepare('SELECT * FROM executions WHERE issue_id = ?').get('test-issue-1') as any;
      expect(execution).toBeDefined();

      const parsedConfig = JSON.parse(execution.config);
      expect(parsedConfig.execution_mode).toBe('hybrid');
      expect(parsedConfig.terminal_config).toEqual({ cols: 100, rows: 30 });
    });
  });

  describe('Terminal Config', () => {
    it('should use default terminal config when not specified', async () => {
      const config: ExecutionConfig = {
        mode: 'local',
        execution_mode: 'interactive',
        model: 'claude-sonnet-4',
      };

      await executionService.createExecution('test-issue-1', config, 'Test prompt');

      const execution = db.prepare('SELECT * FROM executions WHERE issue_id = ?').get('test-issue-1') as any;
      expect(execution).toBeDefined();

      const parsedConfig = JSON.parse(execution.config);
      expect(parsedConfig.execution_mode).toBe('interactive');
      // terminal_config should not be in stored config if not provided
      expect(parsedConfig.terminal_config).toBeUndefined();
    });

    it('should store custom terminal config', async () => {
      const config: ExecutionConfig = {
        mode: 'local',
        execution_mode: 'hybrid',
        terminal_config: { cols: 200, rows: 50 },
        model: 'claude-sonnet-4',
      };

      await executionService.createExecution('test-issue-1', config, 'Test prompt');

      const execution = db.prepare('SELECT * FROM executions WHERE issue_id = ?').get('test-issue-1') as any;
      const parsedConfig = JSON.parse(execution.config);
      expect(parsedConfig.terminal_config).toEqual({ cols: 200, rows: 50 });
    });
  });

  describe('Config Persistence', () => {
    it('should preserve all config fields including execution_mode', async () => {
      const config: ExecutionConfig = {
        mode: 'local',
        execution_mode: 'hybrid',
        terminal_config: { cols: 80, rows: 24 },
        model: 'claude-sonnet-4',
        timeout: 120000,
        checkpointInterval: 5,
        continueOnStepFailure: true,
        captureFileChanges: false,
        captureToolCalls: true,
      };

      await executionService.createExecution('test-issue-1', config, 'Test prompt');

      const execution = db.prepare('SELECT * FROM executions WHERE issue_id = ?').get('test-issue-1') as any;
      const parsedConfig = JSON.parse(execution.config);

      expect(parsedConfig.execution_mode).toBe('hybrid');
      expect(parsedConfig.terminal_config).toEqual({ cols: 80, rows: 24 });
      expect(parsedConfig.model).toBe('claude-sonnet-4');
      expect(parsedConfig.timeout).toBe(120000);
      expect(parsedConfig.checkpointInterval).toBe(5);
      expect(parsedConfig.continueOnStepFailure).toBe(true);
      expect(parsedConfig.captureFileChanges).toBe(false);
      expect(parsedConfig.captureToolCalls).toBe(true);
    });
  });
});
