/**
 * Tests for Agent Registry Service caching functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { agentRegistryService } from "../../../src/services/agent-registry.js";
import * as executableCheck from "../../../src/utils/executable-check.js";

// Mock the executable check module
vi.mock("../../../src/utils/executable-check.js", () => ({
  verifyExecutable: vi.fn(),
  verifyExecutableWithVersion: vi.fn(),
}));

describe("AgentRegistryService - Caching", () => {
  const mockVerifyExecutable = vi.mocked(executableCheck.verifyExecutable);

  beforeEach(() => {
    // Clear all mocks and cache before each test
    vi.clearAllMocks();
    agentRegistryService.clearVerificationCache();
  });

  afterEach(() => {
    // Clean up after tests
    agentRegistryService.clearVerificationCache();
  });

  it("should cache verification results", async () => {
    // Mock a successful verification
    mockVerifyExecutable.mockResolvedValue({
      available: true,
      path: "/usr/local/bin/claude",
    });

    // First call - should hit the verification function
    const result1 = await agentRegistryService.verifyAgent("claude-code");
    expect(mockVerifyExecutable).toHaveBeenCalledTimes(1);
    expect(result1.available).toBe(true);

    // Second call - should use cached result
    const result2 = await agentRegistryService.verifyAgent("claude-code");
    expect(mockVerifyExecutable).toHaveBeenCalledTimes(1); // Still 1, not called again
    expect(result2.available).toBe(true);
    expect(result2.path).toBe("/usr/local/bin/claude");
  });

  it("should bypass cache when skipCache is true", async () => {
    // Mock a successful verification
    mockVerifyExecutable.mockResolvedValue({
      available: true,
      path: "/usr/local/bin/claude",
    });

    // First call - should hit the verification function
    await agentRegistryService.verifyAgent("claude-code");
    expect(mockVerifyExecutable).toHaveBeenCalledTimes(1);

    // Second call with skipCache - should call verification again
    await agentRegistryService.verifyAgent("claude-code", true);
    expect(mockVerifyExecutable).toHaveBeenCalledTimes(2);
  });

  it("should cache different agents separately", async () => {
    // Mock successful verifications for different agents
    mockVerifyExecutable
      .mockResolvedValueOnce({
        available: true,
        path: "/usr/local/bin/claude",
      })
      .mockResolvedValueOnce({
        available: true,
        path: "/usr/local/bin/copilot",
      });

    // Verify two different agents
    const result1 = await agentRegistryService.verifyAgent("claude-code");
    const result2 = await agentRegistryService.verifyAgent("copilot");

    expect(mockVerifyExecutable).toHaveBeenCalledTimes(2);
    expect(result1.path).toBe("/usr/local/bin/claude");
    expect(result2.path).toBe("/usr/local/bin/copilot");

    // Verify again - should use cached results
    await agentRegistryService.verifyAgent("claude-code");
    await agentRegistryService.verifyAgent("copilot");
    expect(mockVerifyExecutable).toHaveBeenCalledTimes(2); // Still 2
  });

  it("should cache error results", async () => {
    // Mock a failed verification
    mockVerifyExecutable.mockResolvedValue({
      available: false,
      error: "Executable 'claude' not found in PATH",
    });

    // First call - should hit the verification function
    const result1 = await agentRegistryService.verifyAgent("claude-code");
    expect(mockVerifyExecutable).toHaveBeenCalledTimes(1);
    expect(result1.available).toBe(false);

    // Second call - should use cached error result
    const result2 = await agentRegistryService.verifyAgent("claude-code");
    expect(mockVerifyExecutable).toHaveBeenCalledTimes(1); // Still 1
    expect(result2.available).toBe(false);
  });

  it("should clear cache for specific agent", async () => {
    // Mock successful verifications
    mockVerifyExecutable.mockResolvedValue({
      available: true,
      path: "/usr/local/bin/claude",
    });

    // Verify and cache
    await agentRegistryService.verifyAgent("claude-code");
    expect(mockVerifyExecutable).toHaveBeenCalledTimes(1);

    // Clear cache for specific agent
    agentRegistryService.clearVerificationCache("claude-code");

    // Verify again - should call verification function again
    await agentRegistryService.verifyAgent("claude-code");
    expect(mockVerifyExecutable).toHaveBeenCalledTimes(2);
  });

  it("should clear all cache when no agent specified", async () => {
    // Mock successful verifications
    mockVerifyExecutable.mockResolvedValue({
      available: true,
      path: "/usr/local/bin/claude",
    });

    // Verify multiple agents
    await agentRegistryService.verifyAgent("claude-code");
    await agentRegistryService.verifyAgent("copilot");
    expect(mockVerifyExecutable).toHaveBeenCalledTimes(2);

    // Clear all cache
    agentRegistryService.clearVerificationCache();

    // Verify again - should call verification functions again
    await agentRegistryService.verifyAgent("claude-code");
    await agentRegistryService.verifyAgent("copilot");
    expect(mockVerifyExecutable).toHaveBeenCalledTimes(4);
  });

  it("should use cache for getAvailableAgentsWithVerification", async () => {
    // Mock successful verifications
    mockVerifyExecutable.mockResolvedValue({
      available: true,
      path: "/usr/local/bin/claude",
    });

    // First call - should verify all agents
    await agentRegistryService.getAvailableAgentsWithVerification();
    const firstCallCount = mockVerifyExecutable.mock.calls.length;
    expect(firstCallCount).toBeGreaterThan(0);

    // Second call - should use cached results for all agents
    await agentRegistryService.getAvailableAgentsWithVerification();
    expect(mockVerifyExecutable).toHaveBeenCalledTimes(firstCallCount); // Same count
  });
});
