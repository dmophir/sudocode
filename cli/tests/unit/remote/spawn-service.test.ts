import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemoteSpawnService } from '../../../src/remote/spawn-service.js';
import type { DeploymentInfo } from '../../../src/remote/spawn-service.js';

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn(),
  exec: vi.fn(),
  spawn: vi.fn(),
}));

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(() => JSON.stringify({
    version: '0.1.0',
    providers: {
      codespaces: {
        port: 3000,
        idleTimeout: 4320,
        keepAliveHours: 72,
        machine: 'basicLinux32gb',
        retentionPeriod: 14,
      },
    },
  })),
  writeFileSync: vi.fn(),
}));

// Mock sudopod module
vi.mock('sudopod', () => ({
  createProvider: vi.fn(),
}));

// Mock credentials module
vi.mock('../../../src/auth/credentials.js', () => ({
  getClaudeToken: vi.fn(),
  hasClaudeToken: vi.fn(),
  setClaudeToken: vi.fn(),
}));

// Mock claude auth module
vi.mock('../../../src/auth/claude.js', () => ({
  handleClaudeAuth: vi.fn(),
}));

// Mock fs to prevent real filesystem writes
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false), // Config file doesn't exist
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

describe('RemoteSpawnService', () => {
  let spawnService: RemoteSpawnService;
  const mockSudocodeDir = '/test/.sudocode';
  let execSyncMock: any;

  beforeEach(async () => {
    spawnService = new RemoteSpawnService(mockSudocodeDir);
    
    // Setup execSync mock
    const childProcess = await import('child_process');
    execSyncMock = childProcess.execSync as any;
    execSyncMock.mockReset();
    
    vi.clearAllMocks();
  });

  describe('list()', () => {
    it('should return array of deployments from provider', async () => {
      const mockDeployments: DeploymentInfo[] = [
        {
          id: 'codespace-abc123',
          name: 'test-deployment',
          provider: 'codespaces',
          git: {
            owner: 'owner',
            repo: 'repo',
            branch: 'main',
          },
          status: 'running',
          createdAt: '2026-01-14T10:00:00Z',
          urls: {
            workspace: 'https://codespace-abc123.github.dev',
            sudocode: 'https://codespace-abc123-3000.app.github.dev',
            ssh: 'gh codespace ssh --codespace codespace-abc123',
          },
          keepAliveHours: 72,
          idleTimeout: 4320,
        },
      ];

      const mockProvider = {
        list: vi.fn().mockResolvedValue(mockDeployments),
      };

      const { createProvider } = await import('sudopod');
      vi.mocked(createProvider).mockReturnValue(mockProvider as any);

      const result = await spawnService.list('codespaces');

      expect(result).toEqual(mockDeployments);
      expect(createProvider).toHaveBeenCalledWith({ type: 'codespaces' });
      expect(mockProvider.list).toHaveBeenCalled();
    });

    it('should return empty array when no deployments exist', async () => {
      const mockProvider = {
        list: vi.fn().mockResolvedValue([]),
      };

      const { createProvider } = await import('sudopod');
      vi.mocked(createProvider).mockReturnValue(mockProvider as any);

      const result = await spawnService.list('codespaces');

      expect(result).toEqual([]);
      expect(mockProvider.list).toHaveBeenCalled();
    });

    it('should throw error for unsupported provider', async () => {
      await expect(spawnService.list('invalid' as any)).rejects.toThrow(
        "Unknown provider 'invalid'"
      );
    });

    it('should throw error for coder provider (not yet supported)', async () => {
      await expect(spawnService.list('coder')).rejects.toThrow(
        "Provider 'coder' is not yet supported"
      );
    });
  });

  describe('status()', () => {
    it('should return deployment info for valid deployment id', async () => {
      const mockDeployment: DeploymentInfo = {
        id: 'codespace-abc123',
        name: 'test-deployment',
        provider: 'codespaces',
        git: {
          owner: 'owner',
          repo: 'repo',
          branch: 'main',
        },
        status: 'running',
        createdAt: '2026-01-14T10:00:00Z',
        urls: {
          workspace: 'https://codespace-abc123.github.dev',
          sudocode: 'https://codespace-abc123-3000.app.github.dev',
          ssh: 'gh codespace ssh --codespace codespace-abc123',
        },
        keepAliveHours: 72,
        idleTimeout: 4320,
      };

      const mockProvider = {
        list: vi.fn().mockResolvedValue([mockDeployment]),
      };

      const { createProvider } = await import('sudopod');
      vi.mocked(createProvider).mockReturnValue(mockProvider as any);

      const result = await spawnService.status('codespaces', 'codespace-abc123');

      expect(result).toEqual(mockDeployment);
      expect(createProvider).toHaveBeenCalledWith({ type: 'codespaces' });
      expect(mockProvider.list).toHaveBeenCalled();
    });

    it('should throw error when deployment not found', async () => {
      const mockProvider = {
        list: vi.fn().mockResolvedValue([]),
      };

      const { createProvider } = await import('sudopod');
      vi.mocked(createProvider).mockReturnValue(mockProvider as any);

      await expect(
        spawnService.status('codespaces', 'nonexistent-id')
      ).rejects.toThrow('Deployment not found: nonexistent-id');
    });

    it('should throw error for unsupported provider', async () => {
      await expect(
        spawnService.status('invalid' as any, 'some-id')
      ).rejects.toThrow("Unknown provider 'invalid'");
    });

    it('should throw error for coder provider (not yet supported)', async () => {
      await expect(
        spawnService.status('coder', 'some-id')
      ).rejects.toThrow("Provider 'coder' is not yet supported");
    });
  });

  describe('stop()', () => {
    it('should successfully stop a deployment', async () => {
      const mockProvider = {
        stop: vi.fn().mockResolvedValue(undefined),
      };

      const { createProvider } = await import('sudopod');
      vi.mocked(createProvider).mockReturnValue(mockProvider as any);

      await spawnService.stop('codespaces', 'codespace-abc123');

      expect(createProvider).toHaveBeenCalledWith({ type: 'codespaces' });
      expect(mockProvider.stop).toHaveBeenCalledWith('codespace-abc123');
    });

    it('should propagate error when deployment not found', async () => {
      const mockProvider = {
        stop: vi.fn().mockRejectedValue(new Error('Deployment not found')),
      };

      const { createProvider } = await import('sudopod');
      vi.mocked(createProvider).mockReturnValue(mockProvider as any);

      await expect(
        spawnService.stop('codespaces', 'nonexistent-id')
      ).rejects.toThrow('Deployment not found');
    });

    it('should throw error for unsupported provider', async () => {
      await expect(
        spawnService.stop('invalid' as any, 'some-id')
      ).rejects.toThrow("Unknown provider 'invalid'");
    });

    it('should throw error for coder provider (not yet supported)', async () => {
      await expect(
        spawnService.stop('coder', 'some-id')
      ).rejects.toThrow("Provider 'coder' is not yet supported");
    });
  });

  describe('validateProvider()', () => {
    it('should not throw for codespaces provider', async () => {
      const mockProvider = {
        list: vi.fn().mockResolvedValue([]),
      };

      const { createProvider } = await import('sudopod');
      vi.mocked(createProvider).mockReturnValue(mockProvider as any);

      // Should not throw
      await expect(spawnService.list('codespaces')).resolves.toBeDefined();
    });

    it('should throw error for unknown provider', async () => {
      await expect(spawnService.list('unknown' as any)).rejects.toThrow(
        "Unknown provider 'unknown'"
      );
    });

    it('should throw error for coder provider with specific message', async () => {
      await expect(spawnService.list('coder')).rejects.toThrow(
        "Provider 'coder' is not yet supported"
      );
    });

    it('should include supported providers in error message', async () => {
      try {
        await spawnService.list('invalid' as any);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('codespaces');
        expect((error as Error).message).toContain('coder');
      }
    });
  });

  describe('spawn()', () => {
    it('should orchestrate full spawn workflow', async () => {
      // Mock GitHub auth check
      execSyncMock.mockImplementation((cmd: string) => {
        if (cmd === 'gh auth status') {
          return ''; // Authenticated
        }
        if (cmd.includes('git rev-parse --git-dir')) {
          return '.git';
        }
        if (cmd.includes('git rev-parse --abbrev-ref HEAD')) {
          return 'main';
        }
        if (cmd.includes('git remote get-url origin')) {
          return 'https://github.com/owner/repo.git';
        }
        throw new Error(`Unexpected command: ${cmd}`);
      });

      // Mock Claude auth
      const credentials = await import('../../../src/auth/credentials.js');
      vi.mocked(credentials.getClaudeToken).mockResolvedValue('test-token-123');

      // Mock sudopod deployment
      const mockDeployment: DeploymentInfo = {
        id: 'codespace-abc123',
        name: 'codespace-abc123',
        provider: 'codespaces',
        git: {
          owner: 'owner',
          repo: 'repo',
          branch: 'main',
        },
        status: 'running',
        createdAt: new Date().toISOString(),
        urls: {
          workspace: 'https://codespace-abc123.github.dev',
          sudocode: 'https://codespace-abc123-3000.app.github.dev',
          ssh: 'gh codespace ssh --codespace codespace-abc123',
        },
        keepAliveHours: 72,
        idleTimeout: 4320,
        machine: 'basicLinux32gb',
        retentionPeriod: 14,
      };

      const mockProvider = {
        deploy: vi.fn().mockResolvedValue(mockDeployment),
      };

      const { createProvider } = await import('sudopod');
      vi.mocked(createProvider).mockReturnValue(mockProvider as any);

      const result = await spawnService.spawn({ noOpen: true });

      // Verify GitHub auth was checked
      expect(execSyncMock).toHaveBeenCalledWith('gh auth status', { stdio: 'ignore' });

      // Verify git context was detected
      expect(execSyncMock).toHaveBeenCalledWith(
        expect.stringContaining('git rev-parse --abbrev-ref HEAD'),
        expect.any(Object)
      );

      // Verify Claude token was retrieved
      expect(credentials.getClaudeToken).toHaveBeenCalled();

      // Verify sudopod was called with correct config
      expect(mockProvider.deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          git: {
            owner: 'owner',
            repo: 'repo',
            branch: 'main',
          },
          server: {
            port: 3000,
            idleTimeout: 4320,
            keepAliveHours: 72,
          },
          providerOptions: {
            machine: 'basicLinux32gb',
            retentionPeriod: 14,
          },
          agents: {
            install: ['claude'],
          },
          models: {
            claudeLtt: 'test-token-123',
          },
        })
      );

      expect(result).toEqual(mockDeployment);
    });

    it('should throw error if GitHub CLI not authenticated', async () => {
      execSyncMock.mockImplementation((cmd: string) => {
        if (cmd === 'gh auth status') {
          throw new Error('Not authenticated');
        }
        throw new Error(`Unexpected command: ${cmd}`);
      });

      await expect(spawnService.spawn({})).rejects.toThrow(
        'GitHub CLI is not authenticated'
      );
    });

    it('should throw error if not in git repository', async () => {
      execSyncMock.mockImplementation((cmd: string) => {
        if (cmd === 'gh auth status') {
          return ''; // Authenticated
        }
        if (cmd.includes('git rev-parse --git-dir')) {
          throw new Error('Not a git repository');
        }
        throw new Error(`Unexpected command: ${cmd}`);
      });

      await expect(spawnService.spawn({})).rejects.toThrow(
        'Not in a git repository'
      );
    });

    it('should throw error if Claude authentication fails', async () => {
      // Mock GitHub auth check
      execSyncMock.mockImplementation((cmd: string) => {
        if (cmd === 'gh auth status') {
          return ''; // Authenticated
        }
        if (cmd.includes('git rev-parse --git-dir')) {
          return '.git';
        }
        if (cmd.includes('git rev-parse --abbrev-ref HEAD')) {
          return 'main';
        }
        if (cmd.includes('git remote get-url origin')) {
          return 'https://github.com/owner/repo.git';
        }
        throw new Error(`Unexpected command: ${cmd}`);
      });

      // Mock Claude auth failure
      const credentials = await import('../../../src/auth/credentials.js');
      vi.mocked(credentials.getClaudeToken).mockResolvedValue(null);

      await expect(spawnService.spawn({})).rejects.toThrow(
        'Claude authentication failed'
      );
    });

    it('should merge CLI options with defaults', async () => {
      // Mock GitHub auth check
      execSyncMock.mockImplementation((cmd: string) => {
        if (cmd === 'gh auth status') {
          return ''; // Authenticated
        }
        if (cmd.includes('git rev-parse --git-dir')) {
          return '.git';
        }
        if (cmd.includes('git rev-parse --abbrev-ref HEAD')) {
          return 'main';
        }
        if (cmd.includes('git remote get-url origin')) {
          return 'https://github.com/owner/repo.git';
        }
        throw new Error(`Unexpected command: ${cmd}`);
      });

      // Mock Claude auth
      const credentials = await import('../../../src/auth/credentials.js');
      vi.mocked(credentials.getClaudeToken).mockResolvedValue('test-token');

      // Mock sudopod deployment
      const mockDeployment: DeploymentInfo = {
        id: 'codespace-xyz789',
        name: 'codespace-xyz789',
        provider: 'codespaces',
        git: {
          owner: 'owner',
          repo: 'repo',
          branch: 'feature-x',
        },
        status: 'running',
        createdAt: new Date().toISOString(),
        urls: {
          workspace: 'https://codespace-xyz789.github.dev',
          sudocode: 'https://codespace-xyz789-3001.app.github.dev',
          ssh: 'gh codespace ssh --codespace codespace-xyz789',
        },
        keepAliveHours: 24,
        idleTimeout: 60,
        machine: 'premiumLinux',
        retentionPeriod: 7,
      };

      const mockProvider = {
        deploy: vi.fn().mockResolvedValue(mockDeployment),
      };

      const { createProvider } = await import('sudopod');
      vi.mocked(createProvider).mockReturnValue(mockProvider as any);

      await spawnService.spawn({
        branch: 'feature-x',
        port: 3001,
        machine: 'premiumLinux',
        idleTimeout: 60,
        keepAliveHours: 24,
        retentionPeriod: 7,
        noOpen: true,
      });

      expect(mockProvider.deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          git: expect.objectContaining({
            branch: 'feature-x',
          }),
          server: {
            port: 3001,
            idleTimeout: 60,
            keepAliveHours: 24,
          },
          providerOptions: {
            machine: 'premiumLinux',
            retentionPeriod: 7,
          },
        })
      );
    });
  });
});
