/**
 * A2A (Agent-to-Agent) protocol commands
 */

import * as fs from "fs";
import * as path from "path";
import {
  generateAgentCard,
  exportAgentCard,
  exportAllAgentCards,
  createAgentRegistry,
  enableA2ASupport,
} from "../operations/a2a.js";
import { getAgentPreset } from "../operations/agents.js";

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

export interface A2AGenerateOptions {
  endpoint: string;
  output?: string;
  provider?: string;
  providerUrl?: string;
}

export interface A2AExportAllOptions {
  endpoint: string;
  outputDir?: string;
  createRegistry?: boolean;
}

export interface A2AEnableOptions {
  endpoint: string;
}

/**
 * Handle A2A generate agent card command
 */
export async function handleA2AGenerate(
  presetId: string,
  options: A2AGenerateOptions
): Promise<void> {
  const sudocodeDir = getSudocodeDir();
  const preset = getAgentPreset(sudocodeDir, presetId);

  if (!preset) {
    console.error(`❌ Agent preset not found: ${presetId}`);
    process.exit(1);
  }

  console.log("\n🤝 Generating A2A Agent Card");
  console.log("━".repeat(60));
  console.log(`Agent:    ${preset.name}`);
  console.log(`Endpoint: ${options.endpoint}`);

  const provider = options.provider || options.providerUrl
    ? {
        name: options.provider || "sudocode",
        url: options.providerUrl,
      }
    : undefined;

  const agentCard = generateAgentCard(preset, options.endpoint, { provider });

  const outputPath = exportAgentCard(agentCard, options.output);

  console.log(`\n✓ Agent card generated: ${outputPath}`);
  console.log(`\nAgent Card Preview:`);
  console.log(JSON.stringify(agentCard, null, 2));
  console.log();
}

/**
 * Handle A2A export all command
 */
export async function handleA2AExportAll(
  options: A2AExportAllOptions
): Promise<void> {
  const sudocodeDir = getSudocodeDir();

  console.log("\n🤝 Exporting All Agent Cards");
  console.log("━".repeat(60));

  const paths = exportAllAgentCards(
    sudocodeDir,
    options.endpoint,
    options.outputDir
  );

  console.log(`\n✓ Exported ${paths.length} agent cards:`);
  for (const p of paths) {
    console.log(`  • ${p}`);
  }

  if (options.createRegistry) {
    const registryPath = createAgentRegistry(
      sudocodeDir,
      options.endpoint,
      options.outputDir
        ? path.join(options.outputDir, "agent-registry.json")
        : undefined
    );
    console.log(`\n✓ Created agent registry: ${registryPath}`);
  }

  console.log();
}

/**
 * Handle A2A enable command
 */
export async function handleA2AEnable(
  presetId: string,
  options: A2AEnableOptions
): Promise<void> {
  const sudocodeDir = getSudocodeDir();

  console.log("\n🤝 Enabling A2A Support");
  console.log("━".repeat(60));
  console.log(`Agent:    ${presetId}`);
  console.log(`Endpoint: ${options.endpoint}`);

  const result = enableA2ASupport(sudocodeDir, presetId, options.endpoint);

  if (result.success) {
    console.log(`\n✓ A2A support enabled`);
    console.log(`  Agent card: ${result.agentCardPath}`);
    console.log(
      `\n📋 Next steps:`
    );
    console.log(
      `  1. The agent card is available at: ${result.agentCardPath}`
    );
    console.log(
      `  2. Ensure your A2A service is running at: ${options.endpoint}`
    );
    console.log(
      `  3. Other agents can discover this agent via the agent card`
    );
  } else {
    console.error(`\n❌ Failed to enable A2A support: ${result.error}`);
    process.exit(1);
  }

  console.log();
}

/**
 * Handle A2A registry command
 */
export async function handleA2ARegistry(
  endpoint: string,
  options: { output?: string }
): Promise<void> {
  const sudocodeDir = getSudocodeDir();

  console.log("\n🤝 Creating Agent Registry");
  console.log("━".repeat(60));

  const registryPath = createAgentRegistry(
    sudocodeDir,
    endpoint,
    options.output
  );

  console.log(`\n✓ Agent registry created: ${registryPath}`);
  console.log(
    `\n🌐 Registry is available at: ${endpoint}/.well-known/agent-registry.json`
  );
  console.log();
}
