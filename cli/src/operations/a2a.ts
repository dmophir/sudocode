/**
 * A2A (Agent-to-Agent) Protocol Support
 * Implements agent discovery and communication using A2A standard
 */

import * as fs from "fs";
import * as path from "path";
import type { AgentPreset } from "@sudocode-ai/types";
import { getAgentPreset, listAgentPresets } from "./agents.js";

/**
 * A2A Agent Card - JSON document describing agent capabilities
 * Based on A2A Protocol specification
 */
export interface A2AAgentCard {
  /** Agent identity */
  name: string;
  description: string;
  provider?: {
    name: string;
    url?: string;
  };

  /** Service endpoint */
  serviceEndpoint: string;

  /** A2A protocol capabilities */
  a2aCapabilities?: {
    streaming?: boolean;
    pushNotifications?: boolean;
    batch?: boolean;
  };

  /** Authentication requirements */
  authentication?: {
    scheme: "Bearer" | "OAuth2" | "ApiKey" | "None";
    tokenUrl?: string;
    authorizationUrl?: string;
  };

  /** Agent skills - what the agent can do */
  skills: A2ASkill[];

  /** Protocol version */
  protocolVersion: string;
}

/**
 * A2A Skill definition
 */
export interface A2ASkill {
  id: string;
  name: string;
  description: string;
  inputSchema?: Record<string, any>;
  outputSchema?: Record<string, any>;
  examples?: Array<{
    input: any;
    output: any;
  }>;
}

/**
 * A2A JSON-RPC 2.0 Request
 */
export interface A2ARequest {
  jsonrpc: "2.0";
  method: string;
  params?: any;
  id: string | number;
}

/**
 * A2A JSON-RPC 2.0 Response
 */
export interface A2AResponse {
  jsonrpc: "2.0";
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: string | number;
}

/**
 * Generate Agent Card for a sudocode agent preset
 */
export function generateAgentCard(
  preset: AgentPreset,
  serviceEndpoint: string,
  options?: {
    provider?: { name: string; url?: string };
    authentication?: A2AAgentCard["authentication"];
  }
): A2AAgentCard {
  // Convert agent capabilities to A2A skills
  const skills: A2ASkill[] = [];

  // Add capabilities as skills
  if (preset.config.capabilities) {
    for (const capability of preset.config.capabilities) {
      skills.push({
        id: capability,
        name: capability
          .split("-")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" "),
        description: `Provides ${capability} capability`,
      });
    }
  }

  // Add a general execution skill
  skills.push({
    id: "execute-task",
    name: "Execute Task",
    description: `Execute a task using the ${preset.name} agent`,
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", description: "The task to execute" },
        context: { type: "object", description: "Additional context" },
      },
      required: ["task"],
    },
    outputSchema: {
      type: "object",
      properties: {
        result: { type: "string", description: "The execution result" },
        status: {
          type: "string",
          enum: ["success", "error"],
          description: "Execution status",
        },
      },
    },
  });

  return {
    name: preset.name,
    description: preset.description,
    provider: options?.provider || {
      name: "sudocode",
      url: "https://github.com/sudocode-ai/sudocode",
    },
    serviceEndpoint,
    a2aCapabilities: {
      streaming: false,
      pushNotifications: false,
      batch: false,
    },
    authentication: options?.authentication || {
      scheme: "None",
    },
    skills,
    protocolVersion: "0.2.5",
  };
}

/**
 * Generate Agent Cards for all presets
 */
export function generateAllAgentCards(
  sudocodeDir: string,
  baseServiceEndpoint: string
): A2AAgentCard[] {
  const presets = listAgentPresets(sudocodeDir);
  return presets.map((preset) =>
    generateAgentCard(preset, `${baseServiceEndpoint}/agents/${preset.id}`)
  );
}

/**
 * Export Agent Card to .well-known/agent-card.json
 */
export function exportAgentCard(
  agentCard: A2AAgentCard,
  outputPath?: string
): string {
  const defaultPath = path.join(
    process.cwd(),
    ".well-known",
    "agent-card.json"
  );
  const finalPath = outputPath || defaultPath;

  // Ensure directory exists
  const dir = path.dirname(finalPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write agent card
  fs.writeFileSync(finalPath, JSON.stringify(agentCard, null, 2));

  return finalPath;
}

/**
 * Export agent cards for all presets
 */
export function exportAllAgentCards(
  sudocodeDir: string,
  baseServiceEndpoint: string,
  outputDir?: string
): string[] {
  const cards = generateAllAgentCards(sudocodeDir, baseServiceEndpoint);
  const paths: string[] = [];

  for (const card of cards) {
    const agentId = card.serviceEndpoint.split("/").pop();
    const outputPath = outputDir
      ? path.join(outputDir, `${agentId}.agent-card.json`)
      : path.join(
          process.cwd(),
          ".well-known",
          "agents",
          `${agentId}.agent-card.json`
        );

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(card, null, 2));
    paths.push(outputPath);
  }

  return paths;
}

/**
 * Create A2A registry file listing all available agents
 */
export function createAgentRegistry(
  sudocodeDir: string,
  baseServiceEndpoint: string,
  outputPath?: string
): string {
  const cards = generateAllAgentCards(sudocodeDir, baseServiceEndpoint);

  const registry = {
    version: "1.0.0",
    agents: cards.map((card) => ({
      id: card.serviceEndpoint.split("/").pop(),
      name: card.name,
      description: card.description,
      serviceEndpoint: card.serviceEndpoint,
      agentCardUrl: `${baseServiceEndpoint}/.well-known/agents/${card.serviceEndpoint.split("/").pop()}.agent-card.json`,
      capabilities: card.skills.map((s) => s.id),
    })),
  };

  const defaultPath = path.join(
    process.cwd(),
    ".well-known",
    "agent-registry.json"
  );
  const finalPath = outputPath || defaultPath;

  const dir = path.dirname(finalPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(finalPath, JSON.stringify(registry, null, 2));

  return finalPath;
}

/**
 * Handle A2A JSON-RPC request
 */
export async function handleA2ARequest(
  request: A2ARequest,
  sudocodeDir: string
): Promise<A2AResponse> {
  try {
    switch (request.method) {
      case "agent.info":
        return {
          jsonrpc: "2.0",
          result: await handleAgentInfo(request.params, sudocodeDir),
          id: request.id,
        };

      case "agent.execute":
        return {
          jsonrpc: "2.0",
          result: await handleAgentExecute(request.params, sudocodeDir),
          id: request.id,
        };

      case "agent.list":
        return {
          jsonrpc: "2.0",
          result: await handleAgentList(sudocodeDir),
          id: request.id,
        };

      default:
        return {
          jsonrpc: "2.0",
          error: {
            code: -32601,
            message: "Method not found",
            data: { method: request.method },
          },
          id: request.id,
        };
    }
  } catch (error) {
    return {
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: "Internal error",
        data: error instanceof Error ? error.message : String(error),
      },
      id: request.id,
    };
  }
}

/**
 * Handle agent.info request
 */
async function handleAgentInfo(
  params: any,
  sudocodeDir: string
): Promise<any> {
  const { agentId } = params;
  const preset = getAgentPreset(sudocodeDir, agentId);

  if (!preset) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  return {
    id: preset.id,
    name: preset.name,
    description: preset.description,
    version: preset.version,
    capabilities: preset.config.capabilities || [],
    tools: preset.config.tools || [],
    model: preset.config.model,
  };
}

/**
 * Handle agent.execute request
 */
async function handleAgentExecute(
  params: any,
  sudocodeDir: string
): Promise<any> {
  const { agentId, task, context } = params;
  const preset = getAgentPreset(sudocodeDir, agentId);

  if (!preset) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  // This is a stub - actual execution would integrate with sudocode execution system
  return {
    status: "success",
    message: `Agent ${preset.name} would execute: ${task}`,
    agent: preset.id,
    note: "Full execution integration requires server-side implementation",
  };
}

/**
 * Handle agent.list request
 */
async function handleAgentList(sudocodeDir: string): Promise<any> {
  const presets = listAgentPresets(sudocodeDir);

  return {
    agents: presets.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      capabilities: p.config.capabilities || [],
    })),
  };
}

/**
 * Enable A2A support for a preset
 */
export function enableA2ASupport(
  sudocodeDir: string,
  presetId: string,
  serviceEndpoint: string
): {
  success: boolean;
  agentCardPath?: string;
  error?: string;
} {
  try {
    const preset = getAgentPreset(sudocodeDir, presetId);
    if (!preset) {
      return {
        success: false,
        error: `Agent preset not found: ${presetId}`,
      };
    }

    // Update preset config to include A2A protocol
    if (!preset.config.protocols) {
      preset.config.protocols = [];
    }
    if (!preset.config.protocols.includes("a2a")) {
      preset.config.protocols.push("a2a");
    }

    // Generate and export agent card
    const agentCard = generateAgentCard(preset, serviceEndpoint);
    const agentCardPath = exportAgentCard(
      agentCard,
      path.join(
        process.cwd(),
        ".well-known",
        "agents",
        `${presetId}.agent-card.json`
      )
    );

    return {
      success: true,
      agentCardPath,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
