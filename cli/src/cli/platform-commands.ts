/**
 * Platform detection and configuration commands
 */

import * as fs from "fs";
import * as path from "path";
import {
  detectPlatform,
  autoConfigurePlatform,
  getPlatformConfig,
  supportsMCP,
  getMCPConfigPath,
} from "../operations/platform.js";

/**
 * Get sudocode directory
 */
function getSudocodeDir(dir?: string): string {
  if (dir) {
    return dir;
  }

  // Look for .sudocode directory starting from current directory
  let currentDir = process.cwd();
  while (currentDir !== path.parse(currentDir).root) {
    const sudocodeDir = path.join(currentDir, ".sudocode");
    if (fs.existsSync(sudocodeDir)) {
      return sudocodeDir;
    }
    currentDir = path.dirname(currentDir);
  }

  // Default to .sudocode in current directory
  return path.join(process.cwd(), ".sudocode");
}

export interface PlatformDetectOptions {
  format?: "text" | "json";
}

export interface PlatformAutoConfigureOptions {
  force?: boolean;
}

/**
 * Handle platform detect command
 */
export async function handlePlatformDetect(
  options: PlatformDetectOptions
): Promise<void> {
  const platform = detectPlatform();
  const config = getPlatformConfig(platform.type);

  if (options.format === "json") {
    console.log(JSON.stringify({ platform, config }, null, 2));
    return;
  }

  console.log("\n🔍 Platform Detection");
  console.log("━".repeat(60));
  console.log(`Platform:     ${platform.type}`);
  if (platform.version) {
    console.log(`Version:      ${platform.version}`);
  }
  console.log(`Detected by:  ${platform.detected_by.join(", ")}`);

  if (platform.config_paths && Object.keys(platform.config_paths).length > 0) {
    console.log("\n📁 Configuration Paths:");
    for (const [key, value] of Object.entries(platform.config_paths)) {
      console.log(`  ${key}: ${value}`);
    }
  }

  console.log("\n⚙️  Recommended Configuration:");
  console.log(`  Export Format:    ${config.export_format}`);
  if (config.agent_directory) {
    console.log(`  Agent Directory:  ${config.agent_directory}`);
  }
  console.log(`  Auto Export:      ${config.auto_export ? "enabled" : "disabled"}`);
  console.log(`  MCP Integration:  ${config.mcp_integration ? "enabled" : "disabled"}`);

  if (supportsMCP(platform.type)) {
    const mcpPath = getMCPConfigPath(platform.type);
    console.log(`\n🔌 MCP Config Path: ${mcpPath}`);
  }

  console.log();
}

/**
 * Handle platform auto-configure command
 */
export async function handlePlatformAutoConfigure(
  options: PlatformAutoConfigureOptions
): Promise<void> {
  const sudocodeDir = getSudocodeDir();
  const result = autoConfigurePlatform(sudocodeDir);

  console.log("\n⚙️  Platform Auto-Configuration");
  console.log("━".repeat(60));
  console.log(`Platform:  ${result.platform.type}`);
  console.log(`Status:    ${result.success ? "✓ Success" : "✗ Failed"}`);

  if (result.actions.length > 0) {
    console.log("\n📝 Actions Performed:");
    for (const action of result.actions) {
      console.log(`  • ${action}`);
    }
  }

  if (result.errors && result.errors.length > 0) {
    console.log("\n❌ Errors:");
    for (const error of result.errors) {
      console.log(`  • ${error}`);
    }
  }

  console.log();

  if (!result.success) {
    process.exit(1);
  }
}
