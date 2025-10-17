/**
 * Unit tests for issue management tools
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as issueTools from '../../src/tools/issues.js';

describe('Issue Tools', () => {
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      exec: vi.fn(),
    };
  });

  describe('ready', () => {
    it('should call exec with ready command', async () => {
      mockClient.exec.mockResolvedValue([]);

      await issueTools.ready(mockClient);

      expect(mockClient.exec).toHaveBeenCalledWith(['ready', '--issues']);
    });

    it('should include limit parameter', async () => {
      mockClient.exec.mockResolvedValue([]);

      await issueTools.ready(mockClient, { limit: 5 });

      expect(mockClient.exec).toHaveBeenCalledWith(['ready', '--limit', '5', '--issues']);
    });

    it('should include all parameters', async () => {
      mockClient.exec.mockResolvedValue([]);

      await issueTools.ready(mockClient, {
        limit: 10,
        priority: 1,
        assignee: 'alice',
        show_specs: true,
        show_issues: true,
      });

      expect(mockClient.exec).toHaveBeenCalledWith([
        'ready',
        '--limit', '10',
        '--priority', '1',
        '--assignee', 'alice',
        '--specs',
        '--issues',
      ]);
    });
  });

  describe('listIssues', () => {
    it('should call exec with list command', async () => {
      mockClient.exec.mockResolvedValue([]);

      await issueTools.listIssues(mockClient);

      expect(mockClient.exec).toHaveBeenCalledWith(['issue', 'list']);
    });

    it('should include filter parameters', async () => {
      mockClient.exec.mockResolvedValue([]);

      await issueTools.listIssues(mockClient, {
        status: 'open',
        type: 'bug',
        priority: 1,
        assignee: 'bob',
        limit: 20,
      });

      expect(mockClient.exec).toHaveBeenCalledWith([
        'issue', 'list',
        '--status', 'open',
        '--type', 'bug',
        '--priority', '1',
        '--assignee', 'bob',
        '--limit', '20',
      ]);
    });
  });

  describe('showIssue', () => {
    it('should call exec with show command and issue ID', async () => {
      mockClient.exec.mockResolvedValue({});

      await issueTools.showIssue(mockClient, { issue_id: 'sg-1' });

      expect(mockClient.exec).toHaveBeenCalledWith(['issue', 'show', 'sg-1']);
    });
  });

  describe('createIssue', () => {
    it('should call exec with create command', async () => {
      mockClient.exec.mockResolvedValue({});

      await issueTools.createIssue(mockClient, { title: 'Test Issue' });

      expect(mockClient.exec).toHaveBeenCalledWith(['issue', 'create', 'Test Issue']);
    });

    it('should include all optional parameters', async () => {
      mockClient.exec.mockResolvedValue({});

      await issueTools.createIssue(mockClient, {
        title: 'Test Issue',
        description: 'Test description',
        type: 'bug',
        priority: 1,
        assignee: 'alice',
        parent: 'sg-epic-1',
        tags: ['urgent', 'security'],
        estimate: 120,
      });

      expect(mockClient.exec).toHaveBeenCalledWith([
        'issue', 'create', 'Test Issue',
        '--description', 'Test description',
        '--type', 'bug',
        '--priority', '1',
        '--assignee', 'alice',
        '--parent', 'sg-epic-1',
        '--tags', 'urgent,security',
        '--estimate', '120',
      ]);
    });
  });

  describe('updateIssue', () => {
    it('should call exec with update command', async () => {
      mockClient.exec.mockResolvedValue({});

      await issueTools.updateIssue(mockClient, {
        issue_id: 'sg-1',
        status: 'in_progress',
      });

      expect(mockClient.exec).toHaveBeenCalledWith([
        'issue', 'update', 'sg-1',
        '--status', 'in_progress',
      ]);
    });

    it('should include multiple update fields', async () => {
      mockClient.exec.mockResolvedValue({});

      await issueTools.updateIssue(mockClient, {
        issue_id: 'sg-1',
        status: 'in_progress',
        priority: 0,
        assignee: 'bob',
        title: 'Updated Title',
      });

      expect(mockClient.exec).toHaveBeenCalledWith([
        'issue', 'update', 'sg-1',
        '--status', 'in_progress',
        '--priority', '0',
        '--assignee', 'bob',
        '--title', 'Updated Title',
      ]);
    });
  });

  describe('closeIssue', () => {
    it('should call exec with close command', async () => {
      mockClient.exec.mockResolvedValue([]);

      await issueTools.closeIssue(mockClient, { issue_ids: ['sg-1'] });

      expect(mockClient.exec).toHaveBeenCalledWith(['issue', 'close', 'sg-1']);
    });

    it('should handle multiple issue IDs', async () => {
      mockClient.exec.mockResolvedValue([]);

      await issueTools.closeIssue(mockClient, {
        issue_ids: ['sg-1', 'sg-2', 'sg-3'],
        reason: 'Completed',
      });

      expect(mockClient.exec).toHaveBeenCalledWith([
        'issue', 'close', 'sg-1', 'sg-2', 'sg-3',
        '--reason', 'Completed',
      ]);
    });
  });

  describe('blockedIssues', () => {
    it('should call exec with blocked command', async () => {
      mockClient.exec.mockResolvedValue([]);

      await issueTools.blockedIssues(mockClient);

      expect(mockClient.exec).toHaveBeenCalledWith(['blocked', '--issues']);
    });

    it('should include show_specs parameter', async () => {
      mockClient.exec.mockResolvedValue([]);

      await issueTools.blockedIssues(mockClient, { show_specs: true });

      expect(mockClient.exec).toHaveBeenCalledWith(['blocked', '--specs', '--issues']);
    });
  });
});
