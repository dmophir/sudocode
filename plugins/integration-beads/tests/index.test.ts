/**
 * Tests for Beads Integration Plugin
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import beadsPlugin from "../src/index.js";

describe("Beads Plugin", () => {
  describe("metadata", () => {
    it("should have correct name", () => {
      expect(beadsPlugin.name).toBe("beads");
    });

    it("should have display name", () => {
      expect(beadsPlugin.displayName).toBe("Beads");
    });

    it("should have version", () => {
      expect(beadsPlugin.version).toBe("0.1.0");
    });

    it("should have config schema", () => {
      expect(beadsPlugin.configSchema).toBeDefined();
      expect(beadsPlugin.configSchema?.properties.path).toBeDefined();
      expect(beadsPlugin.configSchema?.required).toContain("path");
    });
  });

  describe("validateConfig", () => {
    it("should require path option", () => {
      const result = beadsPlugin.validateConfig({});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("beads.options.path is required");
    });

    it("should accept valid config", () => {
      const result = beadsPlugin.validateConfig({ path: ".beads" });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should warn about invalid issue_prefix", () => {
      const result = beadsPlugin.validateConfig({
        path: ".beads",
        issue_prefix: "toolong",
      });
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain(
        "beads.options.issue_prefix should be 1-4 alphabetic characters"
      );
    });

    it("should accept valid issue_prefix", () => {
      const result = beadsPlugin.validateConfig({
        path: ".beads",
        issue_prefix: "bd",
      });
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe("testConnection", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), "beads-test-"));
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true });
    });

    it("should fail when path not configured", async () => {
      const result = await beadsPlugin.testConnection({}, tempDir);
      expect(result.success).toBe(false);
      expect(result.error).toContain("not configured");
    });

    it("should fail when directory does not exist", async () => {
      const result = await beadsPlugin.testConnection(
        { path: "nonexistent" },
        tempDir
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should succeed when directory exists", async () => {
      const beadsDir = join(tempDir, ".beads");
      mkdirSync(beadsDir);

      const result = await beadsPlugin.testConnection(
        { path: ".beads" },
        tempDir
      );
      expect(result.success).toBe(true);
      expect(result.details?.hasIssuesFile).toBe(false);
    });

    it("should detect issues.jsonl file", async () => {
      const beadsDir = join(tempDir, ".beads");
      mkdirSync(beadsDir);
      writeFileSync(
        join(beadsDir, "issues.jsonl"),
        '{"id": "bd-1", "title": "Test"}\n{"id": "bd-2", "title": "Test 2"}\n'
      );

      const result = await beadsPlugin.testConnection(
        { path: ".beads" },
        tempDir
      );
      expect(result.success).toBe(true);
      expect(result.details?.hasIssuesFile).toBe(true);
      expect(result.details?.issueCount).toBe(2);
    });
  });

  describe("createProvider", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), "beads-test-"));
      const beadsDir = join(tempDir, ".beads");
      mkdirSync(beadsDir);
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true });
    });

    it("should create provider instance", () => {
      const provider = beadsPlugin.createProvider({ path: ".beads" }, tempDir);
      expect(provider).toBeDefined();
      expect(provider.name).toBe("beads");
    });

    it("should initialize successfully", async () => {
      const provider = beadsPlugin.createProvider({ path: ".beads" }, tempDir);
      await expect(provider.initialize()).resolves.toBeUndefined();
    });

    it("should fail initialization for non-existent directory", async () => {
      const provider = beadsPlugin.createProvider(
        { path: "nonexistent" },
        tempDir
      );
      await expect(provider.initialize()).rejects.toThrow("not found");
    });
  });

  describe("provider operations", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), "beads-test-"));
      const beadsDir = join(tempDir, ".beads");
      mkdirSync(beadsDir);
      writeFileSync(
        join(beadsDir, "issues.jsonl"),
        '{"id": "bd-1", "title": "First Issue", "content": "Description 1", "status": "open", "priority": 2}\n' +
          '{"id": "bd-2", "title": "Second Issue", "content": "Description 2", "status": "in_progress", "priority": 1}\n'
      );
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true });
    });

    it("should fetch entity by ID", async () => {
      const provider = beadsPlugin.createProvider({ path: ".beads" }, tempDir);
      await provider.initialize();

      const entity = await provider.fetchEntity("bd-1");
      expect(entity).toBeDefined();
      expect(entity?.id).toBe("bd-1");
      expect(entity?.title).toBe("First Issue");
    });

    it("should return null for non-existent entity", async () => {
      const provider = beadsPlugin.createProvider({ path: ".beads" }, tempDir);
      await provider.initialize();

      const entity = await provider.fetchEntity("bd-999");
      expect(entity).toBeNull();
    });

    it("should search entities", async () => {
      const provider = beadsPlugin.createProvider({ path: ".beads" }, tempDir);
      await provider.initialize();

      const entities = await provider.searchEntities();
      expect(entities).toHaveLength(2);
    });

    it("should filter entities by query", async () => {
      const provider = beadsPlugin.createProvider({ path: ".beads" }, tempDir);
      await provider.initialize();

      const entities = await provider.searchEntities("First");
      expect(entities).toHaveLength(1);
      expect(entities[0].title).toBe("First Issue");
    });

    it("should map external entity to sudocode format", async () => {
      const provider = beadsPlugin.createProvider({ path: ".beads" }, tempDir);
      await provider.initialize();

      const entity = await provider.fetchEntity("bd-1");
      const mapped = provider.mapToSudocode(entity!);

      expect(mapped.issue).toBeDefined();
      expect(mapped.issue?.title).toBe("First Issue");
      expect(mapped.issue?.status).toBe("open");
    });
  });
});
