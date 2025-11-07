/**
 * A2A Protocol Module
 * Agent-to-Agent communication for cross-repository federation
 */

export { handleDiscover, handleQuery, handleMutate, shouldAutoApprove } from "./handlers.js";
export { createAuditLog, getAuditLogs, getAuditLogsByRequest, getAuditStats, type AuditStats } from "./audit.js";
export { A2AClient, createA2AClient } from "./client.js";
