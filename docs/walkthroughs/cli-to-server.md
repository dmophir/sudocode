# CLI to Server Walkthrough

*2026-03-10T08:30:13Z by Showboat 0.6.1*
<!-- showboat-id: ff9dd4c8-10df-4cf7-b6fc-598cfdcd4aee -->

This walkthrough traces the execution path from running the `sudocode server` CLI command to a fully running HTTP/WebSocket server. It demonstrates the architecture of the sudocode codebase, showing how the CLI, server, and various services interact.

## Overview

The sudocode project is organized as a monorepo with several packages:

- **cli/** - The `@sudocode-ai/cli` package providing the `sudocode` and `sdc` commands
- **server/** - The `@sudocode-ai/local-server` package providing the HTTP/WebSocket server
- **mcp/** - MCP (Model Context Protocol) server implementation
- **types/** - Shared TypeScript types

When you run `sudocode server`, the following chain of events occurs:

1. CLI parses the command and resolves project directories
2. CLI spawns the server process (either binary or via npx)
3. Server initializes ProjectRegistry and ProjectManager
4. Server opens the current project, initializing database and services
5. Express routes and WebSocket server are set up
6. Server listens on a port and is ready to accept connections

## Step 1: CLI Entry Point

The journey begins in `cli/src/cli.ts`. This is the main entry point registered in the package.json:

```json
"bin": {
  "sudocode": "dist/cli.js",
  "sdc": "dist/cli.js"
}
```

The CLI uses Commander.js to define commands. Let's see the structure:

```bash
head -80 cli/src/cli.ts | tail -60
```

```output
  handleSpecDelete,
} from "./cli/spec-commands.js";
import {
  handleIssueCreate,
  handleIssueList,
  handleIssueShow,
  handleIssueUpdate,
  handleIssueClose,
  handleIssueDelete,
} from "./cli/issue-commands.js";
import { handleLink } from "./cli/relationship-commands.js";
import { handleAddReference } from "./cli/reference-commands.js";
import { handleReady, handleBlocked } from "./cli/query-commands.js";
import { handleSync, handleExport, handleImport } from "./cli/sync-commands.js";
import { handleStatus, handleStats } from "./cli/status-commands.js";
import {
  handleFeedbackAdd,
  handleFeedbackList,
  handleFeedbackShow,
  handleFeedbackDismiss,
  handleFeedbackStale,
  handleFeedbackRelocate,
} from "./cli/feedback-commands.js";
import { handleServerStart } from "./cli/server-commands.js";
import { handleInit } from "./cli/init-commands.js";
import { handleUpdate, handleUpdateCheck } from "./cli/update-commands.js";
import {
  handlePluginList,
  handlePluginInstall,
  handlePluginStatus,
  handlePluginUninstall,
  handlePluginConfigure,
  handlePluginTest,
  handlePluginInfo,
} from "./cli/plugin-commands.js";
import {
  handleResolveConflicts,
  handleMergeDriver,
  handleInitMergeDriver,
  handleRemoveMergeDriver,
} from "./cli/merge-commands.js";
import { handleAuthClearCommand, handleAuthStatusCommand, handleAuthClaudeCommand } from "./cli/auth-commands.js";
import {
  handleRemoteSpawn,
  handleRemoteConfig,
  handleRemoteList,
  handleRemoteStatus,
  handleRemoteStop,
} from "./cli/remote-commands.js";
import {
  handleConfigGet,
  handleConfigSet,
  handleConfigShow,
  handleConfigProjectId,
} from "./cli/config-commands.js";
import { getUpdateNotification } from "./update-checker.js";
import { VERSION } from "./version.js";

// Global state
let db: Database.Database | null = null;
```

The CLI imports handlers for various commands. Notice `handleServerStart` from `./cli/server-commands.js` - this is what handles the `sudocode server` command.

The server command is defined at line 583-590:

```bash
sed -n '580,591p' cli/src/cli.ts
```

```output
// SERVER COMMANDS
// ============================================================================

program
  .command("server")
  .description("Start the sudocode local server")
  .option("-p, --port <port>", "Port to run server on")
  .option("-d, --detach", "Run server in background")
  .action(async (options) => {
    await handleServerStart(getContext(), options);
  });

```

## Step 2: Server Command Handler

When `sudocode server` is invoked, the `handleServerStart` function in `cli/src/cli/server-commands.ts` is called. This function:

1. Checks for available updates
2. Determines how to run the server (binary or npx)
3. Spawns the server process with appropriate environment variables

```bash
cat cli/src/cli/server-commands.ts
```

```output
/**
 * CLI handlers for server commands
 */

import { spawn } from "child_process";
import chalk from "chalk";
import { getUpdateNotification } from "../update-checker.js";

export interface CommandContext {
  db: any;
  outputDir: string;
  jsonOutput: boolean;
}

export interface ServerStartOptions {
  port?: string;
  detach?: boolean;
}

/**
 * Check which server installation method is available
 * Returns 'binary' if sudocode-server binary is available,
 * 'package' if @sudocode-ai/local-server package is available,
 * or null if neither is available
 */
async function getServerAvailability(): Promise<"binary" | "package" | null> {
  const { execSync } = await import("child_process");

  // First try sudocode-server binary
  try {
    execSync("which sudocode-server", {
      stdio: "ignore",
      timeout: 5000,
    });
    return "binary";
  } catch {
    // Binary not found, try package
  }

  // Then try @sudocode-ai/local-server package
  try {
    execSync("npx --no @sudocode-ai/local-server --version", {
      stdio: "ignore",
      timeout: 5000,
    });
    return "package";
  } catch {
    // Package not found either
  }

  return null;
}

/**
 * Start the sudocode local server
 */
export async function handleServerStart(
  ctx: CommandContext,
  options: ServerStartOptions
): Promise<void> {
  // Check for updates before starting server
  // Skip if SUDOCODE_DISABLE_UPDATE_CHECK environment variable is set
  if (process.env.SUDOCODE_DISABLE_UPDATE_CHECK !== "true") {
    try {
      const updateNotification = await getUpdateNotification();
      if (updateNotification) {
        console.log();
        console.log(chalk.yellow(updateNotification));
        console.log();
      }
    } catch {
      // Silently ignore update check failures
    }
  }

  // Check which server installation is available
  const serverAvailability = await getServerAvailability();

  if (!serverAvailability) {
    console.error(chalk.red("✗ sudocode server is not available"));
    console.log();
    console.log(chalk.yellow("Please install the sudocode package:"));
    console.log();
    console.log(chalk.blue("  Global installation (recommended):"));
    console.log(chalk.gray("    npm install -g sudocode"));
    console.log();
    console.log(chalk.blue("  Or local installation:"));
    console.log(chalk.gray("    npm install sudocode"));
    console.log();
    console.log(chalk.blue("  Or install the server package directly:"));
    console.log(chalk.gray("    npm install -g @sudocode-ai/local-server"));
    console.log();
    process.exit(1);
  }

  // Set up environment variables
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SUDOCODE_DIR: ctx.outputDir,
  };

  // Only set SUDOCODE_PORT if explicitly provided - otherwise let server scan for available ports
  if (options.port) {
    env.SUDOCODE_PORT = options.port;
  }

  console.log(chalk.blue("Starting sudocode local server..."));
  if (options.port) {
    console.log(chalk.gray(`Port: ${options.port}`));
  }

  if (process.env.DEBUG) {
    console.log(
      chalk.gray(
        `Using ${serverAvailability === "binary" ? "sudocode-server binary" : "npx @sudocode-ai/local-server"}`
      )
    );
  }

  const serverProcess =
    serverAvailability === "binary"
      ? spawn("sudocode-server", [], {
          detached: options.detach || false,
          stdio: options.detach ? "ignore" : "inherit",
          env,
        })
      : spawn("npx", ["--no", "@sudocode-ai/local-server"], {
          detached: options.detach || false,
          stdio: options.detach ? "ignore" : "inherit",
          env,
        });

  if (options.detach) {
    serverProcess.unref();
    console.log(chalk.green(`✓ Server started in background`));
    console.log(chalk.gray(`  Process ID: ${serverProcess.pid}`));
  } else {
    // Handle Ctrl+C gracefully
    process.on("SIGINT", () => {
      console.log(chalk.yellow("\n\nShutting down server..."));
      serverProcess.kill();
      process.exit(0);
    });

    serverProcess.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        console.error(chalk.red(`Server exited with code ${code}`));
        process.exit(code);
      }
    });
  }
}
```

Key points:

- **Server discovery**: The CLI first checks if `sudocode-server` binary exists (installed globally), otherwise falls back to `npx @sudocode-ai/local-server`
- **Environment passing**: `SUDOCODE_DIR` is set to the resolved project's `.sudocode` directory
- **Port handling**: If no port is specified, the server will scan for available ports

## Step 3: Server Entry Point

The server package has two entry points:

1. `server/src/cli.ts` - The binary entry point (just imports index.ts)
2. `server/src/index.ts` - The actual server implementation

Let's look at the server initialization:

```bash
cat server/src/cli.ts
```

```output
#!/usr/bin/env node

/**
 * CLI entry point for sudocode-server
 * Starts the Express server for local development
 */

import './index.js';
```

The CLI entry point is minimal - it just imports `index.ts` which triggers the server startup.

## Step 4: Server Initialization

The server's `index.ts` has two main phases:

1. **initialize()** - Sets up ProjectRegistry and opens the initial project
2. **main()** - Configures Express routes, starts HTTP/WebSocket servers

Let's examine the initialization phase:

```bash
sed -n '1,65p' server/src/index.ts
```

```output
import express, { Request, Response } from "express";
import cors from "cors";
import * as path from "path";
import * as http from "http";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

// ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { createIssuesRouter } from "./routes/issues.js";
import { createSpecsRouter } from "./routes/specs.js";
import { createRelationshipsRouter } from "./routes/relationships.js";
import { createFeedbackRouter } from "./routes/feedback.js";
import { createExecutionsRouter } from "./routes/executions.js";
import { createEditorsRouter } from "./routes/editors.js";
import { createProjectsRouter } from "./routes/projects.js";
import { createConfigRouter } from "./routes/config.js";
import { createPluginsRouter } from "./routes/plugins.js";
import { createImportRouter } from "./routes/import.js";
import { createFilesRouter } from "./routes/files.js";
import { createRepoInfoRouter } from "./routes/repo-info.js";
import { createAgentsRouter } from "./routes/agents.js";
import { createVersionRouter } from "./routes/version.js";
import { createUpdateRouter, setServerInstance } from "./routes/update.js";
import { createWorkflowsRouter } from "./routes/workflows.js";
import { createVoiceRouter } from "./routes/voice.js";
import { ProjectRegistry } from "./services/project-registry.js";
import { ProjectManager } from "./services/project-manager.js";
import { requireProject } from "./middleware/project-context.js";
import {
  initWebSocketServer,
  getWebSocketStats,
  shutdownWebSocketServer,
  getWebSocketServer,
} from "./services/websocket.js";

const app = express();
const DEFAULT_PORT = 3000;
const MAX_PORT_ATTEMPTS = 20;

// Multi-project infrastructure
let projectRegistry!: ProjectRegistry;
let projectManager!: ProjectManager;

// Start file watcher (enabled by default, disable with SUDOCODE_WATCH=false)
const WATCH_ENABLED = process.env.SUDOCODE_WATCH !== "false";

// Async initialization function
async function initialize() {
  try {
    // Initialize ProjectRegistry and ProjectManager for multi-project support
    projectRegistry = new ProjectRegistry();
    await projectRegistry.load();
    console.log(
      `ProjectRegistry loaded from: ${projectRegistry.getConfigPath()}`
    );

    projectManager = new ProjectManager(projectRegistry, {
      watchEnabled: WATCH_ENABLED,
    });

    // Auto-open strategy:
    // 1. If current directory has .sudocode, open it (highest priority)
    // 2. Otherwise, open the most recently opened project (if available)
```

### Project Discovery Strategy

The server uses a smart project discovery strategy:

1. If the current working directory contains `.sudocode/`, that project is opened
2. Otherwise, the most recently opened project from the registry is used
3. If no projects exist, the server starts with no project open

Let's see the rest of the initialization:

```bash
sed -n '66,117p' server/src/index.ts
```

```output
    const currentDir = process.cwd();
    const sudocodeDir = path.join(currentDir, ".sudocode");
    const hasLocalProject = existsSync(sudocodeDir);

    if (hasLocalProject) {
      console.log(
        `Found .sudocode in current directory, opening: ${currentDir}`
      );
      const openResult = await projectManager.openProject(currentDir);
      if (!openResult.ok) {
        const errorMsg =
          "message" in openResult.error!
            ? openResult.error!.message
            : `${openResult.error!.type}`;
        console.warn(`Failed to open local project: ${errorMsg}`);
        console.log("Server will start with no projects open");
      } else {
        const projectInfo = projectRegistry.getProject(openResult.value!.id);
        console.log(
          `Auto-opened local project: ${projectInfo?.name || path.basename(currentDir)}`
        );
      }
    } else {
      // No local project, try most recent
      const recentProjects = projectRegistry.getRecentProjects();
      if (recentProjects.length > 0) {
        const mostRecent = recentProjects[0];
        console.log(
          `Auto-opening most recent project: ${mostRecent.name} (${mostRecent.path})`
        );
        const openResult = await projectManager.openProject(mostRecent.path);
        if (!openResult.ok) {
          const errorMsg =
            "message" in openResult.error!
              ? openResult.error!.message
              : `${openResult.error!.type}`;
          console.warn(`Failed to auto-open most recent project: ${errorMsg}`);
          console.log("Server will start with no projects open");
        } else {
          console.log(`Auto-opened project: ${mostRecent.name}`);
        }
      } else {
        console.log(
          "No recent projects found. Server will start with no projects open"
        );
      }
    }
  } catch (error) {
    console.error("Failed to initialize server:", error);
    process.exit(1);
  }
}
```

## Step 5: ProjectManager.openProject()

When a project is opened, `ProjectManager.openProject()` does extensive setup. This is where most of the magic happens. Let's trace the key parts:

### 5.1 Project Validation and Registration

```bash
sed -n '79,108p' server/src/services/project-manager.ts
```

```output
  async openProject(
    projectPath: string
  ): Promise<Result<ProjectContext, ProjectError>> {
    try {
      // 1. Validate project structure
      const validation = this.validateProject(projectPath);
      if (!validation.ok) {
        return validation as Result<ProjectContext, ProjectError>;
      }

      // 2. Generate or lookup project ID
      const projectId = this.registry.generateProjectId(projectPath);

      // 3. Check if already open
      const existing = this.openProjects.get(projectId);
      if (existing) {
        console.log(`Project already open: ${projectId}`);
        this.registry.updateLastOpened(projectId);
        await this.registry.save();
        return Ok(existing);
      }

      // 4. Initialize database (check cache first)
      const db = await this.getOrCreateDatabase(projectId, projectPath);

      // 5. Initialize all services for this project
      // Get sudocodeDir from registry (which handles SUDOCODE_DIR env var)
      const registeredProject = this.registry.registerProject(projectPath);
      const sudocodeDir = registeredProject.sudocodeDir;
      const logsStore = new ExecutionLogsStore(db);
```

### 5.2 Service Initialization

Each project gets its own isolated set of services:

```bash
sed -n '109,165p' server/src/services/project-manager.ts
```

```output
      const worktreeConfig = getWorktreeConfig(projectPath);
      const worktreeManager = new WorktreeManager(worktreeConfig);

      // NOTE: Worker pool execution is disabled - using in-process execution
      // Worker pool can be re-enabled by uncommenting the ExecutionWorkerPool creation
      // and passing it to ExecutionService and ProjectContext

      // Create execution service without worker pool (will use in-process execution)
      const executionService = new ExecutionService(
        db,
        projectId,
        projectPath,
        undefined,
        logsStore,
        undefined, // No worker pool - use in-process execution
        sudocodeDir
      );

      // 6. Create project context
      const context = new ProjectContext(
        projectId,
        projectPath,
        sudocodeDir,
        db,
        executionService,
        logsStore,
        worktreeManager,
        undefined // No worker pool
      );

      await context.initialize();

      // 7. Initialize workflow engines and broadcast service
      const workflowEventEmitter = new WorkflowEventEmitter();

      // Create lifecycle service for workflow worktree management
      const lifecycleService = new ExecutionLifecycleService(
        db,
        projectPath,
        worktreeManager
      );

      // Create sequential workflow engine
      const sequentialWorkflowEngine = new SequentialWorkflowEngine(
        db,
        executionService,
        lifecycleService,
        projectPath,
        workflowEventEmitter
      );

      // Create orchestrator workflow engine with its dependencies
      const promptBuilder = new WorkflowPromptBuilder();
      const wakeupService = new WorkflowWakeupService({
        db,
        executionService,
        promptBuilder,
```

Key services created for each project:

- **ExecutionLogsStore** - Stores execution output logs
- **WorktreeManager** - Manages git worktrees for isolated execution
- **ExecutionService** - Handles agent execution lifecycle
- **ProjectContext** - Container for all project-specific services
- **WorkflowEventEmitter** - Event bus for workflow events
- **SequentialWorkflowEngine** - Runs sequential workflows
- **OrchestratorWorkflowEngine** - Runs orchestrated multi-agent workflows

### 5.3 File Watcher Setup

```bash
sed -n '244,300p' server/src/services/project-manager.ts
```

```output
      // 8. Start file watcher if enabled
      if (this.watchEnabled) {
        context.watcher = startServerWatcher({
          db,
          baseDir: sudocodeDir,
          onFileChange: (info) => {
            console.log(`[project-manager] File change in ${projectId}`);

            // Broadcast WebSocket updates based on entity type
            if (info.entityType && info.entityId) {
              if (info.entityType === "issue") {
                // Use entity from event if available (optimization)
                if (info.entity) {
                  broadcastIssueUpdate(
                    projectId,
                    info.entityId,
                    "updated",
                    info.entity
                  );
                } else {
                  // Fallback to DB query (for backward compatibility)
                  const issue = getIssueById(db, info.entityId);
                  if (issue) {
                    broadcastIssueUpdate(
                      projectId,
                      info.entityId,
                      "updated",
                      issue
                    );
                  }
                }
              } else if (info.entityType === "spec") {
                // Use entity from event if available (optimization)
                if (info.entity) {
                  broadcastSpecUpdate(
                    projectId,
                    info.entityId,
                    "updated",
                    info.entity
                  );
                } else {
                  // Fallback to DB query (for backward compatibility)
                  const spec = getSpecById(db, info.entityId);
                  if (spec) {
                    broadcastSpecUpdate(
                      projectId,
                      info.entityId,
                      "updated",
                      spec
                    );
                  }
                }
              }
            }
          },
        });
      }
```

The file watcher monitors `.sudocode/` for changes to JSONL and markdown files. When changes are detected, it:

1. Syncs the changes to the database
2. Broadcasts WebSocket updates to connected clients

This enables real-time collaboration and keeps the UI in sync with file changes.

## Step 6: Express Routes Setup

Back in `server/src/index.ts`, the `main()` function sets up all the Express routes:

```bash
sed -n '119,167p' server/src/index.ts
```

```output
async function main() {
  await initialize();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // API Routes

  // Project management routes (no project context required)
  app.use("/api/projects", createProjectsRouter(projectManager, projectRegistry));

  // Entity routes (require project context via X-Project-ID header)
  app.use("/api/issues", requireProject(projectManager), createIssuesRouter());
  app.use("/api/specs", requireProject(projectManager), createSpecsRouter());
  app.use(
    "/api/relationships",
    requireProject(projectManager),
    createRelationshipsRouter()
  );
  app.use(
    "/api/feedback",
    requireProject(projectManager),
    createFeedbackRouter()
  );
  app.use(
    "/api/workflows",
    requireProject(projectManager),
    createWorkflowsRouter()
  );
  app.use("/api/config", requireProject(projectManager), createConfigRouter());
  app.use("/api/plugins", requireProject(projectManager), createPluginsRouter());
  app.use("/api/import", requireProject(projectManager), createImportRouter());
  app.use(
    "/api/repo-info",
    requireProject(projectManager),
    createRepoInfoRouter()
  );

  // File search endpoint (requires project context)
  app.use("/api/files", requireProject(projectManager), createFilesRouter());

  // Agents endpoint - global, not project-specific
  app.use("/api/agents", createAgentsRouter());

  // Voice endpoint - requires project context for config
  app.use("/api/voice", requireProject(projectManager), createVoiceRouter());

  // Project status endpoint - returns ready issues, active executions, running workflows
```

### Route Structure

The API is organized into logical groups:

| Route | Description | Project Required |
|-------|-------------|------------------|
| `/api/projects` | Project management (list, open, close) | No |
| `/api/issues` | Issue CRUD operations | Yes |
| `/api/specs` | Specification CRUD operations | Yes |
| `/api/relationships` | Entity relationships (blocks, implements) | Yes |
| `/api/feedback` | Feedback management | Yes |
| `/api/workflows` | Workflow management | Yes |
| `/api/executions` | Agent execution management | Yes |
| `/api/agents` | Available agents list | No |
| `/api/voice` | Voice/TTS functionality | Yes |
| `/api/files` | File search | Yes |
| `/api/config` | Project configuration | Yes |
| `/api/plugins` | Plugin management | Yes |

The `requireProject` middleware extracts the `X-Project-ID` header and attaches the project context to the request.

## Step 7: HTTP and WebSocket Server Startup

```bash
sed -n '319,390p' server/src/index.ts
```

```output
  // Create HTTP server
  const server = http.createServer(app);

  // Set server instance for update/restart functionality
  setServerInstance(server);

  /**
   * Attempts to start the server (HTTP + WebSocket) on the given port, incrementing if unavailable.
   * Only scans for ports if no explicit PORT was provided.
   * Both HTTP and WebSocket must successfully initialize on the same port.
   */
  async function startServer(
    initialPort: number,
    maxAttempts: number
  ): Promise<number> {
    const explicitPort = process.env.SUDOCODE_PORT;
    const shouldScan = !explicitPort;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const port = initialPort + attempt;
      let httpStarted = false;

      try {
        // First, try to bind the HTTP server
        await new Promise<void>((resolve, reject) => {
          const errorHandler = (err: NodeJS.ErrnoException) => {
            server.removeListener("error", errorHandler);
            server.removeListener("listening", listeningHandler);
            reject(err);
          };

          const listeningHandler = () => {
            server.removeListener("error", errorHandler);
            resolve();
          };

          server.once("error", errorHandler);
          server.once("listening", listeningHandler);
          server.listen(port);
        });

        httpStarted = true;
        console.log(`[server] HTTP server bound to port ${port}`);

        // Now try to initialize WebSocket on the same server
        console.log(`[server] Initializing WebSocket server on port ${port}...`);
        initWebSocketServer(server, "/ws");

        // Verify WebSocket server is accessible
        const wss = getWebSocketServer();
        if (!wss) {
          throw new Error(
            "WebSocket server failed to initialize - server instance is null"
          );
        }

        console.log(
          `[server] WebSocket server successfully initialized on port ${port}`
        );

        // Both HTTP and WebSocket succeeded! Return the port
        return port;
      } catch (err) {
        const error = err as NodeJS.ErrnoException;

        // Clean up if we partially started
        if (httpStarted) {
          console.log(`[server] Cleaning up HTTP server on port ${port}...`);
          await new Promise<void>((resolve) => {
            server.close(() => resolve());
          });
        }

```

### Port Scanning

The server implements intelligent port scanning:

1. If `SUDOCODE_PORT` is set, only that port is tried
2. Otherwise, it scans from port 3000 up to 20 ports
3. Both HTTP and WebSocket must bind successfully

This allows multiple sudocode servers to run simultaneously for different projects.

## Step 8: Server Ready

Once the server is running, you'll see the sudocode ASCII banner:

```bash
sed -n '461,484p' server/src/index.ts
```

```output

  // ASCII art banner (split-line version for narrower terminals)
  console.log(`\n${green}${bold}`);
  console.log(" ███████╗ ██╗   ██╗ ██████╗   ██████╗ ");
  console.log(" ██╔════╝ ██║   ██║ ██╔══██╗ ██╔═══██╗");
  console.log(" ███████╗ ██║   ██║ ██║  ██║ ██║   ██║");
  console.log(" ╚════██║ ██║   ██║ ██║  ██║ ██║   ██║");
  console.log(" ███████║ ╚██████╔╝ ██████╔╝ ╚██████╔╝");
  console.log(" ╚══════╝  ╚═════╝  ╚═════╝   ╚═════╝ ");
  console.log("  ██████╗  ██████╗  ██████╗  ███████╗");
  console.log(" ██╔════╝ ██╔═══██╗ ██╔══██╗ ██╔════╝");
  console.log(" ██║      ██║   ██║ ██║  ██║ █████╗  ");
  console.log(" ██║      ██║   ██║ ██║  ██║ ██╔══╝  ");
  console.log(" ╚██████╗ ╚██████╔╝ ██████╔╝ ███████╗");
  console.log(` ╚═════╝  ╚═════╝  ╚═════╝  ╚══════╝${reset}\n`);

  console.log(
    `${bold}${green}sudocode local server running on: ${makeClickable(
      httpUrl,
      httpUrl
    )}${reset}`
  );
  console.log(`WebSocket server available at: ${makeClickable(wsUrl, wsUrl)}`);

```

## Architecture Summary

The execution flow from CLI to running server:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        sudocode server                               │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  cli/src/cli.ts                                                      │
│  - Commander.js parses "server" command                             │
│  - resolveDirectories() finds .sudocode/                            │
│  - handleServerStart() spawns server process                        │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  server/src/index.ts                                                 │
│  - initialize()                                                      │
│    ├─ ProjectRegistry.load()                                        │
│    └─ ProjectManager.openProject()                                  │
│  - main()                                                           │
│    ├─ Express routes setup                                          │
│    └─ startServer() with port scanning                              │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ProjectManager.openProject()                                        │
│  ├─ validateProject()                                               │
│  ├─ getOrCreateDatabase() (with caching)                            │
│  ├─ Create services:                                                │
│  │   ├─ ExecutionService                                            │
│  │   ├─ ExecutionLogsStore                                          │
│  │   ├─ WorktreeManager                                             │
│  │   ├─ SequentialWorkflowEngine                                    │
│  │   └─ OrchestratorWorkflowEngine                                  │
│  ├─ Create ProjectContext                                           │
│  ├─ Start file watcher                                              │
│  └─ Register project in registry                                    │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Server Running                                                      │
│  ├─ HTTP API on http://localhost:PORT                               │
│  ├─ WebSocket on ws://localhost:PORT/ws                             │
│  └─ Static frontend served from dist/public                         │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Files Reference

| File | Purpose |
|------|---------|
| `cli/src/cli.ts` | CLI entry point, command definitions |
| `cli/src/cli/server-commands.ts` | Server command handler |
| `server/src/index.ts` | Server initialization and Express setup |
| `server/src/services/project-registry.ts` | Persistent project configuration |
| `server/src/services/project-manager.ts` | Project lifecycle management |
| `server/src/services/project-context.ts` | Per-project service container |
| `server/src/services/execution-service.ts` | Agent execution management |
| `server/src/services/websocket.ts` | WebSocket server for real-time updates |
| `server/src/services/watcher.ts` | File system watcher for sync |

## Running the Server Locally

To run the server in development mode from the repository root:

```bash
grep -E '"dev|"start' package.json | head -5
```

```output
    "dev": "npm run dev --workspaces --if-present",
    "dev:server": "SUDOCODE_DIR=$(pwd)/.sudocode npm run dev --workspace=server",
    "dev:frontend": "npm run dev --workspace=frontend",
    "start:server": "SUDOCODE_DIR=$(pwd)/.sudocode npm start --workspace=server",
  "devDependencies": {
```

Development commands:

- `npm run dev:server` - Run server with hot reload using tsx
- `npm run start:server` - Run compiled server
- `npm run build:server` - Build server and frontend

The `SUDOCODE_DIR` environment variable points to the local `.sudocode/` directory for development.

## Conclusion

This walkthrough traced the execution path from the `sudocode server` command through:

1. **CLI parsing** - Commander.js processes the command
2. **Server spawning** - Child process or npx launches the server
3. **Project discovery** - Finds and opens the appropriate project
4. **Service initialization** - Creates per-project services
5. **Express setup** - Configures REST API routes
6. **Server startup** - HTTP and WebSocket servers begin listening

The architecture supports multi-project operation, real-time updates via WebSocket, file system watching for external edits, and isolated execution environments via git worktrees.
