import { existsSync, readFileSync, writeFileSync } from "fs";
import * as path from "path";
import type { LocalConfig } from "@sudocode-ai/types";

/**
 * Read local config from .sudocode/config.local.json
 */
export function readLocalConfig(sudocodeDir: string): LocalConfig {
  const configPath = path.join(sudocodeDir, "config.local.json");
  if (!existsSync(configPath)) {
    return {};
  }
  return JSON.parse(readFileSync(configPath, "utf-8")) as LocalConfig;
}

/**
 * Write local config to .sudocode/config.local.json
 */
export function writeLocalConfig(
  sudocodeDir: string,
  config: LocalConfig
): void {
  const configPath = path.join(sudocodeDir, "config.local.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

/**
 * Update local config with partial values (merges with existing)
 */
export function updateLocalConfig(
  sudocodeDir: string,
  updates: Partial<LocalConfig>
): LocalConfig {
  const existing = readLocalConfig(sudocodeDir);
  const updated = { ...existing, ...updates };
  writeLocalConfig(sudocodeDir, updated);
  return updated;
}
