/**
 * Unit tests for initialization tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as initTools from '../../src/tools/init.js';

describe('Init Tool', () => {
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      exec: vi.fn(),
    };
  });

  describe('init', () => {
    it('should call exec with init command', async () => {
      mockClient.exec.mockResolvedValue({
        success: true,
        path: '.sudocode',
        prefix: 'sg',
      });

      await initTools.init(mockClient);

      expect(mockClient.exec).toHaveBeenCalledWith(['init']);
    });

    it('should include prefix parameter', async () => {
      mockClient.exec.mockResolvedValue({
        success: true,
        path: '.sudocode',
        prefix: 'custom',
      });

      await initTools.init(mockClient, { prefix: 'custom' });

      expect(mockClient.exec).toHaveBeenCalledWith(['init', '--prefix', 'custom']);
    });
  });
});
