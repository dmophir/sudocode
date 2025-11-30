/**
 * File search strategy registry
 *
 * Manages registration and retrieval of file search strategies.
 * Allows switching between different search implementations.
 */

import type { FileSearchStrategy } from "./strategy.js"

/**
 * Type name for registered strategies
 */
export type StrategyType = "git-ls-files" | "fast-glob" | "indexed"

/**
 * Registry for file search strategies
 *
 * Manages multiple search strategy implementations and provides
 * a way to select which one to use (globally or per-project).
 *
 * @example
 * ```typescript
 * // Register a strategy
 * fileSearchRegistry.register('git-ls-files', new GitLsFilesStrategy())
 *
 * // Set as default
 * fileSearchRegistry.setDefault('git-ls-files')
 *
 * // Get strategy (uses default if not specified)
 * const strategy = fileSearchRegistry.get()
 * const results = await strategy.search(workspacePath, options)
 * ```
 */
export class FileSearchStrategyRegistry {
  private strategies: Map<StrategyType, FileSearchStrategy> = new Map()
  private defaultStrategy: StrategyType | null = null

  /**
   * Register a new search strategy
   *
   * @param type - Unique identifier for this strategy
   * @param strategy - Strategy implementation
   * @throws Error if strategy with this type already registered
   */
  register(type: StrategyType, strategy: FileSearchStrategy): void {
    if (this.strategies.has(type)) {
      throw new Error(
        `File search strategy '${type}' is already registered. ` +
          `Use a different type name or unregister first.`
      )
    }

    this.strategies.set(type, strategy)

    // Set as default if it's the first strategy registered
    if (this.defaultStrategy === null) {
      this.defaultStrategy = type
    }
  }

  /**
   * Unregister a search strategy
   *
   * @param type - Strategy type to remove
   * @returns True if strategy was found and removed, false otherwise
   */
  unregister(type: StrategyType): boolean {
    const removed = this.strategies.delete(type)

    // Clear default if we removed the default strategy
    if (removed && this.defaultStrategy === type) {
      // Set new default to first available strategy, or null if none
      const firstStrategy = this.strategies.keys().next().value
      this.defaultStrategy = firstStrategy ?? null
    }

    return removed
  }

  /**
   * Get a specific strategy by type, or the default strategy
   *
   * @param type - Optional strategy type. If not provided, returns default.
   * @returns The requested strategy
   * @throws Error if no strategy found for the given type
   * @throws Error if no default strategy set and type not provided
   */
  get(type?: StrategyType): FileSearchStrategy {
    const strategyType = type ?? this.defaultStrategy

    if (strategyType === null) {
      throw new Error(
        "No default file search strategy set. " +
          "Register a strategy first or provide a specific type."
      )
    }

    const strategy = this.strategies.get(strategyType)

    if (!strategy) {
      const available = Array.from(this.strategies.keys()).join(", ")
      throw new Error(
        `File search strategy '${strategyType}' not found. ` +
          `Available strategies: ${available || "none"}`
      )
    }

    return strategy
  }

  /**
   * Set the default strategy to use
   *
   * @param type - Strategy type to set as default
   * @throws Error if strategy type not registered
   */
  setDefault(type: StrategyType): void {
    if (!this.strategies.has(type)) {
      const available = Array.from(this.strategies.keys()).join(", ")
      throw new Error(
        `Cannot set default to unregistered strategy '${type}'. ` +
          `Available strategies: ${available || "none"}`
      )
    }

    this.defaultStrategy = type
  }

  /**
   * Get the current default strategy type
   *
   * @returns Default strategy type, or null if no default set
   */
  getDefaultType(): StrategyType | null {
    return this.defaultStrategy
  }

  /**
   * Check if a strategy is registered
   *
   * @param type - Strategy type to check
   * @returns True if registered, false otherwise
   */
  has(type: StrategyType): boolean {
    return this.strategies.has(type)
  }

  /**
   * Get all registered strategy types
   *
   * @returns Array of registered strategy type names
   */
  listTypes(): StrategyType[] {
    return Array.from(this.strategies.keys())
  }

  /**
   * Clear all registered strategies and reset default
   *
   * Useful for testing or complete reconfiguration
   */
  clear(): void {
    this.strategies.clear()
    this.defaultStrategy = null
  }
}

/**
 * Global file search strategy registry instance
 *
 * Use this singleton for application-wide strategy management.
 */
export const fileSearchRegistry = new FileSearchStrategyRegistry()
