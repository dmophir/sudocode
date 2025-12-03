import { Router, Request, Response } from "express";
import { agentRegistryService } from "../services/agent-registry.js";

export function createAgentsRouter(): Router {
  const router = Router();

  /**
   * GET /api/agents
   * Returns list of available agents with their metadata, implementation status,
   * and executable availability
   *
   * Query parameters:
   * - verify: If 'false', skips verification (default: true)
   * - skipCache: If 'true', bypasses cache and performs fresh verification (default: false)
   */
  router.get("/", async (req: Request, res: Response) => {
    try {
      // Default to verifying agents unless explicitly disabled
      const shouldVerify = req.query.verify !== 'false';
      const skipCache = req.query.skipCache === 'true';

      if (shouldVerify) {
        // Clear cache if skipCache is requested
        if (skipCache) {
          agentRegistryService.clearVerificationCache();
        }

        // Get agents with verification
        const agents = await agentRegistryService.getAvailableAgentsWithVerification();

        res.status(200).json({
          agents: agents.map((agent) => ({
            type: agent.name,
            displayName: agent.displayName,
            supportedModes: agent.supportedModes,
            supportsStreaming: agent.supportsStreaming,
            supportsStructuredOutput: agent.supportsStructuredOutput,
            implemented: agent.implemented,
            available: agent.available,
            executablePath: agent.executablePath,
            verificationError: agent.verificationError,
          })),
        });
      } else {
        // Get agents without verification (faster, but no availability info)
        const agents = agentRegistryService.getAvailableAgents();

        res.status(200).json({
          agents: agents.map((agent) => ({
            type: agent.name,
            displayName: agent.displayName,
            supportedModes: agent.supportedModes,
            supportsStreaming: agent.supportsStreaming,
            supportsStructuredOutput: agent.supportsStructuredOutput,
            implemented: agent.implemented,
          })),
        });
      }
    } catch (error) {
      console.error("Failed to get agents:", error);
      res.status(500).json({ error: "Failed to retrieve agents" });
    }
  });

  return router;
}
