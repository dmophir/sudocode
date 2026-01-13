/**
 * DeployOrchestrator - Main deployment coordinator
 * 
 * Orchestrates the complete deployment workflow:
 * 1. Validates preconditions (GitHub auth, git context, Claude auth)
 * 2. Loads and merges configuration
 * 3. Creates provider and executes deployment
 * 4. Returns deployment information
 */

import { execSync } from 'child_process';
import chalk from 'chalk';
import { createProvider } from 'sudopod';
import type { DeployOptions, Deployment, DeploymentStatus, DeploymentUrls, Provider } from 'sudopod';
import type { DeployConfig } from '@sudocode-ai/types';
import { GitContextDetector } from './git-context.js';
import { ClaudeAuthIntegration } from './claude-auth.js';
import { DeployConfigManager } from './config.js';
import {
  AuthenticationError,
  GitContextError,
  ProviderError,
  NetworkError,
  DeploymentNotFoundError,
  PortConflictError,
  formatErrorMessage,
  isDeploymentNotFoundError
} from './errors.js';

export interface DeployCommandOptions {
  repo?: string;
  branch?: string;
  port?: number;
  idleTimeout?: number;
  keepAliveHours?: number;
  machine?: string;
  retentionPeriod?: number;
  dev?: boolean;
}

export class DeployOrchestrator {
  private configManager: DeployConfigManager;
  private provider: Provider;

  constructor(outputDir: string) {
    this.configManager = new DeployConfigManager(outputDir);
    this.provider = createProvider({ type: 'codespaces' });
  }

  /**
   * Execute the complete deployment workflow
   * 
   * @param options CLI flags to override config values
   * @returns Deployment information from the provider
   * @throws Error if any precondition fails or deployment fails
   */
  async deploy(options: DeployCommandOptions = {}): Promise<Deployment> {
    try {
      // Step 1: Check GitHub CLI authentication
      console.log(chalk.blue('Checking GitHub authentication...'));
      this.checkGitHubAuth();
      console.log(chalk.green('✓ GitHub authenticated\n'));

      // Step 2: Detect git context (owner/repo/branch)
      console.log(chalk.blue('Detecting git context...'));
      const gitContext = GitContextDetector.detectContext({
        repo: options.repo,
        branch: options.branch,
      });
      console.log(chalk.green(`✓ Detected: ${gitContext.owner}/${gitContext.repo} (${gitContext.branch})\n`));

      // Step 3: Ensure Claude authentication
      console.log(chalk.blue('Checking Claude authentication...'));
      await ClaudeAuthIntegration.ensureAuthenticated({ silent: true });
      const claudeToken = await ClaudeAuthIntegration.getToken();
      if (!claudeToken) {
        throw new Error('Claude authentication failed - no token available');
      }
      console.log(chalk.green('✓ Claude authenticated\n'));

      // Step 4: Load and merge configuration (CLI flags override config)
      console.log(chalk.blue('Loading deployment configuration...'));
      const config = this.configManager.loadConfig();
      const mergedConfig = this.mergeConfig(config, options);
      console.log(chalk.green(`✓ Configuration loaded (${mergedConfig.provider})\n`));

      // Step 5: Build deployment options
      const deployOptions: DeployOptions = {
        git: {
          owner: gitContext.owner,
          repo: gitContext.repo,
          branch: gitContext.branch,
        },
        dev: options.dev ?? false,
        agents: {
          install: ['claude'],
        },
        models: {
          claudeLtt: claudeToken,
        },
        sudocode: {
          mode: options.dev ? 'local' : 'npm',
          version: 'latest',
        },
        server: {
          port: mergedConfig.port,
          keepAliveHours: mergedConfig.keepAliveHours,
          idleTimeout: mergedConfig.idleTimeout,
        },
        providerOptions: {
          machine: mergedConfig.machine,
          retentionPeriod: mergedConfig.retentionPeriod,
        },
      };

      // Step 6: Deploy with progress indication
      console.log(chalk.blue('Deploying to GitHub Codespaces'));
      const progressInterval = setInterval(() => {
        process.stdout.write('.');
      }, 500);

      try {
        const deployment = await this.provider.deploy(deployOptions);
        clearInterval(progressInterval);
        process.stdout.write('\n');

        // Step 8: Show success message
        console.log(chalk.green('\n✓ Deployment successful!\n'));
        console.log(chalk.bold('Deployment Details:'));
        console.log(`  Name: ${deployment.name}`);
        console.log(`  Status: ${deployment.status}`);
        if (deployment.urls?.web) {
          console.log(chalk.cyan(`  Web URL: ${deployment.urls.web}`));
        }
        if (deployment.urls?.ssh) {
          console.log(`  SSH: ${deployment.urls.ssh}`);
        }
        console.log();

        return deployment;
      } catch (error: any) {
        clearInterval(progressInterval);
        process.stdout.write('\n');
        
        // Wrap provider errors
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
          throw new NetworkError(
            error.message || 'Network connection failed',
            'deployment',
            error
          );
        }
        
        if (error.message?.includes('port') && error.message?.includes('in use')) {
          const portMatch = error.message.match(/port (\d+)/i);
          const port = portMatch ? parseInt(portMatch[1], 10) : mergedConfig.port;
          throw new PortConflictError(port, error.message);
        }
        
        // Wrap as provider error
        throw new ProviderError(
          error.message || 'Deployment failed',
          mergedConfig.provider,
          error
        );
      }

    } catch (error: any) {
      // Use consistent error formatting
      const formattedError = formatErrorMessage(error);
      console.error(chalk.red(`\n${formattedError}\n`));
      throw error;
    }
  }

  /**
   * Check if GitHub CLI is installed and authenticated
   * @throws AuthenticationError if GitHub CLI is not authenticated
   */
  private checkGitHubAuth(): void {
    try {
      // Check if gh CLI is installed
      execSync('which gh', { stdio: 'pipe' });
    } catch (error) {
      throw new AuthenticationError(
        'GitHub CLI is not installed',
        'github',
        'Install it from: https://cli.github.com/'
      );
    }

    try {
      // Check authentication status
      execSync('gh auth status', { stdio: 'pipe' });
    } catch (error) {
      throw new AuthenticationError(
        'GitHub CLI is not authenticated',
        'github',
        'Run: gh auth login'
      );
    }
  }

  /**
   * Merge configuration with CLI options (CLI options take precedence)
   */
  private mergeConfig(config: DeployConfig, options: DeployCommandOptions): DeployConfig {
    return {
      provider: config.provider,
      defaultBranch: config.defaultBranch,
      port: options.port ?? config.port,
      idleTimeout: options.idleTimeout ?? config.idleTimeout,
      keepAliveHours: options.keepAliveHours ?? config.keepAliveHours,
      machine: options.machine ?? config.machine,
      retentionPeriod: options.retentionPeriod ?? config.retentionPeriod,
    };
  }

  /**
   * List all active deployments
   * 
   * @returns Array of deployment information
   * @throws ProviderError or NetworkError if listing fails
   */
  async list(): Promise<Deployment[]> {
    try {
      const deployments = await this.provider.list();
      return deployments;
    } catch (error: any) {
      // Check for network errors
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
        const networkError = new NetworkError(
          error.message || 'Network connection failed',
          'list deployments',
          error
        );
        const formattedError = formatErrorMessage(networkError);
        console.error(chalk.red(`\n${formattedError}\n`));
        throw networkError;
      }
      
      // Wrap as provider error
      const providerError = new ProviderError(
        `Failed to list deployments: ${error.message}`,
        'codespaces',
        error
      );
      const formattedError = formatErrorMessage(providerError);
      console.error(chalk.red(`\n${formattedError}\n`));
      throw providerError;
    }
  }

  /**
   * Get status and details of a specific deployment
   * 
   * @param id Deployment name or ID
   * @returns Deployment information including status and URLs
   * @throws DeploymentNotFoundError if deployment doesn't exist
   * @throws ProviderError or NetworkError if status check fails
   */
  async status(id: string): Promise<Deployment> {
    try {
      // Get deployment status
      const status = await this.provider.getStatus(id);
      
      // Get deployment URLs
      const urls = await this.provider.getUrls(id);
      
      // Find the deployment in the list to get full info
      const deployments = await this.provider.list();
      const deployment = deployments.find(d => d.id === id || d.name === id);
      
      if (!deployment) {
        throw new DeploymentNotFoundError(id);
      }
      
      // Return deployment with updated status and URLs
      return {
        ...deployment,
        status,
        urls,
      };
    } catch (error: any) {
      // Re-throw known error types
      if (isDeploymentNotFoundError(error)) {
        const formattedError = formatErrorMessage(error);
        console.error(chalk.red(`\n${formattedError}\n`));
        throw error;
      }
      
      // Check for not found in provider error message
      if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
        const notFoundError = new DeploymentNotFoundError(id);
        const formattedError = formatErrorMessage(notFoundError);
        console.error(chalk.red(`\n${formattedError}\n`));
        throw notFoundError;
      }
      
      // Check for network errors
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
        const networkError = new NetworkError(
          error.message || 'Network connection failed',
          'get deployment status',
          error
        );
        const formattedError = formatErrorMessage(networkError);
        console.error(chalk.red(`\n${formattedError}\n`));
        throw networkError;
      }
      
      // Wrap as provider error
      const providerError = new ProviderError(
        `Failed to get deployment status: ${error.message}`,
        'codespaces',
        error
      );
      const formattedError = formatErrorMessage(providerError);
      console.error(chalk.red(`\n${formattedError}\n`));
      throw providerError;
    }
  }

  /**
   * Stop and delete a deployment
   * 
   * @param id Deployment name or ID to stop
   * @throws DeploymentNotFoundError if deployment doesn't exist
   * @throws ProviderError or NetworkError if stop operation fails
   */
  async stop(id: string): Promise<void> {
    console.log(chalk.blue(`Stopping deployment '${id}'`));
    const progressInterval = setInterval(() => {
      process.stdout.write('.');
    }, 500);

    try {
      await this.provider.stop(id);
      clearInterval(progressInterval);
      process.stdout.write('\n');
      console.log(chalk.green(`✓ Deployment '${id}' stopped successfully`));
    } catch (error: any) {
      clearInterval(progressInterval);
      process.stdout.write('\n');
      
      // Re-throw known error types
      if (isDeploymentNotFoundError(error)) {
        const formattedError = formatErrorMessage(error);
        console.error(chalk.red(`\n${formattedError}\n`));
        throw error;
      }
      
      // Check for not found in provider error message
      if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
        const notFoundError = new DeploymentNotFoundError(id);
        const formattedError = formatErrorMessage(notFoundError);
        console.error(chalk.red(`\n${formattedError}\n`));
        throw notFoundError;
      }
      
      // Check for network errors
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
        const networkError = new NetworkError(
          error.message || 'Network connection failed',
          'stop deployment',
          error
        );
        const formattedError = formatErrorMessage(networkError);
        console.error(chalk.red(`\n${formattedError}\n`));
        throw networkError;
      }
      
      // Wrap as provider error
      const providerError = new ProviderError(
        `Failed to stop deployment: ${error.message}`,
        'codespaces',
        error
      );
      const formattedError = formatErrorMessage(providerError);
      console.error(chalk.red(`\n${formattedError}\n`));
      throw providerError;
    }
  }
}
