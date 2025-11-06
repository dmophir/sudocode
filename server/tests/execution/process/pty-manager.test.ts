/**
 * PTY Process Manager Tests
 *
 * Tests for the PtyProcessManager class
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PtyProcessManager } from '../../../src/execution/process/pty-manager.js';
import type { ProcessConfig } from '../../../src/execution/process/types.js';

// Save cwd at module level to avoid collision with `process` variable in tests
const CWD = process.cwd();

describe('PtyProcessManager', () => {
  let manager: PtyProcessManager;

  beforeEach(() => {
    manager = new PtyProcessManager();
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  it('should spawn a PTY process', async () => {
    const config: ProcessConfig = {
      executablePath: 'echo',
      args: ['Hello, World!'],
      workDir: CWD,
      mode: 'interactive',
    };

    const ptyProc = await manager.acquireProcess(config);

    expect(ptyProc).toBeDefined();
    expect(ptyProc.pid).toBeGreaterThan(0);
    expect(ptyProc.status).toBe('busy');
    expect(ptyProc.ptyProcess).toBeDefined();
    expect(typeof ptyProc.write).toBe('function');
    expect(typeof ptyProc.resize).toBe('function');
  });

  it('should receive output from PTY', async () => {
    const config: ProcessConfig = {
      executablePath: 'echo',
      args: ['test output'],
      workDir: CWD,
      mode: 'interactive',
    };

    const ptyProc = await manager.acquireProcess(config);

    const output: string[] = [];
    ptyProc.onData((data) => {
      output.push(data);
    });

    // Wait for process to exit
    await new Promise<void>((resolve) => {
      ptyProc.onExit(() => resolve());
    });

    // Verify we received some output
    expect(output.length).toBeGreaterThan(0);
    const allOutput = output.join('');
    expect(allOutput).toContain('test');
  });

  it('should handle process exit', async () => {
    const config: ProcessConfig = {
      executablePath: 'echo',
      args: ['hello'],
      workDir: CWD,
      mode: 'interactive',
    };

    const ptyProc = await manager.acquireProcess(config);

    let exitCode: number | undefined;
    ptyProc.onExit((code) => {
      exitCode = code;
    });

    // Wait for exit
    await new Promise<void>((resolve) => {
      ptyProc.onExit(() => resolve());
    });

    expect(exitCode).toBe(0);
    expect(ptyProc.exitCode).toBe(0);
    expect(ptyProc.status).toBe('completed');
  });

  it('should terminate a running process', async () => {
    const config: ProcessConfig = {
      executablePath: 'sleep',
      args: ['10'],
      workDir: CWD,
      mode: 'interactive',
    };

    const ptyProc = await manager.acquireProcess(config);

    // Terminate process
    await manager.terminateProcess(ptyProc.id);

    // Process should have exited
    expect(ptyProc.exitCode).not.toBeNull();
  });

  it('should track multiple processes', async () => {
    const config: ProcessConfig = {
      executablePath: 'echo',
      args: ['test'],
      workDir: CWD,
      mode: 'interactive',
    };

    const ptyProc1 = await manager.acquireProcess(config);
    const ptyProc2 = await manager.acquireProcess(config);

    expect(ptyProc1.id).not.toBe(ptyProc2.id);

    const activeProcesses = manager.getActiveProcesses();
    expect(activeProcesses.length).toBeGreaterThanOrEqual(1);

    const metrics = manager.getMetrics();
    expect(metrics.totalSpawned).toBeGreaterThanOrEqual(2);
  });

  it('should send input to PTY', async () => {
    // Use 'cat' which reads from stdin
    const config: ProcessConfig = {
      executablePath: 'cat',
      args: [],
      workDir: CWD,
      mode: 'interactive',
      timeout: 5000,
    };

    const ptyProc = await manager.acquireProcess(config);

    const output: string[] = [];
    ptyProc.onData((data) => {
      output.push(data);
    });

    // Send input
    await manager.sendInput(ptyProc.id, 'hello\n');

    // Give it a moment to process
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Terminate (cat doesn't exit on its own)
    await manager.terminateProcess(ptyProc.id);

    // Verify we received the echoed input
    const allOutput = output.join('');
    expect(allOutput).toContain('hello');
  });

  it('should resize terminal', async () => {
    const config: ProcessConfig = {
      executablePath: 'echo',
      args: ['test'],
      workDir: CWD,
      mode: 'interactive',
      terminal: {
        cols: 80,
        rows: 24,
      },
    };

    const ptyProc = await manager.acquireProcess(config);

    // Resize should not throw
    expect(() => {
      ptyProc.resize(120, 40);
    }).not.toThrow();
  });

  it('should update metrics on completion', async () => {
    const config: ProcessConfig = {
      executablePath: 'echo',
      args: ['test'],
      workDir: CWD,
      mode: 'interactive',
    };

    const initialMetrics = manager.getMetrics();
    const initialSpawned = initialMetrics.totalSpawned;

    const ptyProc = await manager.acquireProcess(config);

    // Wait for completion
    await new Promise<void>((resolve) => {
      ptyProc.onExit(() => resolve());
    });

    // Give time for metrics update
    await new Promise((resolve) => setTimeout(resolve, 100));

    const finalMetrics = manager.getMetrics();
    expect(finalMetrics.totalSpawned).toBe(initialSpawned + 1);
    expect(finalMetrics.totalCompleted).toBeGreaterThan(0);
  });

  it('should handle timeout', async () => {
    const config: ProcessConfig = {
      executablePath: 'sleep',
      args: ['10'],
      workDir: CWD,
      mode: 'interactive',
      timeout: 500, // 500ms timeout
    };

    const ptyProc = await manager.acquireProcess(config);

    // Wait for timeout to trigger
    await new Promise<void>((resolve) => {
      ptyProc.onExit(() => resolve());
    });

    // Process should have been terminated
    expect(ptyProc.exitCode).not.toBeNull();
  });

  it('should cleanup on shutdown', async () => {
    const config: ProcessConfig = {
      executablePath: 'sleep',
      args: ['10'],
      workDir: CWD,
      mode: 'interactive',
    };

    const ptyProc = await manager.acquireProcess(config);

    // Verify process is running
    expect(ptyProc.exitCode).toBeNull();

    await manager.shutdown();

    // Process should have been terminated
    expect(ptyProc.exitCode).not.toBeNull();

    // Metrics should show the process was terminated
    const metrics = manager.getMetrics();
    expect(metrics.currentlyActive).toBe(0);
  });
});
