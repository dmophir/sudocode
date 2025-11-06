/**
 * TerminalView Component
 *
 * Interactive terminal view using xterm.js for real-time CLI interaction.
 * Connects to backend PTY process via WebSocket.
 */

import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle } from 'lucide-react';

export interface TerminalViewProps {
  /** Execution ID */
  executionId: string;

  /** WebSocket URL (optional, will be constructed from executionId if not provided) */
  wsUrl?: string;

  /** Read-only mode (no user input) */
  readonly?: boolean;

  /** Custom class name */
  className?: string;
}

export function TerminalView({
  executionId,
  wsUrl: wsUrlProp,
  readonly = false,
  className = '',
}: TerminalViewProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Construct WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = wsUrlProp || `${protocol}//${window.location.host}/ws/terminal/${executionId}`;

    // Initialize xterm.js
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5',
      },
      convertEol: true,
      disableStdin: readonly,
    });

    // Add addons
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    // Open terminal
    terminal.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Connect to WebSocket
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      setError(null);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case 'terminal:data':
            terminal.write(msg.data);
            break;

          case 'terminal:exit':
            terminal.write(`\r\n\r\n\x1b[1;33m[Process exited with code ${msg.exitCode}]\x1b[0m\r\n`);
            setStatus('disconnected');
            break;

          case 'terminal:error':
            setError(msg.error || 'Terminal error occurred');
            setStatus('error');
            break;

          default:
            console.warn('Unknown terminal message type:', msg.type);
        }
      } catch (err) {
        console.error('Failed to parse terminal message:', err);
      }
    };

    ws.onerror = (event) => {
      console.error('WebSocket error:', event);
      setStatus('error');
      setError('Connection error occurred');
    };

    ws.onclose = () => {
      if (status !== 'disconnected') {
        setStatus('disconnected');
        terminal.write('\r\n\r\n\x1b[1;31m[Connection closed]\x1b[0m\r\n');
      }
    };

    // Send user input to server
    if (!readonly) {
      terminal.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'terminal:input',
            data,
          }));
        }
      });
    }

    // Handle terminal resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'terminal:resize',
          cols: terminal.cols,
          rows: terminal.rows,
        }));
      }
    });

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    // Cleanup
    return () => {
      resizeObserver.disconnect();
      ws.close();
      terminal.dispose();
    };
  }, [executionId, wsUrlProp, readonly, status]);

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Status indicator */}
      {status === 'connecting' && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertDescription>Connecting to terminal...</AlertDescription>
        </Alert>
      )}

      {status === 'error' && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error || 'Failed to connect to terminal'}</AlertDescription>
        </Alert>
      )}

      {/* Terminal */}
      <Card className="p-0 overflow-hidden">
        <div
          ref={terminalRef}
          className="h-full w-full bg-[#1e1e1e] p-2"
          style={{ minHeight: '400px' }}
        />
      </Card>
    </div>
  );
}
