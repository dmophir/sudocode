/**
 * Agent preset tools for MCP server
 */

import { SudocodeClient } from "../client.js";
import type { ToolResponse } from "../types.js";

/**
 * List all agent presets
 */
export async function listAgents(
  client: SudocodeClient,
  args: {
    tag?: string;
    type?: string;
    capability?: string;
  }
): Promise<ToolResponse> {
  try {
    const { execSync } = await import("child_process");
    const { sudocodeDir } = client.getConfig();

    let command = "sudocode agent list --format json";
    if (args.tag) {
      command += ` --tag ${args.tag}`;
    }
    if (args.type) {
      command += ` --type ${args.type}`;
    }
    if (args.capability) {
      command += ` --capability ${args.capability}`;
    }

    const output = execSync(command, {
      cwd: sudocodeDir || process.cwd(),
      encoding: "utf-8",
    });

    const agents = JSON.parse(output);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(agents, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error listing agents: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Show agent preset details
 */
export async function showAgent(
  client: SudocodeClient,
  args: { preset_id: string }
): Promise<ToolResponse> {
  try {
    const { execSync } = await import("child_process");
    const { sudocodeDir } = client.getConfig();

    const output = execSync(
      `sudocode agent show ${args.preset_id} --format json`,
      {
        cwd: sudocodeDir || process.cwd(),
        encoding: "utf-8",
      }
    );

    const agent = JSON.parse(output);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(agent, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error showing agent: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Create new agent preset
 */
export async function createAgent(
  client: SudocodeClient,
  args: {
    preset_id: string;
    name: string;
    description: string;
    agent_type?: string;
    model?: string;
    tools?: string[];
    template?: string;
  }
): Promise<ToolResponse> {
  try {
    const { execSync } = await import("child_process");
    const { sudocodeDir } = client.getConfig();

    let command = `sudocode agent create ${args.preset_id} --name "${args.name}" --description "${args.description}"`;

    if (args.agent_type) {
      command += ` --agent-type ${args.agent_type}`;
    }
    if (args.model) {
      command += ` --model ${args.model}`;
    }
    if (args.tools && args.tools.length > 0) {
      command += ` --tools ${args.tools.join(",")}`;
    }
    if (args.template) {
      command += ` --template ${args.template}`;
    }

    const output = execSync(command, {
      cwd: sudocodeDir || process.cwd(),
      encoding: "utf-8",
    });

    return {
      content: [
        {
          type: "text",
          text: output,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error creating agent: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Export agent preset to another platform
 */
export async function exportAgent(
  client: SudocodeClient,
  args: {
    preset_id: string;
    platform: "claude-code" | "cursor" | "gemini-cli" | "mcp";
    output?: string;
    overwrite?: boolean;
  }
): Promise<ToolResponse> {
  try {
    const { execSync } = await import("child_process");
    const { sudocodeDir } = client.getConfig();

    let command = `sudocode agent export ${args.preset_id} --platform ${args.platform}`;

    if (args.output) {
      command += ` --output ${args.output}`;
    }
    if (args.overwrite) {
      command += " --overwrite";
    }

    const output = execSync(command, {
      cwd: sudocodeDir || process.cwd(),
      encoding: "utf-8",
    });

    return {
      content: [
        {
          type: "text",
          text: output,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error exporting agent: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Generate A2A agent card
 */
export async function generateAgentCard(
  client: SudocodeClient,
  args: {
    preset_id: string;
    service_endpoint: string;
    output?: string;
  }
): Promise<ToolResponse> {
  try {
    const { execSync } = await import("child_process");
    const { sudocodeDir } = client.getConfig();

    let command = `sudocode agent a2a ${args.preset_id} --endpoint ${args.service_endpoint}`;

    if (args.output) {
      command += ` --output ${args.output}`;
    }

    const output = execSync(command, {
      cwd: sudocodeDir || process.cwd(),
      encoding: "utf-8",
    });

    return {
      content: [
        {
          type: "text",
          text: output,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error generating agent card: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Detect platform and auto-configure
 */
export async function detectPlatform(
  client: SudocodeClient
): Promise<ToolResponse> {
  try {
    const { execSync } = await import("child_process");
    const { sudocodeDir } = client.getConfig();

    const output = execSync("sudocode platform detect --format json", {
      cwd: sudocodeDir || process.cwd(),
      encoding: "utf-8",
    });

    const platform = JSON.parse(output);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(platform, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error detecting platform: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Auto-configure for detected platform
 */
export async function autoConfigure(
  client: SudocodeClient
): Promise<ToolResponse> {
  try {
    const { execSync } = await import("child_process");
    const { sudocodeDir } = client.getConfig();

    const output = execSync("sudocode platform auto-configure", {
      cwd: sudocodeDir || process.cwd(),
      encoding: "utf-8",
    });

    return {
      content: [
        {
          type: "text",
          text: output,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error auto-configuring: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
