# Web UI → Copilot CLI → MCP Tools Flow

This document explains how the sudocode Web UI enables users to run GitHub Copilot CLI executions that can interact with specs and issues via MCP tools.

## Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    participant User as 👤 User
    participant WebUI as 🌐 Web UI (React)
    participant Server as 🖥️ Local Server
    participant Worker as ⚙️ Execution Worker
    participant Copilot as 🤖 GitHub Copilot CLI
    participant MCP as 📦 sudocode-mcp
    participant CLI as 🔧 sudocode CLI
    participant DB as 💾 SQLite + JSONL

    rect rgb(240, 248, 255)
        note over User,DB: 1. Open Project
        User->>WebUI: Navigate to ProjectsPage
        WebUI->>Server: POST /api/projects/open
        Server->>DB: Load project config
        Server-->>WebUI: Project opened (id, path)
        WebUI->>WebUI: setCurrentProjectId()
        WebUI->>Server: WebSocket connect with project_id
    end

    rect rgb(255, 248, 240)
        note over User,DB: 2. Start Execution
        User->>WebUI: Click "New Execution" on ExecutionsPage
        WebUI->>WebUI: AdhocExecutionDialog opens
        User->>WebUI: Select agent (copilot), enter prompt
        WebUI->>Server: POST /api/executions
        Server->>Server: ExecutionService.createExecution()
        Server->>DB: Create execution record (status: preparing)
        Server->>Worker: Fork worker process
        Server-->>WebUI: { executionId, status: running }
        WebUI->>Server: Subscribe to execution WebSocket
    end

    rect rgb(248, 255, 240)
        note over User,DB: 3. Spawn Copilot CLI Agent
        Worker->>Worker: Create git worktree
        Worker->>Worker: Inject -w <workDir> into MCP config
        Worker->>Copilot: npx @github/copilot --acp --model <model>
        Note over Worker,Copilot: MCP servers config includes sudocode-mcp
        Copilot->>Copilot: Start session
        Copilot->>Worker: Stream session updates (via ACP)
        Worker->>Server: IPC: execution logs
        Server->>WebUI: WebSocket: execution_log event
    end

    rect rgb(255, 240, 248)
        note over User,DB: 4. Agent Uses MCP Tools
        Copilot->>MCP: Call list_issues tool
        MCP->>CLI: sudocode issue list -w <workDir>
        CLI->>DB: Query issues.jsonl + SQLite
        DB-->>CLI: Issue list
        CLI-->>MCP: JSON response
        MCP-->>Copilot: Issues data

        Copilot->>MCP: Call upsert_issue tool
        MCP->>CLI: sudocode issue create "title" -w <workDir>
        CLI->>DB: Insert into issues.jsonl + SQLite
        DB-->>CLI: Created issue
        CLI-->>MCP: New issue JSON
        MCP-->>Copilot: Issue created confirmation

        Copilot->>MCP: Call show_spec tool
        MCP->>CLI: sudocode spec show s-xxxx -w <workDir>
        CLI->>DB: Read spec from specs.jsonl
        DB-->>CLI: Spec with content
        CLI-->>MCP: Spec JSON
        MCP-->>Copilot: Full spec details
    end

    rect rgb(240, 255, 248)
        note over User,DB: 5. Real-time Updates
        Worker->>Server: IPC: tool calls, messages
        Server->>WebUI: WebSocket: execution_log events
        WebUI->>User: ExecutionMonitor shows progress
        Worker->>Server: IPC: execution complete
        Server->>DB: Update execution (status: completed)
        Server->>WebUI: WebSocket: execution_status_changed
        WebUI->>User: Show completion + code changes
    end
```

## Key Components

| Layer | Component | Purpose |
|-------|-----------|---------|
| **Frontend** | `ProjectsPage` | Browse/open projects from filesystem |
| **Frontend** | `ExecutionsPage` | Start/monitor agent executions |
| **Frontend** | `WebSocketContext` | Real-time updates per project |
| **Server** | `ExecutionService` | Orchestrates execution lifecycle |
| **Server** | `execution-worker.ts` | Isolated worker process per execution |
| **Agent** | `CopilotAdapter` | Builds CLI args for `@github/copilot` |
| **MCP** | `sudocode-mcp` | Exposes `list_issues`, `upsert_issue`, `show_spec`, etc. |
| **CLI** | `sudocode` | Reads/writes JSONL files + SQLite cache |

## Critical Path for MCP Tool Access

1. **Worker injects `-w <worktree_path>`** into `sudocode-mcp` args
2. **MCP server uses that working directory** for all CLI commands
3. This ensures the agent operates on the **correct project's specs/issues**

## Flow Breakdown

### 1. Open Project

The user navigates to the ProjectsPage and selects a project to open. The frontend calls `POST /api/projects/open` which loads the project configuration and returns a project ID. The frontend stores this in `ProjectContext` and establishes a WebSocket connection scoped to that project.

### 2. Start Execution

From the ExecutionsPage, the user clicks "New Execution" which opens `AdhocExecutionDialog`. They select an agent type (e.g., `copilot`) and enter a prompt. The frontend sends `POST /api/executions` which:

- Creates an execution record in the database
- Forks an isolated worker process
- Returns immediately with the execution ID

### 3. Spawn Copilot CLI Agent

The execution worker:

1. Creates a git worktree for isolation
2. Injects the working directory into MCP server configuration
3. Spawns the Copilot CLI via `npx @github/copilot --acp`
4. Streams session updates back to the server via IPC

### 4. Agent Uses MCP Tools

The Copilot agent can call sudocode MCP tools like:

| Tool | CLI Command | Purpose |
|------|-------------|---------|
| `list_issues` | `sudocode issue list` | Get all issues |
| `upsert_issue` | `sudocode issue create/update` | Create or update issues |
| `show_spec` | `sudocode spec show` | Get spec details |
| `list_specs` | `sudocode spec list` | Get all specs |
| `upsert_spec` | `sudocode spec create/update` | Create or update specs |
| `ready` | `sudocode ready` | Get ready work items |
| `link` | `sudocode link` | Create relationships |
| `add_feedback` | `sudocode feedback add` | Add anchored feedback |

### 5. Real-time Updates

All agent activity streams to the frontend via WebSocket:

- `execution_log` events show progress in `ExecutionMonitor`
- `execution_status_changed` events update the execution list
- Code changes are tracked and displayed in `CodeChangesPanel`

## Related Files

- [frontend/src/pages/ProjectsPage.tsx](../frontend/src/pages/ProjectsPage.tsx) - Project selection UI
- [frontend/src/pages/ExecutionsPage.tsx](../frontend/src/pages/ExecutionsPage.tsx) - Execution management UI
- [server/src/workers/execution-worker.ts](../server/src/workers/execution-worker.ts) - Worker process
- [server/src/execution/adapters/copilot-adapter.ts](../server/src/execution/adapters/copilot-adapter.ts) - Copilot CLI adapter
- [mcp/src/server.ts](../mcp/src/server.ts) - MCP server implementation
- [mcp/src/tools/issues.ts](../mcp/src/tools/issues.ts) - Issue MCP tools
- [mcp/src/tools/specs.ts](../mcp/src/tools/specs.ts) - Spec MCP tools
