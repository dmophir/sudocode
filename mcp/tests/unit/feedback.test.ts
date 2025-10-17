/**
 * Unit tests for feedback management tools
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as feedbackTools from '../../src/tools/feedback.js';

describe('Feedback Tools', () => {
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      exec: vi.fn(),
    };
  });

  describe('addFeedback', () => {
    it('should call exec with add feedback command', async () => {
      mockClient.exec.mockResolvedValue({});

      await feedbackTools.addFeedback(mockClient, {
        issue_id: 'sg-1',
        spec_id: 'sg-spec-1',
        content: 'This is unclear',
      });

      expect(mockClient.exec).toHaveBeenCalledWith([
        'feedback', 'add', 'sg-1', 'sg-spec-1',
        '--content', 'This is unclear',
      ]);
    });

    it('should include all optional parameters', async () => {
      mockClient.exec.mockResolvedValue({});

      await feedbackTools.addFeedback(mockClient, {
        issue_id: 'sg-1',
        spec_id: 'sg-spec-1',
        content: 'Needs clarification',
        type: 'ambiguity',
        line: 42,
        agent: 'claude',
      });

      expect(mockClient.exec).toHaveBeenCalledWith([
        'feedback', 'add', 'sg-1', 'sg-spec-1',
        '--content', 'Needs clarification',
        '--type', 'ambiguity',
        '--line', '42',
        '--agent', 'claude',
      ]);
    });
  });

  describe('listFeedback', () => {
    it('should call exec with list command', async () => {
      mockClient.exec.mockResolvedValue([]);

      await feedbackTools.listFeedback(mockClient);

      expect(mockClient.exec).toHaveBeenCalledWith(['feedback', 'list']);
    });

    it('should include filter parameters', async () => {
      mockClient.exec.mockResolvedValue([]);

      await feedbackTools.listFeedback(mockClient, {
        issue: 'sg-1',
        spec: 'sg-spec-1',
        type: 'question',
        status: 'open',
        limit: 10,
      });

      expect(mockClient.exec).toHaveBeenCalledWith([
        'feedback', 'list',
        '--issue', 'sg-1',
        '--spec', 'sg-spec-1',
        '--type', 'question',
        '--status', 'open',
        '--limit', '10',
      ]);
    });
  });

  describe('showFeedback', () => {
    it('should call exec with show command', async () => {
      mockClient.exec.mockResolvedValue({});

      await feedbackTools.showFeedback(mockClient, { feedback_id: 'fb-1' });

      expect(mockClient.exec).toHaveBeenCalledWith(['feedback', 'show', 'fb-1']);
    });
  });

  describe('acknowledgeFeedback', () => {
    it('should call exec with acknowledge command', async () => {
      mockClient.exec.mockResolvedValue({});

      await feedbackTools.acknowledgeFeedback(mockClient, { feedback_id: 'fb-1' });

      expect(mockClient.exec).toHaveBeenCalledWith(['feedback', 'acknowledge', 'fb-1']);
    });
  });

  describe('resolveFeedback', () => {
    it('should call exec with resolve command', async () => {
      mockClient.exec.mockResolvedValue({});

      await feedbackTools.resolveFeedback(mockClient, { feedback_id: 'fb-1' });

      expect(mockClient.exec).toHaveBeenCalledWith(['feedback', 'resolve', 'fb-1']);
    });
  });

  describe('wontfixFeedback', () => {
    it('should call exec with wontfix command', async () => {
      mockClient.exec.mockResolvedValue({});

      await feedbackTools.wontfixFeedback(mockClient, { feedback_id: 'fb-1' });

      expect(mockClient.exec).toHaveBeenCalledWith(['feedback', 'wontfix', 'fb-1']);
    });
  });

  describe('staleFeedback', () => {
    it('should call exec with stale command', async () => {
      mockClient.exec.mockResolvedValue([]);

      await feedbackTools.staleFeedback(mockClient);

      expect(mockClient.exec).toHaveBeenCalledWith(['feedback', 'stale']);
    });

    it('should include limit parameter', async () => {
      mockClient.exec.mockResolvedValue([]);

      await feedbackTools.staleFeedback(mockClient, { limit: 5 });

      expect(mockClient.exec).toHaveBeenCalledWith(['feedback', 'stale', '--limit', '5']);
    });
  });

  describe('relocateFeedback', () => {
    it('should call exec with relocate command', async () => {
      mockClient.exec.mockResolvedValue({});

      await feedbackTools.relocateFeedback(mockClient, { feedback_id: 'fb-1' });

      expect(mockClient.exec).toHaveBeenCalledWith(['feedback', 'relocate', 'fb-1']);
    });
  });
});
