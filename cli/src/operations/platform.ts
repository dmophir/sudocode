/**
 * Platform detection and auto-configuration
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export type PlatformType =
  | "claude-code"
  | "cursor"
  | "vscode"
  | "gemini-cli"
  | "terminal"
  | "unknown";

export interface PlatformInfo {
  type: PlatformType;
  version?: string;
  detected_by: string[];
  config_paths?: {
    agent_config?: string;
    rules?: string;
    mcp_config?: string;
  };
}

export interface PlatformConfig {
  export_format?: string;
  agent_directory?: string;
  auto_export?: boolean;
  mcp_integration?: boolean;
}

/**
 * Detect the current platform
 */
export function detectPlatform(): PlatformInfo {
  const detectedBy: string[] = [];
  let platformType: PlatformType = "unknown";
  const configPaths: PlatformInfo["config_paths"] = {};

  // Check environment variables
  if (process.env.CLAUDE_CODE) {
    detectedBy.push("CLAUDE_CODE env var");
    platformType = "claude-code";
  } else if (process.env.CURSOR_IDE) {
    detectedBy.push("CURSOR_IDE env var");
    platformType = "cursor";
  } else if (process.env.GEMINI_CLI) {
    detectedBy.push("GEMINI_CLI env var");
    platformType = "gemini-cli";
  } else if (process.env.VSCODE_PID || process.env.TERM_PROGRAM === "vscode") {
    detectedBy.push("VSCODE_PID or TERM_PROGRAM env var");
    platformType = "vscode";
  }

  // Check for Claude Code directory structure
  const claudeDir = path.join(process.cwd(), ".claude");
  if (fs.existsSync(claudeDir)) {
    detectedBy.push(".claude directory exists");
    if (platformType === "unknown") {
      platformType = "claude-code";
    }
    configPaths.agent_config = path.join(claudeDir, "agents");
    configPaths.mcp_config = path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json"
    );
  }

  // Check for Cursor directory structure
  const cursorDir = path.join(process.cwd(), ".cursor");
  if (fs.existsSync(cursorDir)) {
    detectedBy.push(".cursor directory exists");
    if (platformType === "unknown") {
      platformType = "cursor";
    }
    configPaths.rules = path.join(cursorDir, "rules");
  }

  // Check for Gemini CLI config
  const geminiConfig = path.join(os.homedir(), ".gemini", "config.json");
  if (fs.existsSync(geminiConfig)) {
    detectedBy.push(".gemini/config.json exists");
    if (platformType === "unknown") {
      platformType = "gemini-cli";
    }
    configPaths.agent_config = path.join(os.homedir(), ".gemini", "agents");
  }

  // Check for VS Code workspace
  const vscodeDir = path.join(process.cwd(), ".vscode");
  if (fs.existsSync(vscodeDir)) {
    detectedBy.push(".vscode directory exists");
    if (platformType === "unknown") {
      platformType = "vscode";
    }
  }

  // If still unknown, check if running in terminal
  if (platformType === "unknown") {
    if (process.env.TERM || process.stdin.isTTY) {
      detectedBy.push("TTY detected");
      platformType = "terminal";
    }
  }

  // Try to detect versions
  let version: string | undefined;
  if (platformType === "vscode" && process.env.VSCODE_GIT_IPC_HANDLE) {
    // VS Code version detection could be enhanced
    version = "detected";
  }

  return {
    type: platformType,
    version,
    detected_by: detectedBy,
    config_paths: Object.keys(configPaths).length > 0 ? configPaths : undefined,
  };
}

/**
 * Get recommended platform configuration
 */
export function getPlatformConfig(platform: PlatformType): PlatformConfig {
  switch (platform) {
    case "claude-code":
      return {
        export_format: "claude-code",
        agent_directory: ".claude/agents",
        auto_export: true,
        mcp_integration: true,
      };
    case "cursor":
      return {
        export_format: "cursor",
        agent_directory: ".cursor/rules",
        auto_export: true,
        mcp_integration: false,
      };
    case "gemini-cli":
      return {
        export_format: "gemini-cli",
        agent_directory: ".gemini/agents",
        auto_export: true,
        mcp_integration: false,
      };
    case "vscode":
      return {
        export_format: "claude-code",
        agent_directory: ".vscode/agents",
        auto_export: false,
        mcp_integration: true,
      };
    case "terminal":
    case "unknown":
    default:
      return {
        export_format: "claude-code",
        auto_export: false,
        mcp_integration: false,
      };
  }
}

/**
 * Auto-configure based on detected platform
 */
export function autoConfigurePlatform(
  sudocodeDir: string,
  platform?: PlatformInfo
): {
  success: boolean;
  platform: PlatformInfo;
  actions: string[];
  errors?: string[];
} {
  const detectedPlatform = platform || detectPlatform();
  const config = getPlatformConfig(detectedPlatform.type);
  const actions: string[] = [];
  const errors: string[] = [];

  try {
    // Update agents config.json with platform settings
    const agentsConfigPath = path.join(sudocodeDir, "agents", "config.json");
    if (fs.existsSync(agentsConfigPath)) {
      const agentsConfig = JSON.parse(
        fs.readFileSync(agentsConfigPath, "utf-8")
      );

      // Update interoperability settings
      if (!agentsConfig.interoperability) {
        agentsConfig.interoperability = {};
      }

      agentsConfig.interoperability.detected_platform = detectedPlatform.type;
      agentsConfig.interoperability.auto_export = config.auto_export;
      agentsConfig.interoperability.export_format = config.export_format;
      agentsConfig.interoperability.mcp_enabled = config.mcp_integration;

      fs.writeFileSync(
        agentsConfigPath,
        JSON.stringify(agentsConfig, null, 2)
      );
      actions.push(`Updated agents config with platform: ${detectedPlatform.type}`);
    }

    // Create platform-specific directories if needed
    if (config.agent_directory) {
      const platformDir = path.join(process.cwd(), config.agent_directory);
      if (!fs.existsSync(platformDir)) {
        fs.mkdirSync(platformDir, { recursive: true });
        actions.push(`Created platform directory: ${config.agent_directory}`);
      }
    }

    return {
      success: true,
      platform: detectedPlatform,
      actions,
    };
  } catch (error) {
    errors.push(
      error instanceof Error ? error.message : "Unknown error during auto-configuration"
    );
    return {
      success: false,
      platform: detectedPlatform,
      actions,
      errors,
    };
  }
}

/**
 * Check if platform supports MCP integration
 */
export function supportsMCP(platform: PlatformType): boolean {
  return platform === "claude-code" || platform === "vscode";
}

/**
 * Get MCP config path for platform
 */
export function getMCPConfigPath(platform: PlatformType): string | null {
  switch (platform) {
    case "claude-code":
      if (os.platform() === "darwin") {
        return path.join(
          os.homedir(),
          "Library",
          "Application Support",
          "Claude",
          "claude_desktop_config.json"
        );
      } else if (os.platform() === "win32") {
        return path.join(
          os.homedir(),
          "AppData",
          "Roaming",
          "Claude",
          "claude_desktop_config.json"
        );
      } else {
        return path.join(
          os.homedir(),
          ".config",
          "Claude",
          "claude_desktop_config.json"
        );
      }
    case "vscode":
      if (os.platform() === "darwin") {
        return path.join(
          os.homedir(),
          "Library",
          "Application Support",
          "Code",
          "User",
          "globalStorage",
          "rooveterinaryinc.roo-cline",
          "settings",
          "cline_mcp_settings.json"
        );
      } else if (os.platform() === "win32") {
        return path.join(
          os.homedir(),
          "AppData",
          "Roaming",
          "Code",
          "User",
          "globalStorage",
          "rooveterinaryinc.roo-cline",
          "settings",
          "cline_mcp_settings.json"
        );
      } else {
        return path.join(
          os.homedir(),
          ".config",
          "Code",
          "User",
          "globalStorage",
          "rooveterinaryinc.roo-cline",
          "settings",
          "cline_mcp_settings.json"
        );
      }
    default:
      return null;
  }
}
