/**
 * Unit tests for analytics tools
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as analyticsTools from '../../src/tools/analytics.js';

describe('Analytics Tools', () => {
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      exec: vi.fn(),
    };
  });

  describe('stats', () => {
    it('should call exec with stats command', async () => {
      mockClient.exec.mockResolvedValue({
        specs: { total: 5, by_status: {}, by_type: {}, ready: 2 },
        issues: { total: 10, by_status: {}, by_type: {}, ready: 3, blocked: 1 },
        relationships: { total: 8, by_type: {} },
        recent_activity: { specs_updated: 2, issues_updated: 5, issues_created: 3, issues_closed: 2 },
      });

      const result = await analyticsTools.stats(mockClient);

      expect(mockClient.exec).toHaveBeenCalledWith(['stats']);
      expect(result).toBeDefined();
      expect(result.issues.total).toBe(10);
    });
  });

  describe('status', () => {
    it('should call exec with status command', async () => {
      mockClient.exec.mockResolvedValue({});

      await analyticsTools.status(mockClient);

      expect(mockClient.exec).toHaveBeenCalledWith(['status']);
    });

    it('should include verbose parameter', async () => {
      mockClient.exec.mockResolvedValue({});

      await analyticsTools.status(mockClient, { verbose: true });

      expect(mockClient.exec).toHaveBeenCalledWith(['status', '--verbose']);
    });
  });
});
