/**
 * Unit tests for Relationship operations
 */

import { describe, it, expect, beforeEach } from "vitest";
import { initDatabase } from "../../../src/db.js";
import {
  addRelationship,
  removeRelationship,
  getOutgoingRelationships,
  getIncomingRelationships,
  getDependencies,
  getDependents,
  relationshipExists,
  removeAllRelationships,
} from "../../../src/operations/relationships.js";
import { createIssue, getIssue, updateIssue } from "../../../src/operations/issues.js";
import type Database from "better-sqlite3";

describe("Relationship Operations", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = initDatabase({ path: ":memory:" });

    // Create some test issues
    createIssue(db, {
      id: "issue-001",
      title: "Issue 1",
    });
    createIssue(db, {
      id: "issue-002",
      title: "Issue 2",
    });
    createIssue(db, {
      id: "issue-003",
      title: "Issue 3",
    });
  });

  describe("addRelationship", () => {
    it("should create a relationship", () => {
      const rel = addRelationship(db, {
        from_id: "issue-001",
        from_type: "issue",
        to_id: "issue-002",
        to_type: "issue",
        relationship_type: "blocks",
      });

      expect(rel.from_id).toBe("issue-001");
      expect(rel.to_id).toBe("issue-002");
      expect(rel.relationship_type).toBe("blocks");
    });

    it("should return existing relationship when adding duplicate", () => {
      const rel1 = addRelationship(db, {
        from_id: "issue-001",
        from_type: "issue",
        to_id: "issue-002",
        to_type: "issue",
        relationship_type: "blocks",
      });

      const rel2 = addRelationship(db, {
        from_id: "issue-001",
        from_type: "issue",
        to_id: "issue-002",
        to_type: "issue",
        relationship_type: "blocks",
      });

      expect(rel2.from_id).toBe("issue-001");
      expect(rel2.to_id).toBe("issue-002");
      expect(rel2.relationship_type).toBe("blocks");
      expect(rel2.id).toBe(rel1.id);
    });

    it("should throw error when from_id does not exist", () => {
      expect(() => {
        addRelationship(db, {
          from_id: "issue-999",
          from_type: "issue",
          to_id: "issue-001",
          to_type: "issue",
          relationship_type: "blocks",
        });
      }).toThrow("Issue not found: issue-999");
    });

    it("should throw error when to_id does not exist", () => {
      expect(() => {
        addRelationship(db, {
          from_id: "issue-001",
          from_type: "issue",
          to_id: "issue-999",
          to_type: "issue",
          relationship_type: "blocks",
        });
      }).toThrow("Issue not found: issue-999");
    });
  });

  describe("removeRelationship", () => {
    it("should remove an existing relationship", () => {
      addRelationship(db, {
        from_id: "issue-001",
        from_type: "issue",
        to_id: "issue-002",
        to_type: "issue",
        relationship_type: "blocks",
      });

      const removed = removeRelationship(
        db,
        "issue-001",
        "issue",
        "issue-002",
        "issue",
        "blocks"
      );

      expect(removed).toBe(true);
      expect(
        relationshipExists(
          db,
          "issue-001",
          "issue",
          "issue-002",
          "issue",
          "blocks"
        )
      ).toBe(false);
    });

    it("should return false for non-existent relationship", () => {
      const removed = removeRelationship(
        db,
        "issue-001",
        "issue",
        "issue-002",
        "issue",
        "blocks"
      );
      expect(removed).toBe(false);
    });
  });

  describe("getOutgoingRelationships", () => {
    beforeEach(() => {
      addRelationship(db, {
        from_id: "issue-001",
        from_type: "issue",
        to_id: "issue-002",
        to_type: "issue",
        relationship_type: "blocks",
      });
      addRelationship(db, {
        from_id: "issue-001",
        from_type: "issue",
        to_id: "issue-003",
        to_type: "issue",
        relationship_type: "related",
      });
    });

    it("should get all outgoing relationships", () => {
      const rels = getOutgoingRelationships(db, "issue-001", "issue");
      expect(rels).toHaveLength(2);
    });

    it("should filter by relationship type", () => {
      const rels = getOutgoingRelationships(db, "issue-001", "issue", "blocks");
      expect(rels).toHaveLength(1);
      expect(rels[0].to_id).toBe("issue-002");
    });
  });

  describe("getIncomingRelationships", () => {
    beforeEach(() => {
      addRelationship(db, {
        from_id: "issue-001",
        from_type: "issue",
        to_id: "issue-003",
        to_type: "issue",
        relationship_type: "blocks",
      });
      addRelationship(db, {
        from_id: "issue-002",
        from_type: "issue",
        to_id: "issue-003",
        to_type: "issue",
        relationship_type: "blocks",
      });
    });

    it("should get all incoming relationships", () => {
      const rels = getIncomingRelationships(db, "issue-003", "issue");
      expect(rels).toHaveLength(2);
    });

    it("should filter by relationship type", () => {
      const rels = getIncomingRelationships(db, "issue-003", "issue", "blocks");
      expect(rels).toHaveLength(2);
    });
  });

  describe("getDependencies and getDependents", () => {
    beforeEach(() => {
      // issue-002 blocks issue-001
      addRelationship(db, {
        from_id: "issue-001",
        from_type: "issue",
        to_id: "issue-002",
        to_type: "issue",
        relationship_type: "blocks",
      });
    });

    it("should get dependencies", () => {
      const deps = getDependencies(db, "issue-001", "issue");
      expect(deps).toHaveLength(1);
      expect(deps[0].to_id).toBe("issue-002");
    });

    it("should get dependents", () => {
      const deps = getDependents(db, "issue-002", "issue");
      expect(deps).toHaveLength(1);
      expect(deps[0].from_id).toBe("issue-001");
    });
  });

  describe("removeAllRelationships", () => {
    beforeEach(() => {
      addRelationship(db, {
        from_id: "issue-001",
        from_type: "issue",
        to_id: "issue-002",
        to_type: "issue",
        relationship_type: "blocks",
      });
      addRelationship(db, {
        from_id: "issue-003",
        from_type: "issue",
        to_id: "issue-001",
        to_type: "issue",
        relationship_type: "related",
      });
    });

    it("should remove all relationships for an entity", () => {
      const count = removeAllRelationships(db, "issue-001", "issue");
      expect(count).toBe(2);

      const outgoing = getOutgoingRelationships(db, "issue-001", "issue");
      const incoming = getIncomingRelationships(db, "issue-001", "issue");
      expect(outgoing).toHaveLength(0);
      expect(incoming).toHaveLength(0);
    });
  });

  describe("Automatic Blocked Status Management", () => {
    it("should automatically set status to blocked when blocks relationship is added", () => {
      // Verify initial state
      const before = getIssue(db, "issue-001");
      expect(before?.status).toBe("open");

      // Add blocking relationship (issue-001 is blocked by issue-002)
      addRelationship(db, {
        from_id: "issue-001",
        from_type: "issue",
        to_id: "issue-002",
        to_type: "issue",
        relationship_type: "blocks",
      });

      // Verify status automatically changed to blocked
      const after = getIssue(db, "issue-001");
      expect(after?.status).toBe("blocked");
    });

    it("should not set status to blocked if blocker is already closed", () => {
      // Close the blocker first
      updateIssue(db, "issue-002", { status: "closed" });

      // Add blocking relationship
      addRelationship(db, {
        from_id: "issue-001",
        from_type: "issue",
        to_id: "issue-002",
        to_type: "issue",
        relationship_type: "blocks",
      });

      // Status should remain open (blocker is closed)
      const after = getIssue(db, "issue-001");
      expect(after?.status).toBe("open");
    });

    it("should automatically unblock when last blocks relationship is removed", () => {
      // Add blocking relationship and manually set blocked
      addRelationship(db, {
        from_id: "issue-001",
        from_type: "issue",
        to_id: "issue-002",
        to_type: "issue",
        relationship_type: "blocks",
      });
      updateIssue(db, "issue-001", { status: "blocked" });

      // Verify blocked
      const before = getIssue(db, "issue-001");
      expect(before?.status).toBe("blocked");

      // Remove blocking relationship
      removeRelationship(db, "issue-001", "issue", "issue-002", "issue", "blocks");

      // Status should automatically change to open
      const after = getIssue(db, "issue-001");
      expect(after?.status).toBe("open");
    });

    it("should keep status as blocked when removing one of multiple blockers", () => {
      // Add two blocking relationships
      addRelationship(db, {
        from_id: "issue-001",
        from_type: "issue",
        to_id: "issue-002",
        to_type: "issue",
        relationship_type: "blocks",
      });
      addRelationship(db, {
        from_id: "issue-001",
        from_type: "issue",
        to_id: "issue-003",
        to_type: "issue",
        relationship_type: "blocks",
      });
      updateIssue(db, "issue-001", { status: "blocked" });

      // Remove one blocker
      removeRelationship(db, "issue-001", "issue", "issue-002", "issue", "blocks");

      // Status should remain blocked (issue-003 is still blocking)
      const after = getIssue(db, "issue-001");
      expect(after?.status).toBe("blocked");
    });

    it("should not change status when adding non-blocks relationship", () => {
      // Add non-blocking relationship
      addRelationship(db, {
        from_id: "issue-001",
        from_type: "issue",
        to_id: "issue-002",
        to_type: "issue",
        relationship_type: "related",
      });

      // Status should remain open
      const after = getIssue(db, "issue-001");
      expect(after?.status).toBe("open");
    });
  });
});
