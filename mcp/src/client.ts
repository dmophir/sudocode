/**
 * sudocode CLI client wrapper
 *
 * This module provides a client class that spawns `sudocode` CLI commands
 * and parses their JSON output for use in MCP tools.
 *
 * All project context is resolved from the explicit --project-id provided
 * at startup. No fallback to cwd, env vars, or discovery.
 */

import { spawn } from "child_process";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { SudocodeClientConfig, SudocodeError } from "./types.js";

export class SudocodeClient {
  private workingDir: string;
  private cliPath: string;
  private cliArgs: string[];
  private dbPath?: string;
  private serverUrl?: string;
  private versionChecked = false;
  private sudocodeDir?: string;
  private projectId?: string;

  constructor(config?: SudocodeClientConfig) {
    // Project context is resolved from --project-id at MCP startup.
    // workingDir, sudocodeDir, and dbPath are all set from registry lookup
    // in index.ts validateConfig(), not from env vars or cwd fallback.
    this.workingDir = config?.workingDir || process.cwd();
    this.serverUrl = config?.serverUrl || process.env.SUDOCODE_SERVER_URL;
    this.sudocodeDir = config?.sudocodeDir;
    this.projectId = config?.projectId;

    // Set dbPath from config (resolved from registry in validateConfig)
    if (config?.dbPath) {
      this.dbPath = config.dbPath;
    } else if (this.sudocodeDir) {
      this.dbPath = join(this.sudocodeDir, "cache.db");
    }

    // Auto-discover CLI path from node_modules or use configured/env path
    const cliInfo = this.findCliPath();
    this.cliPath = cliInfo.path;
    this.cliArgs = cliInfo.args;
  }

  /**
   * Find the CLI by looking in node_modules/@sudocode-ai/cli
   * Since we added @sudocode-ai/cli as a dependency, it should be there
   */
  private findCliPath(): { path: string; args: string[] } {
    try {
      const currentFile = fileURLToPath(import.meta.url);
      const currentDir = dirname(currentFile);

      // Look for @sudocode-ai/cli in various possible locations
      const possiblePaths = [
        // Workspace root node_modules (development)
        join(
          currentDir,
          "..",
          "..",
          "node_modules",
          "@sudocode-ai",
          "cli",
          "dist",
          "cli.js"
        ),
        // Local package node_modules (when installed from npm)
        join(
          currentDir,
          "..",
          "node_modules",
          "@sudocode-ai",
          "cli",
          "dist",
          "cli.js"
        ),
      ];

      for (const cliJsPath of possiblePaths) {
        if (existsSync(cliJsPath)) {
          // Return node + cli.js path instead of creating a wrapper
          return {
            path: process.execPath, // Use current node binary
            args: [cliJsPath], // Pass cli.js as first argument
          };
        }
      }
    } catch (error) {
      // Ignore errors and fall back to 'sudocode' command
    }

    // Fall back to 'sudocode' command in PATH
    return { path: "sudocode", args: [] };
  }

  /**
   * Get the sudocode directory.
   * Resolved from --project-id registry lookup at startup.
   */
  getSudocodeDir(): string {
    if (this.sudocodeDir) {
      return this.sudocodeDir;
    }

    // Fallback: derive from workingDir (should not happen with proper config)
    return join(this.workingDir, ".sudocode");
  }

  /**
   * Execute a CLI command and return parsed JSON output
   */
  async exec(args: string[], options?: { timeout?: number }): Promise<any> {
    // Check CLI version on first call
    if (!this.versionChecked) {
      await this.checkVersion();
      this.versionChecked = true;
    }

    // Build command arguments - prepend cliArgs (e.g., cli.js path)
    const cmdArgs = [...this.cliArgs, ...args];

    // Add --json flag if not already present
    if (!cmdArgs.includes("--json")) {
      cmdArgs.push("--json");
    }

    // Add --project-id if available (preferred over --db for project context)
    if (this.projectId && !cmdArgs.includes("--project-id")) {
      cmdArgs.push("--project-id", this.projectId);
    } else if (!cmdArgs.includes("--db") && !cmdArgs.includes("--project-id")) {
      // Fallback: use --db if no project-id available
      const dbPath = this.dbPath || join(this.getSudocodeDir(), "cache.db");
      cmdArgs.push("--db", dbPath);
    }

    return new Promise((resolve, reject) => {
      const proc = spawn(this.cliPath, cmdArgs, {
        cwd: this.workingDir,
        env: {
          ...process.env,
          SUDOCODE_DISABLE_UPDATE_CHECK: "true",
          ...(process.env.SUDOCODE_SESSION_ID
            ? { SUDOCODE_SESSION_ID: process.env.SUDOCODE_SESSION_ID }
            : {}),
        },
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      // Set timeout if specified
      const timeout = options?.timeout || 30000; // Default 30s
      const timer = setTimeout(() => {
        proc.kill();
        reject(
          new SudocodeError(
            `Command timed out after ${timeout}ms`,
            -1,
            "Timeout"
          )
        );
      }, timeout);

      proc.on("close", (code) => {
        clearTimeout(timer);

        if (code !== 0) {
          reject(
            new SudocodeError(
              `CLI command failed with exit code ${code}`,
              code || -1,
              stderr
            )
          );
          return;
        }

        // Parse JSON output
        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (error) {
          reject(
            new SudocodeError(
              `Failed to parse JSON output: ${
                error instanceof Error ? error.message : String(error)
              }`,
              -1,
              stdout
            )
          );
        }
      });

      proc.on("error", (error) => {
        clearTimeout(timer);
        reject(
          new SudocodeError(
            `Failed to spawn CLI: ${error.message}`,
            -1,
            error.message
          )
        );
      });
    });
  }

  /**
   * Check that the CLI is installed and get its version
   */
  async checkVersion(): Promise<{ version: string }> {
    try {
      const proc = spawn(this.cliPath, [...this.cliArgs, "--version"], {
        cwd: this.workingDir,
        env: {
          ...process.env,
          SUDOCODE_DISABLE_UPDATE_CHECK: "true",
        },
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      return new Promise((resolve, reject) => {
        proc.on("close", (code) => {
          if (code !== 0) {
            reject(
              new SudocodeError(
                `CLI not found or failed to execute. Make sure 'sudocode' is installed and in your PATH.`,
                code || -1,
                stderr
              )
            );
            return;
          }

          // Version output format: "sudocode version X.Y.Z" or just "X.Y.Z"
          const versionMatch = stdout.match(/(\d+\.\d+\.\d+)/);
          const version = versionMatch ? versionMatch[1] : stdout.trim();

          resolve({ version });
        });

        proc.on("error", () => {
          reject(
            new SudocodeError(
              `CLI not found at path: ${this.cliPath}. Make sure 'sudocode' is installed.`,
              -1,
              "CLI not found"
            )
          );
        });
      });
    } catch (error) {
      throw new SudocodeError(
        `Failed to check CLI version: ${
          error instanceof Error ? error.message : String(error)
        }`,
        -1,
        ""
      );
    }
  }
}
