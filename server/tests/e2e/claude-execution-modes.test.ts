/**
 * Claude Code Execution Modes E2E Tests
 *
 * Comprehensive end-to-end tests that spawn REAL Claude Code processes
 * across all three execution modes: structured, interactive, and hybrid.
 *
 * IMPORTANT: These tests require Claude Code CLI to be installed and configured.
 * They are SKIPPED BY DEFAULT and will only run when:
 * - The environment variable RUN_E2E_TESTS=true is set
 * - AND Claude Code is available in the PATH
 *
 * To run these tests:
 *   RUN_E2E_TESTS=true npm --prefix server test -- --run tests/e2e/claude-execution-modes.test.ts
 *
 * Or run all E2E tests:
 *   npm run test:e2e
 */

import { describe, it, beforeEach, afterEach, expect, beforeAll } from 'vitest';
import { spawn } from 'node:child_process';
import { SimpleProcessManager } from '../../src/execution/process/simple-manager.js';
import { PtyProcessManager } from '../../src/execution/process/pty-manager.js';
import { ClaudeCodeOutputProcessor } from '../../src/execution/output/claude-code-output-processor.js';
import { HybridOutputProcessor } from '../../src/execution/output/hybrid-output-processor.js';
import { buildClaudeConfig } from '../../src/execution/process/builders/claude.js';
import type { ProcessConfig, TerminalConfig } from '../../src/execution/process/types.js';

// Check if E2E tests should run
console.log('[E2E Tests] Environment check:', {
  SKIP_E2E_TESTS: process.env.SKIP_E2E_TESTS,
  RUN_E2E_TESTS: process.env.RUN_E2E_TESTS,
  CLAUDE_PATH: process.env.CLAUDE_PATH,
});
const SKIP_E2E = process.env.SKIP_E2E_TESTS === 'true' || process.env.RUN_E2E_TESTS !== 'true';
console.log('[E2E Tests] SKIP_E2E:', SKIP_E2E);
const CLAUDE_PATH = process.env.CLAUDE_PATH || 'claude';

/**
 * Check if Claude Code is available
 */
async function checkClaudeAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const check = spawn(CLAUDE_PATH, ['--version'], {
      stdio: 'ignore',
    });

    check.on('error', () => resolve(false));
    check.on('exit', (code) => resolve(code === 0));

    // Timeout after 5 seconds
    setTimeout(() => {
      check.kill();
      resolve(false);
    }, 5000);
  });
}

/**
 * Build Claude Code config for PTY (interactive/hybrid) modes
 */
function buildClaudePtyConfig(
  mode: 'interactive' | 'hybrid',
  prompt: string,
  terminalConfig: TerminalConfig = { cols: 80, rows: 24 }
): ProcessConfig {
  const baseConfig = buildClaudeConfig({
    workDir: process.cwd(),
    print: true,
    outputFormat: mode === 'hybrid' ? 'stream-json' : undefined,
    dangerouslySkipPermissions: true,
    prompt,
  });

  return {
    ...baseConfig,
    mode,
    terminal: terminalConfig,
  };
}

describe('Claude Code Execution Modes E2E', () => {
  let claudeAvailable = false;
  let simpleManager: SimpleProcessManager;
  let ptyManager: PtyProcessManager;

  beforeAll(async () => {
    if (SKIP_E2E) {
      console.log('⚠️  E2E tests are skipped (RUN_E2E_TESTS not set to "true")');
      return;
    }

    // Check if Claude is available before running any tests
    console.log('[E2E Tests] Checking Claude availability...');
    claudeAvailable = await checkClaudeAvailable();
    console.log('[E2E Tests] Claude available:', claudeAvailable);

    if (!claudeAvailable) {
      throw new Error(
        'Claude Code CLI not available. Install it or set CLAUDE_PATH environment variable.'
      );
    }

    console.log('✅ Claude Code is available - E2E tests will run');
  });

  beforeEach(() => {
    simpleManager = new SimpleProcessManager();
    ptyManager = new PtyProcessManager();
  });

  afterEach(async () => {
    // Clean up all processes
    await Promise.all([
      simpleManager.shutdown(),
      ptyManager.shutdown(),
    ]);

    // Force cleanup if needed
    const activeSimple = simpleManager.getActiveProcesses();
    for (const proc of activeSimple) {
      if (proc.status === 'busy' && proc.pid) {
        try {
          process.kill(proc.pid, 'SIGKILL');
        } catch (e) {
          // Process already dead
        }
      }
    }

    const activePty = ptyManager.getActiveProcesses();
    for (const proc of activePty) {
      if (proc.status === 'busy') {
        try {
          proc.ptyProcess.kill();
        } catch (e) {
          // Process already dead
        }
      }
    }
  });

  describe('Structured Mode (JSON Output)', () => {
    it('should execute Claude Code with stream-json output and parse events',
      { skip: SKIP_E2E, timeout: 180000 },
      async () => {
        // Build config for structured mode
        const config = buildClaudeConfig({
          workDir: process.cwd(),
          print: true,
          outputFormat: 'stream-json',
          dangerouslySkipPermissions: true,
          prompt: 'What is 2+2? Just say the number.',
        });

        // Spawn Claude Code process
        const managedProcess = await simpleManager.acquireProcess(config);
        expect(managedProcess.id).toBeTruthy();
        expect(managedProcess.pid).toBeTruthy();
        expect(managedProcess.status).toBe('busy');

        // Close stdin immediately - Claude Code with --print mode expects stdin to be closed
        simpleManager.closeInput(managedProcess.id);

        // Create output processor
        const processor = new ClaudeCodeOutputProcessor();

        // Track parsed events
        const toolCalls: any[] = [];
        const textMessages: any[] = [];

        processor.onToolCall((toolCall) => {
          console.log(`[Structured] Tool call: ${toolCall.name}`);
          toolCalls.push(toolCall);
        });

        // Process output line by line
        const outputLines: string[] = [];
        simpleManager.onOutput(managedProcess.id, async (data, type) => {
          if (type === 'stdout') {
            const text = data.toString();
            outputLines.push(text);

            // Process each line
            const lines = text.split('\n');
            for (const line of lines) {
              if (line.trim()) {
                await processor.processLine(line);
              }
            }
          }
        });

        // Wait for process to complete
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            const proc = simpleManager.getProcess(managedProcess.id);
            console.log(`[Structured] Process still running after 180s. Status: ${proc?.status}, PID: ${proc?.pid}`);
            console.log(`[Structured] Output lines received: ${outputLines.length}`);
            reject(new Error('Test timeout after 180 seconds'));
          }, 180000);

          let lastStatus = '';
          const checkInterval = setInterval(() => {
            const proc = simpleManager.getProcess(managedProcess.id);
            if (proc && proc.status !== lastStatus) {
              console.log(`[Structured] Process status changed: ${lastStatus} -> ${proc.status}`);
              lastStatus = proc.status;
            }
            if (proc && (proc.status === 'completed' || proc.status === 'crashed')) {
              console.log(`[Structured] Process completed with status: ${proc.status}, exit code: ${proc.exitCode}`);
              clearInterval(checkInterval);
              clearTimeout(timeout);
              resolve();
            }
          }, 100);
        });

        // Verify we processed output
        console.log(`[Structured] Received ${outputLines.length} output chunks`);
        expect(outputLines.length).toBeGreaterThan(0);

        // Verify processor tracked messages
        const metrics = processor.getMetrics();
        console.log(`[Structured] Processed ${metrics.totalMessages} messages`);
        expect(metrics.totalMessages).toBeGreaterThan(0);

        // Note: Simple math question doesn't generate tool calls, so we just verify
        // that the infrastructure works (process completes, output is captured, etc.)
        console.log(`[Structured] Tracked ${toolCalls.length} tool calls`);
        console.log(`[Structured] Token usage: ${metrics.usage.totalTokens} total`);
        expect(metrics.usage.totalTokens).toBeGreaterThan(0);
      }
    );
  });

  describe('Interactive Mode (Full Terminal)', () => {
    it('should execute Claude Code in PTY mode with terminal I/O',
      { skip: SKIP_E2E, timeout: 180000 },
      async () => {
        // Build config for interactive mode
        const config = buildClaudePtyConfig('interactive', 'What is 2+2? Just say the number.', { cols: 80, rows: 24 });

        // Spawn Claude Code in PTY
        const managedProcess = await ptyManager.acquireProcess(config);
        expect(managedProcess.id).toBeTruthy();
        expect(managedProcess.pid).toBeTruthy();
        expect(managedProcess.status).toBe('busy');

        // Collect terminal output
        const terminalOutput: string[] = [];
        let exitCode: number | null = null;

        managedProcess.onData((data) => {
          console.log(`[Interactive] Terminal data: ${data.substring(0, 100)}...`);
          terminalOutput.push(data);
        });

        managedProcess.onExit((code) => {
          console.log(`[Interactive] Process exited with code ${code}`);
          exitCode = code;
        });

        // Send EOF to signal end of input (Ctrl+D for PTY)
        console.log('[Interactive] Sending EOF to PTY process');
        managedProcess.write('\x04');

        // Wait for some output
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // Verify we received terminal output
        console.log(`[Interactive] Received ${terminalOutput.length} terminal chunks`);
        expect(terminalOutput.length).toBeGreaterThan(0);

        // Terminal output should contain ANSI codes or prompts
        const allOutput = terminalOutput.join('');
        console.log(`[Interactive] Total output length: ${allOutput.length} chars`);
        expect(allOutput.length).toBeGreaterThan(0);

        // Send input to terminal (simulating user typing)
        console.log('[Interactive] Sending exit command to terminal');
        managedProcess.write('exit\r');

        // Wait for process to exit
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Process did not exit after 10 seconds'));
          }, 10000);

          const checkInterval = setInterval(() => {
            if (exitCode !== null) {
              clearInterval(checkInterval);
              clearTimeout(timeout);
              resolve();
            }
          }, 100);
        });

        console.log(`[Interactive] Final exit code: ${exitCode}`);
        expect(exitCode).not.toBeNull();
      }
    );

    it('should handle terminal resize in PTY mode',
      { skip: SKIP_E2E, timeout: 30000 },
      async () => {
        const config = buildClaudePtyConfig('interactive', 'What is 2+2? Just say the number.', { cols: 80, rows: 24 });
        const managedProcess = await ptyManager.acquireProcess(config);

        let resizeSuccess = false;

        // Wait for process to be ready
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Attempt resize (should not throw)
        try {
          console.log('[Interactive] Resizing terminal from 80x24 to 120x40');
          managedProcess.resize(120, 40);
          resizeSuccess = true;
        } catch (error) {
          console.error('[Interactive] Resize failed:', error);
        }

        expect(resizeSuccess).toBe(true);

        // Cleanup
        managedProcess.write('exit\r');
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    );
  });

  describe('Hybrid Mode (Terminal + JSON Parsing)', () => {
    it('should execute Claude Code with both terminal output and JSON parsing',
      { skip: SKIP_E2E, timeout: 180000 },
      async () => {
        // Build config for hybrid mode (PTY + stream-json)
        const config = buildClaudePtyConfig('hybrid', 'What is 2+2? Just say the number.', { cols: 80, rows: 24 });

        // Spawn Claude Code in PTY with hybrid mode
        const managedProcess = await ptyManager.acquireProcess(config);
        expect(managedProcess.id).toBeTruthy();
        expect(managedProcess.pid).toBeTruthy();

        // Create hybrid output processor
        const processor = new HybridOutputProcessor();

        // Track both terminal output and parsed events
        const terminalOutput: string[] = [];
        const toolCalls: any[] = [];

        processor.onToolCall((toolCall) => {
          console.log(`[Hybrid] Parsed tool call: ${toolCall.name}`);
          toolCalls.push(toolCall);
        });

        // Listen to terminal output
        managedProcess.onData((data) => {
          terminalOutput.push(data);

          // Also feed to hybrid processor for JSON extraction
          processor.processOutput(Buffer.from(data), 'stdout');
        });

        let exitCode: number | null = null;
        managedProcess.onExit((code) => {
          console.log(`[Hybrid] Process exited with code ${code}`);
          exitCode = code;
        });

        // Send EOF to PTY process
        console.log('[Hybrid] Sending EOF to PTY process');
        managedProcess.write('\x04');

        // Wait for some output
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // Verify we received terminal output
        console.log(`[Hybrid] Received ${terminalOutput.length} terminal chunks`);
        expect(terminalOutput.length).toBeGreaterThan(0);

        // Verify processor extracted and parsed JSON from terminal output
        const metrics = processor.getMetrics();
        console.log(`[Hybrid] Processor parsed ${metrics.totalMessages} JSON messages from terminal output`);

        // In hybrid mode, we should get BOTH:
        // 1. Raw terminal output (ANSI codes, prompts, etc.)
        const allTerminalOutput = terminalOutput.join('');
        expect(allTerminalOutput.length).toBeGreaterThan(0);
        console.log(`[Hybrid] Terminal output length: ${allTerminalOutput.length} chars`);

        // 2. Parsed JSON events (if any were emitted)
        // Note: Parsing might be 0 if Claude hasn't emitted JSON yet in this short window
        console.log(`[Hybrid] Parsed ${toolCalls.length} tool calls from JSON extraction`);

        // Verify hybrid processor can parse JSON from mixed output
        const testJson = '{"type":"assistant","message":{"content":"test"}}\n';
        processor.processOutput(Buffer.from(testJson), 'stdout');
        expect(processor.getMetrics().totalMessages).toBeGreaterThan(metrics.totalMessages);

        // Cleanup
        managedProcess.write('exit\r');
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            // Force kill if not exited
            try {
              managedProcess.ptyProcess.kill();
            } catch (e) {
              // Already dead
            }
            resolve();
          }, 10000);

          const checkInterval = setInterval(() => {
            if (exitCode !== null) {
              clearInterval(checkInterval);
              clearTimeout(timeout);
              resolve();
            }
          }, 100);
        });
      }
    );

    it('should extract JSON from mixed terminal output stream',
      { skip: SKIP_E2E, timeout: 180000 },
      async () => {
        const config = buildClaudePtyConfig('hybrid', 'What is 2+2? Just say the number.', { cols: 80, rows: 24 });
        const managedProcess = await ptyManager.acquireProcess(config);

        const processor = new HybridOutputProcessor();

        // Collect both raw output and parsed events
        const rawChunks: string[] = [];
        const parsedMessages: any[] = [];

        processor.onProgress((metrics) => {
          console.log(`[Hybrid] Progress: ${metrics.totalMessages} messages parsed`);
        });

        managedProcess.onData((data) => {
          rawChunks.push(data);

          // Feed to processor - it should extract JSON lines from mixed output
          processor.processOutput(Buffer.from(data), 'stdout');

          // Track current parsed count
          const currentCount = processor.getMetrics().totalMessages;
          if (currentCount > parsedMessages.length) {
            parsedMessages.push({ count: currentCount });
          }
        });

        // Send EOF to PTY process
        console.log('[Hybrid] Sending EOF to PTY process');
        managedProcess.write('\x04');

        // Wait for some activity
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // Verify we got raw terminal output
        console.log(`[Hybrid] Raw terminal chunks: ${rawChunks.length}`);
        expect(rawChunks.length).toBeGreaterThan(0);

        // Test JSON extraction with mixed content
        const mixedOutput = Buffer.from(
          'Terminal prompt> \n' +
          '{"type":"assistant","message":{"content":"Starting task"}}\n' +
          'Processing...\n' +
          '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"test","name":"Bash","input":{"command":"echo test"}}]}}\n' +
          'Done!\n'
        );

        const initialMessages = processor.getMetrics().totalMessages;
        processor.processOutput(mixedOutput, 'stdout');

        // Should have extracted 2 JSON lines from mixed output
        const finalMessages = processor.getMetrics().totalMessages;
        console.log(`[Hybrid] Extracted ${finalMessages - initialMessages} JSON lines from mixed content`);
        expect(finalMessages).toBeGreaterThan(initialMessages);

        // Cleanup
        managedProcess.write('exit\r');
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    );
  });

  describe('Mode Comparison', () => {
    it('should demonstrate output differences across all three modes',
      { skip: SKIP_E2E, timeout: 240000 },
      async () => {
        console.log('\n=== Mode Comparison Test ===\n');

        // 1. Structured Mode
        console.log('[Comparison] Testing STRUCTURED mode...');
        const structuredConfig = buildClaudeConfig({
          workDir: process.cwd(),
          print: true,
          outputFormat: 'stream-json',
          dangerouslySkipPermissions: true,
        });

        const structuredProc = await simpleManager.acquireProcess(structuredConfig);
        const structuredProcessor = new ClaudeCodeOutputProcessor();

        const structuredLines: string[] = [];
        simpleManager.onOutput(structuredProc.id, (data) => {
          structuredLines.push(data.toString());
        });

        // Close stdin for structured mode
        console.log('[Comparison] Closing stdin for structured process');
        simpleManager.closeInput(structuredProc.id);

        await new Promise((resolve) => setTimeout(resolve, 5000));

        console.log(`[Structured] Output: JSON lines only, ${structuredLines.length} chunks`);
        console.log(`[Structured] Sample: ${structuredLines[0]?.substring(0, 100)}...`);

        // 2. Interactive Mode
        console.log('\n[Comparison] Testing INTERACTIVE mode...');
        const interactiveConfig = buildClaudePtyConfig('interactive', 'What is 2+2? Just say the number.');
        const interactiveProc = await ptyManager.acquireProcess(interactiveConfig);

        const interactiveOutput: string[] = [];
        interactiveProc.onData((data) => {
          interactiveOutput.push(data);
        });

        // Send EOF to PTY process
        console.log('[Comparison] Sending EOF to interactive PTY process');
        interactiveProc.write('\x04');

        await new Promise((resolve) => setTimeout(resolve, 5000));

        console.log(`[Interactive] Output: Raw terminal with ANSI, ${interactiveOutput.length} chunks`);
        console.log(`[Interactive] Sample: ${interactiveOutput[0]?.substring(0, 100)}...`);

        // 3. Hybrid Mode
        console.log('\n[Comparison] Testing HYBRID mode...');
        const hybridConfig = buildClaudePtyConfig('hybrid', 'What is 2+2? Just say the number.');
        const hybridProc = await ptyManager.acquireProcess(hybridConfig);
        const hybridProcessor = new HybridOutputProcessor();

        const hybridOutput: string[] = [];
        let hybridParsedCount = 0;

        hybridProc.onData((data) => {
          hybridOutput.push(data);
          hybridProcessor.processOutput(Buffer.from(data), 'stdout');
          hybridParsedCount = hybridProcessor.getMetrics().totalMessages;
        });

        // Send EOF to PTY process
        console.log('[Comparison] Sending EOF to hybrid PTY process');
        hybridProc.write('\x04');

        await new Promise((resolve) => setTimeout(resolve, 5000));

        console.log(`[Hybrid] Output: Terminal (${hybridOutput.length} chunks) + JSON extraction (${hybridParsedCount} messages)`);
        console.log(`[Hybrid] Sample terminal: ${hybridOutput[0]?.substring(0, 100)}...`);

        // Summary
        console.log('\n=== Summary ===');
        console.log(`Structured: Pure JSON lines for parsing`);
        console.log(`Interactive: Raw terminal with ANSI codes`);
        console.log(`Hybrid: Both terminal view AND JSON extraction`);
        console.log('===============\n');

        // Cleanup all
        interactiveProc.write('exit\r');
        hybridProc.write('exit\r');
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Verify all three modes worked
        expect(structuredLines.length).toBeGreaterThan(0);
        expect(interactiveOutput.length).toBeGreaterThan(0);
        expect(hybridOutput.length).toBeGreaterThan(0);
      }
    );
  });
});
