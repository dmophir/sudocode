/**
 * Tests for FileSearchStrategyRegistry
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
  FileSearchStrategyRegistry,
  type StrategyType,
} from "../../../../src/services/file-search/registry.js"
import type {
  FileSearchStrategy,
  FileSearchOptions,
  FileSearchResult,
} from "../../../../src/services/file-search/strategy.js"

// Mock strategy implementation for testing
class MockStrategy implements FileSearchStrategy {
  constructor(private name: string) {}

  async search(
    workspacePath: string,
    options: FileSearchOptions
  ): Promise<FileSearchResult[]> {
    return []
  }

  getName(): string {
    return this.name
  }
}

describe("FileSearchStrategyRegistry", () => {
  let registry: FileSearchStrategyRegistry

  beforeEach(() => {
    registry = new FileSearchStrategyRegistry()
  })

  describe("register", () => {
    it("should register a new strategy", () => {
      const strategy = new MockStrategy("test-strategy")

      expect(() => {
        registry.register("git-ls-files", strategy)
      }).not.toThrow()

      expect(registry.has("git-ls-files")).toBe(true)
    })

    it("should set first registered strategy as default", () => {
      const strategy = new MockStrategy("test-strategy")

      registry.register("git-ls-files", strategy)

      expect(registry.getDefaultType()).toBe("git-ls-files")
    })

    it("should throw error when registering duplicate type", () => {
      const strategy1 = new MockStrategy("strategy-1")
      const strategy2 = new MockStrategy("strategy-2")

      registry.register("git-ls-files", strategy1)

      expect(() => {
        registry.register("git-ls-files", strategy2)
      }).toThrow(/already registered/)
    })

    it("should allow registering multiple different strategies", () => {
      const strategy1 = new MockStrategy("strategy-1")
      const strategy2 = new MockStrategy("strategy-2")

      registry.register("git-ls-files", strategy1)
      registry.register("fast-glob", strategy2)

      expect(registry.has("git-ls-files")).toBe(true)
      expect(registry.has("fast-glob")).toBe(true)
      expect(registry.listTypes()).toHaveLength(2)
    })
  })

  describe("unregister", () => {
    it("should remove a registered strategy", () => {
      const strategy = new MockStrategy("test-strategy")

      registry.register("git-ls-files", strategy)
      expect(registry.has("git-ls-files")).toBe(true)

      const removed = registry.unregister("git-ls-files")

      expect(removed).toBe(true)
      expect(registry.has("git-ls-files")).toBe(false)
    })

    it("should return false when unregistering non-existent strategy", () => {
      const removed = registry.unregister("git-ls-files")

      expect(removed).toBe(false)
    })

    it("should update default when removing default strategy", () => {
      const strategy1 = new MockStrategy("strategy-1")
      const strategy2 = new MockStrategy("strategy-2")

      registry.register("git-ls-files", strategy1)
      registry.register("fast-glob", strategy2)

      expect(registry.getDefaultType()).toBe("git-ls-files")

      registry.unregister("git-ls-files")

      // Should automatically set to remaining strategy
      expect(registry.getDefaultType()).toBe("fast-glob")
    })

    it("should set default to null when removing last strategy", () => {
      const strategy = new MockStrategy("test-strategy")

      registry.register("git-ls-files", strategy)
      registry.unregister("git-ls-files")

      expect(registry.getDefaultType()).toBeNull()
    })
  })

  describe("get", () => {
    it("should return registered strategy by type", () => {
      const strategy = new MockStrategy("test-strategy")

      registry.register("git-ls-files", strategy)

      const retrieved = registry.get("git-ls-files")

      expect(retrieved).toBe(strategy)
      expect(retrieved.getName()).toBe("test-strategy")
    })

    it("should return default strategy when no type specified", () => {
      const strategy = new MockStrategy("test-strategy")

      registry.register("git-ls-files", strategy)

      const retrieved = registry.get()

      expect(retrieved).toBe(strategy)
    })

    it("should throw error when strategy not found", () => {
      expect(() => {
        registry.get("git-ls-files")
      }).toThrow(/not found/)
    })

    it("should throw error when no default set and type not provided", () => {
      expect(() => {
        registry.get()
      }).toThrow(/No default/)
    })

    it("should list available strategies in error message", () => {
      const strategy1 = new MockStrategy("strategy-1")
      const strategy2 = new MockStrategy("strategy-2")

      registry.register("git-ls-files", strategy1)
      registry.register("fast-glob", strategy2)

      expect(() => {
        registry.get("indexed")
      }).toThrow(/git-ls-files.*fast-glob/)
    })
  })

  describe("setDefault", () => {
    it("should set default strategy", () => {
      const strategy1 = new MockStrategy("strategy-1")
      const strategy2 = new MockStrategy("strategy-2")

      registry.register("git-ls-files", strategy1)
      registry.register("fast-glob", strategy2)

      registry.setDefault("fast-glob")

      expect(registry.getDefaultType()).toBe("fast-glob")
      expect(registry.get()).toBe(strategy2)
    })

    it("should throw error when setting unregistered strategy as default", () => {
      expect(() => {
        registry.setDefault("git-ls-files")
      }).toThrow(/unregistered strategy/)
    })

    it("should list available strategies in error message", () => {
      const strategy = new MockStrategy("test-strategy")
      registry.register("fast-glob", strategy)

      expect(() => {
        registry.setDefault("git-ls-files")
      }).toThrow(/fast-glob/)
    })
  })

  describe("has", () => {
    it("should return true for registered strategy", () => {
      const strategy = new MockStrategy("test-strategy")

      registry.register("git-ls-files", strategy)

      expect(registry.has("git-ls-files")).toBe(true)
    })

    it("should return false for non-registered strategy", () => {
      expect(registry.has("git-ls-files")).toBe(false)
    })
  })

  describe("listTypes", () => {
    it("should return empty array when no strategies registered", () => {
      expect(registry.listTypes()).toEqual([])
    })

    it("should return all registered strategy types", () => {
      const strategy1 = new MockStrategy("strategy-1")
      const strategy2 = new MockStrategy("strategy-2")
      const strategy3 = new MockStrategy("strategy-3")

      registry.register("git-ls-files", strategy1)
      registry.register("fast-glob", strategy2)
      registry.register("indexed", strategy3)

      const types = registry.listTypes()

      expect(types).toHaveLength(3)
      expect(types).toContain("git-ls-files")
      expect(types).toContain("fast-glob")
      expect(types).toContain("indexed")
    })
  })

  describe("clear", () => {
    it("should remove all strategies", () => {
      const strategy1 = new MockStrategy("strategy-1")
      const strategy2 = new MockStrategy("strategy-2")

      registry.register("git-ls-files", strategy1)
      registry.register("fast-glob", strategy2)

      registry.clear()

      expect(registry.listTypes()).toEqual([])
      expect(registry.has("git-ls-files")).toBe(false)
      expect(registry.has("fast-glob")).toBe(false)
    })

    it("should reset default to null", () => {
      const strategy = new MockStrategy("test-strategy")

      registry.register("git-ls-files", strategy)

      registry.clear()

      expect(registry.getDefaultType()).toBeNull()
    })

    it("should allow registering strategies after clear", () => {
      const strategy1 = new MockStrategy("strategy-1")
      const strategy2 = new MockStrategy("strategy-2")

      registry.register("git-ls-files", strategy1)
      registry.clear()
      registry.register("fast-glob", strategy2)

      expect(registry.has("fast-glob")).toBe(true)
      expect(registry.getDefaultType()).toBe("fast-glob")
    })
  })

  describe("getDefaultType", () => {
    it("should return null when no strategies registered", () => {
      expect(registry.getDefaultType()).toBeNull()
    })

    it("should return default strategy type", () => {
      const strategy = new MockStrategy("test-strategy")

      registry.register("git-ls-files", strategy)

      expect(registry.getDefaultType()).toBe("git-ls-files")
    })

    it("should reflect updated default after setDefault", () => {
      const strategy1 = new MockStrategy("strategy-1")
      const strategy2 = new MockStrategy("strategy-2")

      registry.register("git-ls-files", strategy1)
      registry.register("fast-glob", strategy2)
      registry.setDefault("fast-glob")

      expect(registry.getDefaultType()).toBe("fast-glob")
    })
  })
})
