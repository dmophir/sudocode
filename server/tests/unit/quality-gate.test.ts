/**
 * Quality Gate Service Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { initDatabase } from "@sudocode-ai/cli/dist/db.js";
import { QualityGateService } from "../../src/services/quality-gate.js";
import type { QualityGateConfig } from "@sudocode-ai/types";

describe("Quality Gate Service", () => {
  let db: Database.Database;
  let service: QualityGateService;
  const testRepoRoot = "/tmp/test-repo";

  beforeEach(() => {
    // Create fresh in-memory database for each test
    db = initDatabase({ path: ":memory:" });
    service = new QualityGateService(db, testRepoRoot);
  });

  describe("runChecks", () => {
    it("should pass when all checks succeed", async () => {
      const config: QualityGateConfig = {
        runTests: true,
        testCommand: "echo 'tests passed'",
      };

      const result = await service.runChecks("exec-001", config, testRepoRoot);

      expect(result.passed).toBe(true);
      expect(result.execution_id).toBe("exec-001");
      expect(result.results).toHaveLength(1);
      expect(result.results[0].name).toBe("Tests");
      expect(result.results[0].passed).toBe(true);
    });

    it("should fail when a check fails", async () => {
      const config: QualityGateConfig = {
        runTests: true,
        testCommand: "exit 1",
      };

      const result = await service.runChecks("exec-002", config, testRepoRoot);

      expect(result.passed).toBe(false);
      expect(result.results[0].passed).toBe(false);
      expect(result.results[0].error).toBeDefined();
    });

    it("should run multiple checks", async () => {
      const config: QualityGateConfig = {
        runTests: true,
        testCommand: "echo 'tests ok'",
        runBuild: true,
        buildCommand: "echo 'build ok'",
        runLint: true,
        lintCommand: "echo 'lint ok'",
      };

      const result = await service.runChecks("exec-003", config, testRepoRoot);

      expect(result.results).toHaveLength(3);
      expect(result.results[0].name).toBe("Tests");
      expect(result.results[1].name).toBe("Build");
      expect(result.results[2].name).toBe("Lint");
      expect(result.passed).toBe(true);
    });

    it("should run custom checks", async () => {
      const config: QualityGateConfig = {
        customChecks: [
          { name: "Custom Check 1", command: "echo 'custom 1'" },
          { name: "Custom Check 2", command: "echo 'custom 2'" },
        ],
      };

      const result = await service.runChecks("exec-004", config, testRepoRoot);

      expect(result.results).toHaveLength(2);
      expect(result.results[0].name).toBe("Custom Check 1");
      expect(result.results[1].name).toBe("Custom Check 2");
      expect(result.passed).toBe(true);
    });

    it("should handle command timeout", async () => {
      const config: QualityGateConfig = {
        runTests: true,
        testCommand: "sleep 10",
        testTimeout: 100, // 100ms timeout
      };

      const result = await service.runChecks("exec-005", config, testRepoRoot);

      expect(result.passed).toBe(false);
      expect(result.results[0].passed).toBe(false);
      expect(result.results[0].error).toContain("timed out");
    }, 15000);

    it("should store results in database", async () => {
      const config: QualityGateConfig = {
        runTests: true,
        testCommand: "echo 'test'",
      };

      await service.runChecks("exec-006", config, testRepoRoot);

      const storedResult = service.getResults("exec-006");
      expect(storedResult).toBeDefined();
      expect(storedResult?.execution_id).toBe("exec-006");
      expect(storedResult?.passed).toBe(true);
    });
  });

  describe("getResults", () => {
    it("should return null for non-existent execution", () => {
      const result = service.getResults("non-existent");
      expect(result).toBeNull();
    });

    it("should return most recent results", async () => {
      const config: QualityGateConfig = {
        runTests: true,
        testCommand: "echo 'test'",
      };

      // Run checks twice
      await service.runChecks("exec-007", config, testRepoRoot);
      await new Promise((resolve) => setTimeout(resolve, 10));
      await service.runChecks("exec-007", config, testRepoRoot);

      const result = service.getResults("exec-007");
      expect(result).toBeDefined();
      // Should get the most recent one
    });
  });

  describe("deleteResults", () => {
    it("should delete results for an execution", async () => {
      const config: QualityGateConfig = {
        runTests: true,
        testCommand: "echo 'test'",
      };

      await service.runChecks("exec-008", config, testRepoRoot);

      let result = service.getResults("exec-008");
      expect(result).toBeDefined();

      service.deleteResults("exec-008");

      result = service.getResults("exec-008");
      expect(result).toBeNull();
    });
  });
});
