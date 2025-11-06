/**
 * Terminal WebSocket Service
 *
 * Manages WebSocket connections for interactive terminal sessions.
 * Each execution can have its own terminal WebSocket for PTY communication.
 *
 * @module services/terminal-websocket
 */

import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import * as url from 'url';
import type Database from 'better-sqlite3';
import { PtyProcessManager } from '../execution/process/pty-manager.js';
import { TerminalTransport } from '../execution/transport/terminal-transport.js';
import { buildClaudeConfig } from '../execution/process/builders/claude.js';
import { getExecution } from '../services/executions.js';

/**
 * Active terminal session
 */
interface TerminalSession {
  executionId: string;
  processManager: PtyProcessManager;
  transport: TerminalTransport;
  processId: string;
  createdAt: Date;
}

/**
 * Terminal WebSocket Manager
 *
 * Manages WebSocket connections for terminal access to executions.
 * Each execution can have one active terminal session.
 */
class TerminalWebSocketManager {
  private wss: WebSocketServer | null = null;
  private sessions = new Map<string, TerminalSession>();
  private db: Database.Database | null = null;
  private repoPath: string = '';

  /**
   * Initialize the terminal WebSocket server
   *
   * @param server - HTTP server to attach to
   * @param db - Database instance
   * @param repoPath - Repository root path
   * @param path - WebSocket path (default: /ws/terminal)
   */
  init(
    server: http.Server,
    db: Database.Database,
    repoPath: string,
    path: string = '/ws/terminal'
  ): void {
    if (this.wss) {
      console.warn('[terminal-ws] Terminal WebSocket server already initialized');
      return;
    }

    this.db = db;
    this.repoPath = repoPath;

    this.wss = new WebSocketServer({
      server,
      path,
      // Enable path matching for :executionId parameter
      noServer: true
    });

    // We need to handle upgrade manually to support path parameters
    server.on('upgrade', (request, socket, head) => {
      const pathname = request.url ? url.parse(request.url).pathname : null;

      // Check if this is a terminal WebSocket request
      if (pathname && pathname.startsWith('/ws/terminal/')) {
        const executionId = pathname.split('/')[3];

        if (!executionId) {
          socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
          socket.destroy();
          return;
        }

        // Handle the WebSocket upgrade
        this.wss!.handleUpgrade(request, socket, head, (ws) => {
          this.handleConnection(ws, executionId);
        });
      }
    });

    console.log(`[terminal-ws] Terminal WebSocket server initialized on path: ${path}`);
  }

  /**
   * Handle new terminal WebSocket connection
   *
   * @param ws - WebSocket connection
   * @param executionId - Execution ID to connect to
   */
  private async handleConnection(ws: WebSocket, executionId: string): Promise<void> {
    try {
      // Verify execution exists
      if (!this.db) {
        this.closeWithError(ws, 'Server not initialized');
        return;
      }

      const execution = await getExecution(this.db, executionId);
      if (!execution) {
        this.closeWithError(ws, 'Execution not found');
        return;
      }

      // TODO: Add authentication/authorization check here
      // Verify user owns execution

      // Close existing session if any
      const existingSession = this.sessions.get(executionId);
      if (existingSession) {
        console.log(`[terminal-ws] Closing existing session for execution: ${executionId}`);
        existingSession.transport.closeAndTerminate();
        await existingSession.processManager.shutdown();
        this.sessions.delete(executionId);
      }

      // Create new PTY process manager
      const processManager = new PtyProcessManager();

      // Build process config for interactive mode
      const workDir = execution.worktree_path || this.repoPath;
      const processConfig = buildClaudeConfig({
        workDir,
        print: false, // Interactive mode - no --print flag
        outputFormat: undefined, // No structured output
        verbose: false,
        terminal: {
          cols: 80,
          rows: 24,
        },
      });

      // Override mode to interactive
      processConfig.mode = 'interactive';

      console.log(`[terminal-ws] Starting terminal for execution: ${executionId}`);

      // Spawn PTY process
      const ptyProcess = await processManager.acquireProcess(processConfig);

      // Create transport to bridge WebSocket and PTY
      const transport = new TerminalTransport(ws, ptyProcess);

      // Store session
      const session: TerminalSession = {
        executionId,
        processManager,
        transport,
        processId: ptyProcess.id,
        createdAt: new Date(),
      };
      this.sessions.set(executionId, session);

      console.log(`[terminal-ws] Terminal session created for execution: ${executionId}`);

      // Clean up on disconnect
      ws.on('close', () => {
        this.cleanupSession(executionId);
      });

      // Handle process exit
      ptyProcess.onExit((exitCode) => {
        console.log(`[terminal-ws] Process exited with code ${exitCode} for execution: ${executionId}`);
        // Session will be cleaned up on WebSocket close
      });

    } catch (error) {
      console.error('[terminal-ws] Failed to create terminal session:', error);
      this.closeWithError(ws, 'Failed to create terminal session');
    }
  }

  /**
   * Close WebSocket with error message
   *
   * @param ws - WebSocket connection
   * @param error - Error message
   */
  private closeWithError(ws: WebSocket, error: string): void {
    try {
      ws.send(JSON.stringify({
        type: 'terminal:error',
        error,
      }));
    } catch (e) {
      console.error('[terminal-ws] Failed to send error message:', e);
    }
    ws.close(1011, error);
  }

  /**
   * Clean up a terminal session
   *
   * @param executionId - Execution ID
   */
  private async cleanupSession(executionId: string): Promise<void> {
    const session = this.sessions.get(executionId);
    if (!session) {
      return;
    }

    console.log(`[terminal-ws] Cleaning up session for execution: ${executionId}`);

    try {
      session.transport.close();
      await session.processManager.shutdown();
    } catch (error) {
      console.error(`[terminal-ws] Error cleaning up session for ${executionId}:`, error);
    }

    this.sessions.delete(executionId);
  }

  /**
   * Get active session count
   *
   * @returns Number of active sessions
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get session info for an execution
   *
   * @param executionId - Execution ID
   * @returns Session info or null if not found
   */
  getSessionInfo(executionId: string): { createdAt: Date; processId: string } | null {
    const session = this.sessions.get(executionId);
    if (!session) {
      return null;
    }

    return {
      createdAt: session.createdAt,
      processId: session.processId,
    };
  }

  /**
   * Gracefully shutdown the terminal WebSocket server
   */
  async shutdown(): Promise<void> {
    console.log('[terminal-ws] Shutting down terminal WebSocket server...');

    // Clean up all sessions
    const sessionIds = Array.from(this.sessions.keys());
    await Promise.all(sessionIds.map((id) => this.cleanupSession(id)));

    // Close the WebSocket server
    if (this.wss) {
      return new Promise((resolve) => {
        this.wss!.close(() => {
          console.log('[terminal-ws] Terminal WebSocket server closed');
          this.wss = null;
          resolve();
        });
      });
    }
  }
}

// Export singleton instance
export const terminalWebSocketManager = new TerminalWebSocketManager();

/**
 * Initialize the terminal WebSocket server
 *
 * @param server - HTTP server
 * @param db - Database instance
 * @param repoPath - Repository root path
 * @param path - WebSocket path (optional)
 */
export function initTerminalWebSocketServer(
  server: http.Server,
  db: Database.Database,
  repoPath: string,
  path?: string
): void {
  terminalWebSocketManager.init(server, db, repoPath, path);
}

/**
 * Shutdown the terminal WebSocket server
 */
export async function shutdownTerminalWebSocketServer(): Promise<void> {
  await terminalWebSocketManager.shutdown();
}

/**
 * Get active terminal session count
 */
export function getActiveTerminalSessionCount(): number {
  return terminalWebSocketManager.getActiveSessionCount();
}

/**
 * Get terminal session info for an execution
 */
export function getTerminalSessionInfo(executionId: string) {
  return terminalWebSocketManager.getSessionInfo(executionId);
}
