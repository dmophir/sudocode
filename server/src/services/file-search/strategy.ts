/**
 * File search strategy interface and types
 *
 * Provides a pluggable interface for different file search implementations.
 * This allows swapping between git ls-files, fast-glob, indexed search, etc.
 */

/**
 * Options for file search
 */
export interface FileSearchOptions {
  /** Search query string */
  query: string

  /** Maximum number of results to return */
  limit: number

  /** Whether to include directories in results */
  includeDirectories: boolean

  /** Additional patterns to exclude from search (e.g., ['*.log', 'tmp/**']) */
  excludePatterns?: string[]
}

/**
 * A single file search result
 */
export interface FileSearchResult {
  /** Relative path from workspace root */
  path: string

  /** Filename only (last segment of path) */
  name: string

  /** True for files, false for directories */
  isFile: boolean

  /** Type of match for ranking purposes */
  matchType?: "exact" | "prefix" | "contains"
}

/**
 * File search strategy interface
 *
 * Implementations provide different ways to search for files in a workspace.
 * Common strategies:
 * - git-ls-files: Use git ls-files command (respects .gitignore)
 * - fast-glob: Use fast-glob library for flexible patterns
 * - indexed: Pre-index files for faster searching
 */
export interface FileSearchStrategy {
  /**
   * Search for files in the workspace
   *
   * @param workspacePath - Absolute path to workspace root
   * @param options - Search options including query and filters
   * @returns Array of matching file results, sorted by relevance
   */
  search(
    workspacePath: string,
    options: FileSearchOptions
  ): Promise<FileSearchResult[]>

  /**
   * Get the name of this strategy for debugging/logging
   *
   * @returns Strategy name (e.g., 'git-ls-files', 'fast-glob')
   */
  getName(): string
}
