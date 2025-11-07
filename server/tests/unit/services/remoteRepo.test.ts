/**
 * Unit tests for Remote Repository Service
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type Database from "better-sqlite3";
import { initDatabase } from "../../../src/services/db.js";
import {
  addRemoteRepo,
  getRemoteRepo,
  listRemoteRepos,
  updateRemoteRepo,
  removeRemoteRepo,
  remoteRepoExists,
} from "../../../src/services/remoteRepo.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("RemoteRepo Service", () => {
  let db: Database.Database;
  let testDbPath: string;
  let testDir: string;

  beforeAll(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "sudocode-test-remote-"));
    testDbPath = path.join(testDir, "cache.db");
    db = initDatabase({ path: testDbPath });
  });

  afterAll(() => {
    db.close();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe("addRemoteRepo", () => {
    it("should add a new remote repository", () => {
      const remote = addRemoteRepo(db, {
        url: "github.com/org/repo-a",
        display_name: "Repo A",
        description: "Test repository A",
        trust_level: "untrusted",
        rest_endpoint: "https://repo-a.dev/api/v1",
        auto_sync: false,
        sync_interval_minutes: 60,
        added_by: "test-user",
      });

      expect(remote.url).toBe("github.com/org/repo-a");
      expect(remote.display_name).toBe("Repo A");
      expect(remote.trust_level).toBe("untrusted");
      expect(remote.auto_sync).toBe(false);
      expect(remote.sync_status).toBe("unknown");
      expect(remote.added_at).toBeDefined();
    });

    it("should add remote with minimal fields", () => {
      const remote = addRemoteRepo(db, {
        url: "github.com/org/repo-b",
        display_name: "Repo B",
        trust_level: "verified",
        auto_sync: true,
        sync_interval_minutes: 30,
        added_by: "test-user",
      });

      expect(remote.url).toBe("github.com/org/repo-b");
      expect(remote.description).toBeNull(); // SQLite stores as NULL
      expect(remote.rest_endpoint).toBeNull(); // SQLite stores as NULL
      expect(remote.auto_sync).toBe(true);
      expect(remote.sync_interval_minutes).toBe(30);
    });
  });

  describe("getRemoteRepo", () => {
    it("should get existing remote repository", () => {
      const remote = getRemoteRepo(db, "github.com/org/repo-a");
      expect(remote).toBeDefined();
      expect(remote!.url).toBe("github.com/org/repo-a");
      expect(remote!.display_name).toBe("Repo A");
    });

    it("should return undefined for non-existent remote", () => {
      const remote = getRemoteRepo(db, "github.com/org/nonexistent");
      expect(remote).toBeUndefined();
    });
  });

  describe("listRemoteRepos", () => {
    it("should list all remote repositories", () => {
      const remotes = listRemoteRepos(db);
      expect(remotes.length).toBeGreaterThanOrEqual(2);
      expect(remotes.some((r) => r.url === "github.com/org/repo-a")).toBe(true);
      expect(remotes.some((r) => r.url === "github.com/org/repo-b")).toBe(true);
    });

    it("should filter by trust level", () => {
      const remotes = listRemoteRepos(db, { trust_level: "verified" });
      expect(remotes.every((r) => r.trust_level === "verified")).toBe(true);
      expect(remotes.some((r) => r.url === "github.com/org/repo-b")).toBe(true);
    });

    it("should filter by sync status", () => {
      const remotes = listRemoteRepos(db, { sync_status: "unknown" });
      expect(remotes.every((r) => r.sync_status === "unknown")).toBe(true);
    });
  });

  describe("updateRemoteRepo", () => {
    it("should update remote repository", () => {
      const updated = updateRemoteRepo(db, "github.com/org/repo-a", {
        trust_level: "trusted",
        description: "Updated description",
      });

      expect(updated).toBeDefined();
      expect(updated!.trust_level).toBe("trusted");
      expect(updated!.description).toBe("Updated description");
      expect(updated!.display_name).toBe("Repo A"); // Unchanged
    });

    it("should update sync status", () => {
      const updated = updateRemoteRepo(db, "github.com/org/repo-a", {
        sync_status: "synced",
        last_synced_at: new Date().toISOString(),
      });

      expect(updated!.sync_status).toBe("synced");
      expect(updated!.last_synced_at).toBeDefined();
    });

    it("should throw for non-existent remote", () => {
      expect(() =>
        updateRemoteRepo(db, "github.com/org/nonexistent", {
          trust_level: "trusted",
        })
      ).toThrow("not found");
    });
  });

  describe("remoteRepoExists", () => {
    it("should return true for existing remote", () => {
      expect(remoteRepoExists(db, "github.com/org/repo-a")).toBe(true);
    });

    it("should return false for non-existent remote", () => {
      expect(remoteRepoExists(db, "github.com/org/nonexistent")).toBe(false);
    });
  });

  describe("removeRemoteRepo", () => {
    it("should remove existing remote", () => {
      const removed = removeRemoteRepo(db, "github.com/org/repo-b");
      expect(removed).toBe(true);
      expect(getRemoteRepo(db, "github.com/org/repo-b")).toBeUndefined();
    });

    it("should return false for non-existent remote", () => {
      const removed = removeRemoteRepo(db, "github.com/org/nonexistent");
      expect(removed).toBe(false);
    });
  });
});
