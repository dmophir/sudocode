/**
 * Test script to verify node-pty installation and compatibility
 *
 * Run with: npx tsx server/test-node-pty.ts
 */

import * as pty from 'node-pty';

console.log('Testing node-pty installation...\n');

const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';

console.log(`Platform: ${process.platform}`);
console.log(`Spawning shell: ${shell}\n`);

try {
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 30,
    cwd: process.cwd(),
    env: process.env as any
  });

  console.log(`✓ PTY spawned successfully (PID: ${ptyProcess.pid})\n`);

  let output = '';

  ptyProcess.onData((data) => {
    output += data;
    process.stdout.write(data);
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    console.log(`\n✓ PTY exited with code: ${exitCode}, signal: ${signal}`);

    if (output.includes('Hello from PTY')) {
      console.log('✓ PTY I/O working correctly');
      console.log('\n✅ node-pty is properly installed and functional!\n');
      process.exit(0);
    } else {
      console.log('✗ PTY output did not contain expected text');
      console.log('Output received:', output);
      process.exit(1);
    }
  });

  // Send test command
  setTimeout(() => {
    console.log('Sending test command...\n');
    ptyProcess.write('echo "Hello from PTY"\r');

    // Exit shell after a delay
    setTimeout(() => {
      ptyProcess.write('exit\r');
    }, 500);
  }, 100);

} catch (error) {
  console.error('✗ Failed to spawn PTY process:', error);
  process.exit(1);
}
