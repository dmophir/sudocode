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

  describe('upsertFeedback', () => {
    describe('create mode (no feedback_id)', () => {
      it('should call exec with add feedback command', async () => {
        mockClient.exec.mockResolvedValue({});

        await feedbackTools.upsertFeedback(mockClient, {
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

        await feedbackTools.upsertFeedback(mockClient, {
          issue_id: 'sg-1',
          spec_id: 'sg-spec-1',
          content: 'Needs clarification',
          type: 'comment',
          line: 42,
          agent: 'claude',
        });

        expect(mockClient.exec).toHaveBeenCalledWith([
          'feedback', 'add', 'sg-1', 'sg-spec-1',
          '--content', 'Needs clarification',
          '--type', 'comment',
          '--line', '42',
          '--agent', 'claude',
        ]);
      });

      it('should throw error if required fields are missing', async () => {
        await expect(
          feedbackTools.upsertFeedback(mockClient, {
            issue_id: 'sg-1',
          })
        ).rejects.toThrow('issue_id, spec_id, and content are required when creating feedback');
      });
    });

    describe('update mode (feedback_id provided)', () => {
      it('should call dismiss when dismissed is true', async () => {
        mockClient.exec.mockResolvedValue({});

        await feedbackTools.upsertFeedback(mockClient, {
          feedback_id: 'fb-1',
          dismissed: true,
        });

        expect(mockClient.exec).toHaveBeenCalledWith(['feedback', 'dismiss', 'fb-1']);
      });

      it('should throw error when dismissed is false (cannot un-dismiss)', async () => {
        await expect(
          feedbackTools.upsertFeedback(mockClient, {
            feedback_id: 'fb-1',
            dismissed: false,
          })
        ).rejects.toThrow('Cannot un-dismiss feedback; only dismissing is supported');
      });

      it('should call relocate when relocate is true', async () => {
        mockClient.exec.mockResolvedValue({});

        await feedbackTools.upsertFeedback(mockClient, {
          feedback_id: 'fb-1',
          relocate: true,
        });

        expect(mockClient.exec).toHaveBeenCalledWith(['feedback', 'relocate', 'fb-1']);
      });

      it('should throw error if neither dismissed nor relocate is provided', async () => {
        await expect(
          feedbackTools.upsertFeedback(mockClient, {
            feedback_id: 'fb-1',
          })
        ).rejects.toThrow('When updating feedback, you must provide either dismissed or relocate=true');
      });
    });
  });
});
