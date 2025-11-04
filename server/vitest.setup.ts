import { afterAll } from 'vitest';

/**
 * Global cleanup to catch any orphaned child processes
 * This runs after all tests in this worker complete
 */
afterAll(async () => {
  try {
    // Get this worker's PID
    const workerPid = process.pid;

    // Kill all child processes of this worker
    // Uses SIGTERM first (graceful shutdown)
    const { execSync } = await import('child_process');
    execSync(`pkill -P ${workerPid} || true`, { stdio: 'ignore' });

    // Wait a bit for graceful shutdown
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Force kill any stragglers with SIGKILL
    execSync(`pkill -9 -P ${workerPid} || true`, { stdio: 'ignore' });
  } catch (e) {
    // Ignore errors - this is best-effort cleanup
    // Tests may run on systems without pkill
  }
});
