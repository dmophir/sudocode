/**
 * Issue Group Service Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { initDatabase } from "@sudocode-ai/cli/dist/db.js";
import { createIssue } from "@sudocode-ai/cli/dist/operations/issues.js";
import {
  createIssueGroup,
  getIssueGroup,
  updateIssueGroup,
  deleteIssueGroup,
  listIssueGroups,
  addIssueToGroup,
  removeIssueFromGroup,
  getIssuesInGroup,
  getGroupForIssue,
} from "../../src/services/issue-groups.js";

describe("Issue Group Service", () => {
  let db: Database.Database;

  beforeEach(() => {
    // Create fresh in-memory database for each test
    db = initDatabase({ path: ":memory:" });
  });

  describe("createIssueGroup", () => {
    it("should create a new issue group with default values", () => {
      const group = createIssueGroup(db, {
        id: "group-001",
        name: "Auth Feature",
        workingBranch: "sudocode/auth-feature",
      });

      expect(group).toBeDefined();
      expect(group.id).toBe("group-001");
      expect(group.name).toBe("Auth Feature");
      expect(group.workingBranch).toBe("sudocode/auth-feature");
      expect(group.baseBranch).toBe("main"); // default
      expect(group.status).toBe("active"); // default
      expect(group.uuid).toBeDefined();
      expect(group.created_at).toBeDefined();
    });

    it("should create a group with custom base branch and description", () => {
      const group = createIssueGroup(db, {
        id: "group-002",
        name: "Payment Integration",
        workingBranch: "sudocode/payment-integration",
        baseBranch: "develop",
        description: "Stripe payment integration",
        color: "#FF5733",
      });

      expect(group.baseBranch).toBe("develop");
      expect(group.description).toBe("Stripe payment integration");
      expect(group.color).toBe("#FF5733");
    });

    it("should throw error if working branch already exists", () => {
      createIssueGroup(db, {
        id: "group-001",
        name: "First Group",
        workingBranch: "sudocode/shared-branch",
      });

      expect(() => {
        createIssueGroup(db, {
          id: "group-002",
          name: "Second Group",
          workingBranch: "sudocode/shared-branch", // duplicate
        });
      }).toThrow(/working branch/i);
    });
  });

  describe("getIssueGroup", () => {
    it("should retrieve an existing issue group", () => {
      const created = createIssueGroup(db, {
        id: "group-001",
        name: "Test Group",
        workingBranch: "sudocode/test",
      });

      const retrieved = getIssueGroup(db, "group-001");

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe(created.name);
    });

    it("should return null for non-existent group", () => {
      const group = getIssueGroup(db, "non-existent");
      expect(group).toBeNull();
    });
  });

  describe("updateIssueGroup", () => {
    it("should update group status", () => {
      createIssueGroup(db, {
        id: "group-001",
        name: "Test Group",
        workingBranch: "sudocode/test",
      });

      const updated = updateIssueGroup(db, "group-001", {
        status: "paused",
        pauseReason: "Waiting for review",
      });

      expect(updated.status).toBe("paused");
      expect(updated.pauseReason).toBe("Waiting for review");
    });

    it("should update group metadata", () => {
      createIssueGroup(db, {
        id: "group-001",
        name: "Test Group",
        workingBranch: "sudocode/test",
      });

      const updated = updateIssueGroup(db, "group-001", {
        name: "Updated Name",
        description: "New description",
        color: "#00FF00",
      });

      expect(updated.name).toBe("Updated Name");
      expect(updated.description).toBe("New description");
      expect(updated.color).toBe("#00FF00");
    });

    it("should throw error for non-existent group", () => {
      expect(() => {
        updateIssueGroup(db, "non-existent", { status: "paused" });
      }).toThrow(/not found/i);
    });
  });

  describe("deleteIssueGroup", () => {
    it("should delete an existing group", () => {
      createIssueGroup(db, {
        id: "group-001",
        name: "Test Group",
        workingBranch: "sudocode/test",
      });

      const result = deleteIssueGroup(db, "group-001");
      expect(result).toBe(true);

      const retrieved = getIssueGroup(db, "group-001");
      expect(retrieved).toBeNull();
    });

    it("should return false for non-existent group", () => {
      const result = deleteIssueGroup(db, "non-existent");
      expect(result).toBe(false);
    });
  });

  describe("listIssueGroups", () => {
    beforeEach(() => {
      createIssueGroup(db, {
        id: "group-001",
        name: "Active Group",
        workingBranch: "sudocode/active",
        status: "active",
      });

      createIssueGroup(db, {
        id: "group-002",
        name: "Paused Group",
        workingBranch: "sudocode/paused",
        status: "paused",
      });

      createIssueGroup(db, {
        id: "group-003",
        name: "Completed Group",
        workingBranch: "sudocode/completed",
        status: "completed",
      });
    });

    it("should list all groups", () => {
      const groups = listIssueGroups(db);
      expect(groups).toHaveLength(3);
    });

    it("should filter by status", () => {
      const activeGroups = listIssueGroups(db, { status: "active" });
      expect(activeGroups).toHaveLength(1);
      expect(activeGroups[0].name).toBe("Active Group");

      const pausedGroups = listIssueGroups(db, { status: "paused" });
      expect(pausedGroups).toHaveLength(1);
      expect(pausedGroups[0].name).toBe("Paused Group");
    });
  });

  describe("Issue Group Membership", () => {
    let groupId: string;
    let issue1Id: string;
    let issue2Id: string;

    beforeEach(() => {
      // Create group
      const group = createIssueGroup(db, {
        id: "group-001",
        name: "Test Group",
        workingBranch: "sudocode/test",
      });
      groupId = group.id;

      // Create issues
      const issue1 = createIssue(db, {
        id: "issue-001",
        title: "First Issue",
      });
      issue1Id = issue1.id;

      const issue2 = createIssue(db, {
        id: "issue-002",
        title: "Second Issue",
      });
      issue2Id = issue2.id;
    });

    describe("addIssueToGroup", () => {
      it("should add an issue to a group", () => {
        const member = addIssueToGroup(db, groupId, issue1Id);

        expect(member).toBeDefined();
        expect(member.group_id).toBe(groupId);
        expect(member.issue_id).toBe(issue1Id);
        expect(member.added_at).toBeDefined();
      });

      it("should add multiple issues with positions", () => {
        addIssueToGroup(db, groupId, issue1Id, 0);
        addIssueToGroup(db, groupId, issue2Id, 1);

        const issues = getIssuesInGroup(db, groupId);
        expect(issues).toHaveLength(2);
        expect(issues[0].id).toBe(issue1Id);
        expect(issues[1].id).toBe(issue2Id);
      });

      it("should not add same issue twice", () => {
        addIssueToGroup(db, groupId, issue1Id);

        expect(() => {
          addIssueToGroup(db, groupId, issue1Id);
        }).toThrow(/already/i);
      });

      it("should throw error for non-existent group", () => {
        expect(() => {
          addIssueToGroup(db, "non-existent", issue1Id);
        }).toThrow(/group not found/i);
      });

      it("should throw error for non-existent issue", () => {
        expect(() => {
          addIssueToGroup(db, groupId, "non-existent");
        }).toThrow(/issue not found/i);
      });
    });

    describe("removeIssueFromGroup", () => {
      beforeEach(() => {
        addIssueToGroup(db, groupId, issue1Id);
        addIssueToGroup(db, groupId, issue2Id);
      });

      it("should remove an issue from a group", () => {
        const result = removeIssueFromGroup(db, groupId, issue1Id);
        expect(result).toBe(true);

        const issues = getIssuesInGroup(db, groupId);
        expect(issues).toHaveLength(1);
        expect(issues[0].id).toBe(issue2Id);
      });

      it("should return false for non-member issue", () => {
        const issue3 = createIssue(db, {
          id: "issue-003",
          title: "Third Issue",
        });

        const result = removeIssueFromGroup(db, groupId, issue3.id);
        expect(result).toBe(false);
      });
    });

    describe("getIssuesInGroup", () => {
      it("should return empty array for group with no issues", () => {
        const issues = getIssuesInGroup(db, groupId);
        expect(issues).toEqual([]);
      });

      it("should return all issues in a group", () => {
        addIssueToGroup(db, groupId, issue1Id);
        addIssueToGroup(db, groupId, issue2Id);

        const issues = getIssuesInGroup(db, groupId);
        expect(issues).toHaveLength(2);
      });

      it("should order by position", () => {
        addIssueToGroup(db, groupId, issue2Id, 0);
        addIssueToGroup(db, groupId, issue1Id, 1);

        const issues = getIssuesInGroup(db, groupId);
        expect(issues[0].id).toBe(issue2Id); // position 0
        expect(issues[1].id).toBe(issue1Id); // position 1
      });
    });

    describe("getGroupForIssue", () => {
      it("should return group for an issue", () => {
        addIssueToGroup(db, groupId, issue1Id);

        const group = getGroupForIssue(db, issue1Id);
        expect(group).toBeDefined();
        expect(group?.id).toBe(groupId);
      });

      it("should return null for ungrouped issue", () => {
        const group = getGroupForIssue(db, issue1Id);
        expect(group).toBeNull();
      });
    });
  });

  describe("Cascade Deletion", () => {
    it("should remove members when group is deleted", () => {
      const group = createIssueGroup(db, {
        id: "group-001",
        name: "Test Group",
        workingBranch: "sudocode/test",
      });

      const issue = createIssue(db, {
        id: "issue-001",
        title: "Test Issue",
      });

      addIssueToGroup(db, group.id, issue.id);

      // Delete group
      deleteIssueGroup(db, group.id);

      // Check that membership is removed
      const groupForIssue = getGroupForIssue(db, issue.id);
      expect(groupForIssue).toBeNull();
    });
  });
});
