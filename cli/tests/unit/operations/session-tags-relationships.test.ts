/**
 * Unit tests for Session tags and relationships
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { initDatabase } from '../../../src/db.js';
import { createSession } from '../../../src/operations/sessions.js';
import { addTag, removeTag, getTags } from '../../../src/operations/tags.js';
import { addRelationship, removeRelationship, getOutgoingRelationships } from '../../../src/operations/relationships.js';
import { createSpec } from '../../../src/operations/specs.js';
import { createIssue } from '../../../src/operations/issues.js';
import type Database from 'better-sqlite3';

describe('Session Tags and Relationships', () => {
  let db: Database.Database;

  beforeEach(() => {
    // Create a fresh in-memory database for each test
    db = initDatabase({ path: ':memory:' });
  });

  describe('Session Tags', () => {
    it('should add tag to session', () => {
      const session = createSession(db, {
        id: 'SESS-001',
        session_id: 'claude-session-abc',
        title: 'Test Session',
        agent_type: 'claude-code',
      });

      const tag = addTag(db, session.id, 'session', 'authentication');

      expect(tag.entity_id).toBe('SESS-001');
      expect(tag.entity_type).toBe('session');
      expect(tag.tag).toBe('authentication');
    });

    it('should add multiple tags to session', () => {
      const session = createSession(db, {
        id: 'SESS-001',
        session_id: 'claude-session-abc',
        title: 'Test Session',
        agent_type: 'claude-code',
      });

      addTag(db, session.id, 'session', 'authentication');
      addTag(db, session.id, 'session', 'security');

      const tags = getTags(db, session.id, 'session');

      expect(tags.length).toBe(2);
      expect(tags).toContain('authentication');
      expect(tags).toContain('security');
    });

    it('should remove tag from session', () => {
      const session = createSession(db, {
        id: 'SESS-001',
        session_id: 'claude-session-abc',
        title: 'Test Session',
        agent_type: 'claude-code',
      });

      addTag(db, session.id, 'session', 'authentication');
      const removed = removeTag(db, session.id, 'session', 'authentication');

      expect(removed).toBe(true);

      const tags = getTags(db, session.id, 'session');
      expect(tags.length).toBe(0);
    });

    it('should throw error for non-existent session', () => {
      expect(() => {
        addTag(db, 'SESS-999', 'session', 'test');
      }).toThrow('Session not found: SESS-999');
    });
  });

  describe('Session Relationships', () => {
    it('should create relationship from session to spec', () => {
      const session = createSession(db, {
        id: 'SESS-001',
        session_id: 'claude-session-abc',
        title: 'Test Session',
        agent_type: 'claude-code',
      });

      const spec = createSpec(db, {
        id: 's-abc',
        title: 'Test Spec',
        file_path: 'test.md',
      });

      const rel = addRelationship(db, {
        from_id: session.id,
        from_type: 'session',
        to_id: spec.id,
        to_type: 'spec',
        relationship_type: 'implements',
      });

      expect(rel.from_id).toBe('SESS-001');
      expect(rel.from_type).toBe('session');
      expect(rel.to_id).toBe('s-abc');
      expect(rel.to_type).toBe('spec');
      expect(rel.relationship_type).toBe('implements');
    });

    it('should create relationship from issue to session', () => {
      const session = createSession(db, {
        id: 'SESS-001',
        session_id: 'claude-session-abc',
        title: 'Test Session',
        agent_type: 'claude-code',
      });

      const issue = createIssue(db, {
        id: 'i-xyz',
        title: 'Test Issue',
        status: 'open',
      });

      const rel = addRelationship(db, {
        from_id: issue.id,
        from_type: 'issue',
        to_id: session.id,
        to_type: 'session',
        relationship_type: 'references',
      });

      expect(rel.from_id).toBe('i-xyz');
      expect(rel.from_type).toBe('issue');
      expect(rel.to_id).toBe('SESS-001');
      expect(rel.to_type).toBe('session');
      expect(rel.relationship_type).toBe('references');
    });

    it('should create relationship between two sessions', () => {
      const session1 = createSession(db, {
        id: 'SESS-001',
        session_id: 'claude-session-abc',
        title: 'Test Session 1',
        agent_type: 'claude-code',
      });

      const session2 = createSession(db, {
        id: 'SESS-002',
        session_id: 'claude-session-xyz',
        title: 'Test Session 2',
        agent_type: 'claude-code',
      });

      const rel = addRelationship(db, {
        from_id: session1.id,
        from_type: 'session',
        to_id: session2.id,
        to_type: 'session',
        relationship_type: 'related',
      });

      expect(rel.from_id).toBe('SESS-001');
      expect(rel.from_type).toBe('session');
      expect(rel.to_id).toBe('SESS-002');
      expect(rel.to_type).toBe('session');
      expect(rel.relationship_type).toBe('related');
    });

    it('should get relationships for session', () => {
      const session = createSession(db, {
        id: 'SESS-001',
        session_id: 'claude-session-abc',
        title: 'Test Session',
        agent_type: 'claude-code',
      });

      const spec = createSpec(db, {
        id: 's-abc',
        title: 'Test Spec',
        file_path: 'test.md',
      });

      const issue = createIssue(db, {
        id: 'i-xyz',
        title: 'Test Issue',
        status: 'open',
      });

      addRelationship(db, {
        from_id: session.id,
        from_type: 'session',
        to_id: spec.id,
        to_type: 'spec',
        relationship_type: 'implements',
      });

      addRelationship(db, {
        from_id: session.id,
        from_type: 'session',
        to_id: issue.id,
        to_type: 'issue',
        relationship_type: 'references',
      });

      const relationships = getOutgoingRelationships(db, session.id, 'session');

      expect(relationships.length).toBe(2);
      expect(relationships.some((r) => r.to_id === 's-abc')).toBe(true);
      expect(relationships.some((r) => r.to_id === 'i-xyz')).toBe(true);
    });

    it('should remove relationship involving session', () => {
      const session = createSession(db, {
        id: 'SESS-001',
        session_id: 'claude-session-abc',
        title: 'Test Session',
        agent_type: 'claude-code',
      });

      const spec = createSpec(db, {
        id: 's-abc',
        title: 'Test Spec',
        file_path: 'test.md',
      });

      addRelationship(db, {
        from_id: session.id,
        from_type: 'session',
        to_id: spec.id,
        to_type: 'spec',
        relationship_type: 'implements',
      });

      const removed = removeRelationship(
        db,
        session.id,
        'session',
        spec.id,
        'spec',
        'implements'
      );

      expect(removed).toBe(true);

      const relationships = getOutgoingRelationships(db, session.id, 'session');
      expect(relationships.length).toBe(0);
    });

    it('should throw error for non-existent session', () => {
      const spec = createSpec(db, {
        id: 's-abc',
        title: 'Test Spec',
        file_path: 'test.md',
      });

      expect(() => {
        addRelationship(db, {
          from_id: 'SESS-999',
          from_type: 'session',
          to_id: spec.id,
          to_type: 'spec',
          relationship_type: 'implements',
        });
      }).toThrow('Session not found: SESS-999');
    });
  });
});
