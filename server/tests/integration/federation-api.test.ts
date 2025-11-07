/**
 * Integration tests for Federation API
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import type Database from "better-sqlite3";
import { initDatabase } from "../../src/services/db.js";
import { createFederationRouter } from "../../src/routes/federation.js";
import { ISSUES_TABLE, SPECS_TABLE } from "@sudocode-ai/types/schema";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("Federation API", () => {
  let app: express.Application;
  let db: Database.Database;
  let testDbPath: string;
  let testDir: string;

  const LOCAL_REPO_URL = "github.com/org/local-repo";
  const REST_ENDPOINT = "http://localhost:3000/api/v1";

  beforeAll(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "sudocode-test-federation-"));
    testDbPath = path.join(testDir, "cache.db");
    db = initDatabase({ path: testDbPath });

    // Create CLI tables for query testing
    db.exec(ISSUES_TABLE);
    db.exec(SPECS_TABLE);

    // Set up Express app with federation routes
    app = express();
    app.use(express.json());
    app.use(
      "/api/v1/federation",
      createFederationRouter(db, LOCAL_REPO_URL, REST_ENDPOINT)
    );

    // Add a test remote repo
    db.prepare(
      `
      INSERT INTO remote_repos (
        url, display_name, trust_level, rest_endpoint,
        added_at, added_by, auto_sync, sync_interval_minutes, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      "github.com/org/remote-repo",
      "Remote Repo",
      "verified",
      "http://remote.dev/api/v1",
      new Date().toISOString(),
      "test",
      0,
      60,
      "unknown"
    );
  });

  afterAll(() => {
    db.close();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe("GET /api/v1/federation/info", () => {
    it("should return capabilities", async () => {
      const response = await request(app)
        .get("/api/v1/federation/info?from=github.com/org/remote")
        .expect(200);

      expect(response.body.type).toBe("discover_response");
      expect(response.body.capabilities).toBeDefined();
      expect(response.body.capabilities.protocols).toContain("rest");
      expect(response.body.capabilities.operations).toContain("query_issues");
    });
  });

  describe("POST /api/v1/federation/info", () => {
    it("should handle A2A discover message", async () => {
      const response = await request(app)
        .post("/api/v1/federation/info")
        .send({
          type: "discover",
          from: "github.com/org/remote",
          to: LOCAL_REPO_URL,
          timestamp: new Date().toISOString(),
        })
        .expect(200);

      expect(response.body.type).toBe("discover_response");
      expect(response.body.from).toBe(LOCAL_REPO_URL);
      expect(response.body.to).toBe("github.com/org/remote");
    });
  });

  describe("POST /api/v1/federation/query", () => {
    it("should reject query from unconfigured repo", async () => {
      const response = await request(app)
        .post("/api/v1/federation/query")
        .send({
          type: "query",
          from: "github.com/org/unconfigured",
          to: LOCAL_REPO_URL,
          timestamp: new Date().toISOString(),
          query: {
            entity: "issue",
            filters: { status: "open" },
          },
        })
        .expect(403);

      expect(response.body.title).toBe("Forbidden");
    });

    it("should reject query from untrusted repo", async () => {
      // Add untrusted repo
      db.prepare(
        `
        INSERT INTO remote_repos (
          url, display_name, trust_level, added_at, added_by,
          auto_sync, sync_interval_minutes, sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        "github.com/org/untrusted",
        "Untrusted",
        "untrusted",
        new Date().toISOString(),
        "test",
        0,
        60,
        "unknown"
      );

      const response = await request(app)
        .post("/api/v1/federation/query")
        .send({
          type: "query",
          from: "github.com/org/untrusted",
          to: LOCAL_REPO_URL,
          timestamp: new Date().toISOString(),
          query: {
            entity: "issue",
            filters: { status: "open" },
          },
        })
        .expect(403);

      expect(response.body.detail).toContain("untrusted");
    });

    it("should allow query from verified repo", async () => {
      const response = await request(app)
        .post("/api/v1/federation/query")
        .send({
          type: "query",
          from: "github.com/org/remote-repo",
          to: LOCAL_REPO_URL,
          timestamp: new Date().toISOString(),
          query: {
            entity: "issue",
            filters: { status: "open" },
          },
        })
        .expect(200);

      expect(response.body.type).toBe("query_response");
      expect(response.body.results).toBeDefined();
      expect(Array.isArray(response.body.results)).toBe(true);
    });
  });

  describe("POST /api/v1/federation/mutate", () => {
    it("should create pending request from verified repo", async () => {
      const response = await request(app)
        .post("/api/v1/federation/mutate")
        .send({
          type: "mutate",
          from: "github.com/org/remote-repo",
          to: LOCAL_REPO_URL,
          timestamp: new Date().toISOString(),
          operation: "create_issue",
          data: {
            title: "Test Issue from Remote",
            description: "This is a test",
            priority: 2,
          },
          metadata: {
            request_id: "req-integration-test-123",
            requester: "test-agent",
          },
        })
        .expect(200);

      expect(response.body.type).toBe("mutate_response");
      expect(response.body.status).toBe("pending_approval");
      expect(response.body.request_id).toBe("req-integration-test-123");

      // Verify request was created
      const createdRequest = db
        .prepare("SELECT * FROM cross_repo_requests WHERE request_id = ?")
        .get("req-integration-test-123") as any;
      expect(createdRequest).toBeDefined();
      expect(createdRequest.status).toBe("pending");
    });

    it("should reject mutate from untrusted repo", async () => {
      const response = await request(app)
        .post("/api/v1/federation/mutate")
        .send({
          type: "mutate",
          from: "github.com/org/untrusted",
          to: LOCAL_REPO_URL,
          timestamp: new Date().toISOString(),
          operation: "create_issue",
          data: {
            title: "Test Issue",
          },
          metadata: {
            request_id: "req-should-reject",
            requester: "test",
          },
        })
        .expect(200); // Returns 200 but with rejected status

      expect(response.body.status).toBe("rejected");
      expect(response.body.message).toContain("untrusted");
    });
  });

  describe("Remote Repository Management", () => {
    describe("GET /api/v1/federation/remotes", () => {
      it("should list all remotes", async () => {
        const response = await request(app)
          .get("/api/v1/federation/remotes")
          .expect(200);

        expect(response.body.remotes).toBeDefined();
        expect(Array.isArray(response.body.remotes)).toBe(true);
        expect(response.body.remotes.length).toBeGreaterThan(0);
      });

      it("should filter by trust level", async () => {
        const response = await request(app)
          .get("/api/v1/federation/remotes?trust_level=verified")
          .expect(200);

        expect(response.body.remotes.every((r: any) => r.trust_level === "verified")).toBe(true);
      });
    });

    describe("POST /api/v1/federation/remotes", () => {
      it("should add new remote", async () => {
        const response = await request(app)
          .post("/api/v1/federation/remotes")
          .send({
            url: "github.com/org/new-remote",
            display_name: "New Remote",
            trust_level: "verified",
            rest_endpoint: "http://new-remote.dev/api/v1",
            added_by: "test-user",
          })
          .expect(201);

        expect(response.body.url).toBe("github.com/org/new-remote");
        expect(response.body.display_name).toBe("New Remote");
        expect(response.body.trust_level).toBe("verified");
      });

      it("should require url and display_name", async () => {
        const response = await request(app)
          .post("/api/v1/federation/remotes")
          .send({
            trust_level: "verified",
          })
          .expect(400);

        expect(response.body.detail).toContain("required");
      });
    });

    describe("GET /api/v1/federation/remotes/:url", () => {
      it("should get specific remote", async () => {
        const response = await request(app)
          .get("/api/v1/federation/remotes/github.com/org/remote-repo")
          .expect(200);

        expect(response.body.url).toBe("github.com/org/remote-repo");
        expect(response.body.display_name).toBe("Remote Repo");
      });

      it("should return 404 for non-existent remote", async () => {
        const response = await request(app)
          .get("/api/v1/federation/remotes/github.com/org/nonexistent")
          .expect(404);

        expect(response.body.title).toBe("Not Found");
      });
    });

    describe("PUT /api/v1/federation/remotes/:url", () => {
      it("should update remote", async () => {
        const response = await request(app)
          .put("/api/v1/federation/remotes/github.com/org/remote-repo")
          .send({
            trust_level: "trusted",
            description: "Updated description",
          })
          .expect(200);

        expect(response.body.trust_level).toBe("trusted");
        expect(response.body.description).toBe("Updated description");
      });

      it("should return 404 for non-existent remote", async () => {
        const response = await request(app)
          .put("/api/v1/federation/remotes/github.com/org/nonexistent")
          .send({
            trust_level: "trusted",
          })
          .expect(404);

        expect(response.body.title).toBe("Not Found");
      });
    });

    describe("DELETE /api/v1/federation/remotes/:url", () => {
      it("should delete remote", async () => {
        await request(app)
          .delete("/api/v1/federation/remotes/github.com/org/new-remote")
          .expect(204);

        // Verify deleted
        await request(app)
          .get("/api/v1/federation/remotes/github.com/org/new-remote")
          .expect(404);
      });

      it("should return 404 for non-existent remote", async () => {
        await request(app)
          .delete("/api/v1/federation/remotes/github.com/org/nonexistent")
          .expect(404);
      });
    });
  });

  describe("Request Management", () => {
    describe("GET /api/v1/federation/requests", () => {
      it("should list pending requests", async () => {
        const response = await request(app)
          .get("/api/v1/federation/requests")
          .expect(200);

        expect(response.body.requests).toBeDefined();
        expect(Array.isArray(response.body.requests)).toBe(true);
      });

      it("should filter by direction", async () => {
        const response = await request(app)
          .get("/api/v1/federation/requests?direction=incoming")
          .expect(200);

        expect(response.body.requests.every((r: any) => r.direction === "incoming")).toBe(true);
      });

      it("should filter by status", async () => {
        const response = await request(app)
          .get("/api/v1/federation/requests?status=pending")
          .expect(200);

        expect(response.body.requests.every((r: any) => r.status === "pending")).toBe(true);
      });
    });

    describe("GET /api/v1/federation/requests/:id", () => {
      it("should get specific request", async () => {
        const response = await request(app)
          .get("/api/v1/federation/requests/req-integration-test-123")
          .expect(200);

        expect(response.body.request_id).toBe("req-integration-test-123");
        expect(response.body.status).toBe("pending");
      });

      it("should return 404 for non-existent request", async () => {
        await request(app)
          .get("/api/v1/federation/requests/req-nonexistent")
          .expect(404);
      });
    });

    describe("POST /api/v1/federation/requests/:id/approve", () => {
      it("should approve request", async () => {
        const response = await request(app)
          .post("/api/v1/federation/requests/req-integration-test-123/approve")
          .send({
            approver: "test-approver",
          })
          .expect(200);

        expect(response.body.request.status).toBe("approved");
        expect(response.body.request.approved_by).toBe("test-approver");
        expect(response.body.result).toBeDefined();
      });

      it("should return 404 for non-existent request", async () => {
        await request(app)
          .post("/api/v1/federation/requests/req-nonexistent/approve")
          .send({
            approver: "test",
          })
          .expect(404);
      });
    });

    describe("POST /api/v1/federation/requests/:id/reject", () => {
      let rejectRequestId: string;

      beforeAll(() => {
        // Create a request to reject
        rejectRequestId = "req-to-reject";
        db.prepare(
          `
          INSERT INTO cross_repo_requests (
            request_id, direction, from_repo, to_repo,
            request_type, payload, status,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        ).run(
          rejectRequestId,
          "incoming",
          "github.com/org/remote-repo",
          LOCAL_REPO_URL,
          "create_issue",
          JSON.stringify({ title: "Test" }),
          "pending",
          new Date().toISOString(),
          new Date().toISOString()
        );
      });

      it("should reject request", async () => {
        const response = await request(app)
          .post(`/api/v1/federation/requests/${rejectRequestId}/reject`)
          .send({
            reason: "Out of scope",
          })
          .expect(200);

        expect(response.body.request.status).toBe("rejected");
        expect(response.body.request.rejection_reason).toBe("Out of scope");
      });
    });
  });

  describe("Audit", () => {
    describe("GET /api/v1/federation/audit", () => {
      it("should get audit logs", async () => {
        const response = await request(app)
          .get("/api/v1/federation/audit")
          .expect(200);

        expect(response.body.logs).toBeDefined();
        expect(Array.isArray(response.body.logs)).toBe(true);
      });

      it("should filter by remote repo", async () => {
        const response = await request(app)
          .get("/api/v1/federation/audit?remote_repo=github.com/org/remote-repo")
          .expect(200);

        expect(response.body.logs.every((l: any) => l.remote_repo === "github.com/org/remote-repo")).toBe(true);
      });

      it("should limit results", async () => {
        const response = await request(app)
          .get("/api/v1/federation/audit?limit=5")
          .expect(200);

        expect(response.body.logs.length).toBeLessThanOrEqual(5);
      });
    });

    describe("GET /api/v1/federation/audit/stats", () => {
      it("should get audit stats", async () => {
        const response = await request(app)
          .get("/api/v1/federation/audit/stats")
          .expect(200);

        expect(response.body.total).toBeDefined();
        expect(response.body.successful).toBeDefined();
        expect(response.body.failed).toBeDefined();
        expect(response.body.byOperation).toBeDefined();
        expect(typeof response.body.byOperation).toBe("object");
      });
    });
  });
});
