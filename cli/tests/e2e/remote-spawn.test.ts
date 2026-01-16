/**
 * End-to-End test for remote spawn command
 *
 * This is a TRUE e2e test that:
 * - Actually creates a GitHub Codespace
 * - Uses real sudopod (no mocks)
 * - Requires real authentication (gh + Claude)
 * - Cleans up resources after completion
 *
 * Prerequisites:
 * - gh CLI must be installed
 * - gh must be authenticated (gh auth login)
 * - sudocode auth claude must be configured
 * - Must be run in a git repository
 *
 * Run with: RUN_SLOW_TESTS=true npm --prefix cli test -- tests/e2e/remote-spawn.test.ts
 *
 * Note: This test is SLOW (~2-5 minutes) and creates real cloud resources.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { SpawnOrchestrator } from '../../src/remote/orchestrator.js';
import { getClaudeToken } from '../../src/auth/credentials.js';
import type { DeploymentInfo } from '../../src/remote/types.js';

const SKIP_SLOW_TESTS = process.env.RUN_SLOW_TESTS !== 'true';

describe.skipIf(SKIP_SLOW_TESTS)('Remote Spawn E2E', () => {
  let orchestrator: SpawnOrchestrator;
  let deployment: DeploymentInfo | null = null;

  beforeAll(async () => {
    // Verify prerequisites
    console.log('Checking prerequisites...');

    // 1. Check gh CLI is installed
    try {
      execSync('gh --version', { stdio: 'ignore' });
      console.log('✓ gh CLI is installed');
    } catch (error) {
      throw new Error(
        'gh CLI is not installed. Install it with: brew install gh (macOS) or see https://cli.github.com'
      );
    }

    // 2. Check gh is authenticated
    try {
      execSync('gh auth status', { stdio: 'ignore' });
      console.log('✓ gh is authenticated');
    } catch (error) {
      throw new Error(
        'gh CLI is not authenticated. Run: gh auth login'
      );
    }

    // 3. Check Claude authentication
    const claudeToken = await getClaudeToken();
    if (!claudeToken) {
      throw new Error(
        'Claude authentication not configured. Run: sudocode auth claude'
      );
    }
    console.log('✓ Claude is authenticated');

    // 4. Check we're in a git repository
    try {
      execSync('git rev-parse --git-dir', { stdio: 'ignore' });
      console.log('✓ Running in a git repository');
    } catch (error) {
      throw new Error(
        'Not in a git repository. This test must be run from a git repository.'
      );
    }

    // Initialize orchestrator
    orchestrator = new SpawnOrchestrator('.sudocode');
    console.log('Prerequisites verified. Starting e2e test...\n');
  }, 30000); // 30 second timeout for prerequisites

  afterAll(async () => {
    // Cleanup: Delete the codespace if it was created
    if (deployment) {
      console.log(`\nCleaning up codespace: ${deployment.id}`);
      try {
        await orchestrator.stop('codespaces', deployment.id);
        console.log('✓ Codespace deleted successfully');
      } catch (error) {
        console.error('Failed to delete codespace:', error);
        console.error('You may need to manually delete it with:');
        console.error(`  gh codespace delete --codespace ${deployment.id}`);
      }
    }
  }, 60000); // 60 second timeout for cleanup

  it(
    'should spawn a codespace, verify it, and clean up',
    async () => {
      // Step 1: Spawn the codespace
      console.log('Step 1: Spawning codespace...');
      deployment = await orchestrator.spawn({
        noOpen: true, // Don't open browser in CI
      });

      expect(deployment).toBeDefined();
      expect(deployment.id).toBeDefined();
      expect(deployment.provider).toBe('codespaces');
      expect(deployment.status).toBe('running');
      expect(deployment.urls).toBeDefined();
      expect(deployment.urls.workspace).toMatch(/^https:\/\//);
      expect(deployment.urls.sudocode).toMatch(/^https:\/\//);

      console.log(`✓ Codespace spawned: ${deployment.id}`);
      console.log(`  Workspace: ${deployment.urls.workspace}`);
      console.log(`  Sudocode UI: ${deployment.urls.sudocode}`);

      // Step 2: List deployments and verify ours is there
      console.log('\nStep 2: Listing deployments...');
      const deployments = await orchestrator.list('codespaces');

      expect(deployments).toBeInstanceOf(Array);
      const ourDeployment = deployments.find((d) => d.id === deployment!.id);
      expect(ourDeployment).toBeDefined();
      expect(ourDeployment!.status).toBe('running');

      console.log(`✓ Found deployment in list (${deployments.length} total)`);

      // Step 3: Get status and verify details
      console.log('\nStep 3: Checking deployment status...');
      const status = await orchestrator.status('codespaces', deployment.id);

      expect(status).toBeDefined();
      expect(status.id ?? status.name).toBe(deployment.id);
      expect(['running', 'starting', 'provisioning']).toContain(status.status);
      expect(status.git).toBeDefined();
      expect(status.git.owner).toBeDefined();
      expect(status.git.repo).toBeDefined();
      // Note: sudopod doesn't return branch in git info from list()

      console.log(`✓ Status verified`);
      console.log(`  Repository: ${status.git.owner}/${status.git.repo}`);

      // Step 4: Stop the codespace
      console.log('\nStep 4: Stopping codespace...');
      await orchestrator.stop('codespaces', deployment.id);

      console.log(`✓ Codespace stopped: ${deployment.id}`);

      // Clear deployment so afterAll doesn't try to delete it again
      deployment = null;

      // Step 5: Verify it's gone from the list
      console.log('\nStep 5: Verifying deletion...');
      const deploymentsAfter = await orchestrator.list('codespaces');
      const deletedDeployment = deploymentsAfter.find((d) => d.id === status.id);
      expect(deletedDeployment).toBeUndefined();

      console.log('✓ Codespace successfully deleted');
      console.log('\n✓ E2E test completed successfully!');
    },
    5 * 60 * 1000 // 5 minute timeout (spawning can take 2-3 minutes)
  );
});
