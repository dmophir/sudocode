/**
 * MCP tools for cross-repository federation
 */

import { SudocodeClient } from "../client.js";

// Tool parameter types

export interface QueryRemoteRepoParams {
  remote_url: string;
  query: {
    entity_type: "issue" | "spec";
    filters?: {
      status?: string;
      priority?: number;
      archived?: boolean;
    };
  };
}

export interface CreateCrossRepoRequestParams {
  remote_url: string;
  request_type: "query_issue" | "query_spec" | "create_issue" | "update_issue" | "create_spec" | "update_spec";
  payload: any;
  metadata?: {
    requester?: string;
    priority?: number;
    reason?: string;
  };
}

export interface ListCrossRepoRequestsParams {
  direction?: "outgoing" | "incoming";
  status?: "pending" | "approved" | "rejected" | "completed" | "failed";
  limit?: number;
}

export interface ApproveCrossRepoRequestParams {
  request_id: string;
  response_data?: any;
}

export interface RejectCrossRepoRequestParams {
  request_id: string;
  reason?: string;
}

export interface ListSubscriptionsParams {
  remote_repo?: string;
  active?: boolean;
}

export interface CreateSubscriptionParams {
  remote_repo: string;
  entity_type: "issue" | "spec" | "*";
  entity_id?: string;
  events: string[];
  webhook_url?: string;
}

export interface DeleteSubscriptionParams {
  subscription_id: string;
}

export interface ListRemoteReposParams {
  trust_level?: "trusted" | "verified" | "untrusted";
}

export interface AddRemoteRepoParams {
  url: string;
  display_name: string;
  trust_level?: "trusted" | "verified" | "untrusted";
  auto_sync?: boolean;
}

// Tool implementations

/**
 * Query a remote repository for issues or specs
 */
export async function queryRemoteRepo(
  client: SudocodeClient,
  params: QueryRemoteRepoParams
): Promise<any> {
  const args = ["federation", "query", params.remote_url];
  args.push("--entity-type", params.query.entity_type);

  if (params.query.filters?.status) {
    args.push("--status", params.query.filters.status);
  }
  if (params.query.filters?.priority !== undefined) {
    args.push("--priority", params.query.filters.priority.toString());
  }
  if (params.query.filters?.archived !== undefined) {
    args.push("--archived", params.query.filters.archived.toString());
  }

  return await client.exec(args);
}

/**
 * Create a cross-repository request
 */
export async function createCrossRepoRequest(
  client: SudocodeClient,
  params: CreateCrossRepoRequestParams
): Promise<any> {
  const args = ["federation", "request", params.remote_url];
  args.push("--type", params.request_type);
  args.push("--payload", JSON.stringify(params.payload));

  if (params.metadata?.requester) {
    args.push("--requester", params.metadata.requester);
  }
  if (params.metadata?.priority !== undefined) {
    args.push("--priority", params.metadata.priority.toString());
  }
  if (params.metadata?.reason) {
    args.push("--reason", params.metadata.reason);
  }

  return await client.exec(args);
}

/**
 * List cross-repository requests
 */
export async function listCrossRepoRequests(
  client: SudocodeClient,
  params: ListCrossRepoRequestsParams = {}
): Promise<any[]> {
  const args = ["federation", "requests", "list"];

  if (params.direction) {
    args.push("--direction", params.direction);
  }
  if (params.status) {
    args.push("--status", params.status);
  }
  if (params.limit !== undefined) {
    args.push("--limit", params.limit.toString());
  }

  return await client.exec(args);
}

/**
 * Approve a cross-repository request
 */
export async function approveCrossRepoRequest(
  client: SudocodeClient,
  params: ApproveCrossRepoRequestParams
): Promise<any> {
  const args = ["federation", "requests", "approve", params.request_id];

  if (params.response_data) {
    args.push("--response", JSON.stringify(params.response_data));
  }

  return await client.exec(args);
}

/**
 * Reject a cross-repository request
 */
export async function rejectCrossRepoRequest(
  client: SudocodeClient,
  params: RejectCrossRepoRequestParams
): Promise<any> {
  const args = ["federation", "requests", "reject", params.request_id];

  if (params.reason) {
    args.push("--reason", params.reason);
  }

  return await client.exec(args);
}

/**
 * List active subscriptions
 */
export async function listSubscriptions(
  client: SudocodeClient,
  params: ListSubscriptionsParams = {}
): Promise<any[]> {
  const args = ["federation", "subscriptions", "list"];

  if (params.remote_repo) {
    args.push("--remote-repo", params.remote_repo);
  }
  if (params.active !== undefined) {
    args.push("--active", params.active.toString());
  }

  return await client.exec(args);
}

/**
 * Create a new subscription to a remote repository
 */
export async function createSubscription(
  client: SudocodeClient,
  params: CreateSubscriptionParams
): Promise<any> {
  const args = ["federation", "subscriptions", "create"];
  args.push("--remote-repo", params.remote_repo);
  args.push("--entity-type", params.entity_type);
  args.push("--events", params.events.join(","));

  if (params.entity_id) {
    args.push("--entity-id", params.entity_id);
  }
  if (params.webhook_url) {
    args.push("--webhook-url", params.webhook_url);
  }

  return await client.exec(args);
}

/**
 * Delete a subscription
 */
export async function deleteSubscription(
  client: SudocodeClient,
  params: DeleteSubscriptionParams
): Promise<any> {
  const args = ["federation", "subscriptions", "delete", params.subscription_id];
  return await client.exec(args);
}

/**
 * List configured remote repositories
 */
export async function listRemoteRepos(
  client: SudocodeClient,
  params: ListRemoteReposParams = {}
): Promise<any[]> {
  const args = ["federation", "remote", "list"];

  if (params.trust_level) {
    args.push("--trust-level", params.trust_level);
  }

  return await client.exec(args);
}

/**
 * Add a new remote repository
 */
export async function addRemoteRepo(
  client: SudocodeClient,
  params: AddRemoteRepoParams
): Promise<any> {
  const args = ["federation", "remote", "add", params.url];
  args.push("--name", params.display_name);

  if (params.trust_level) {
    args.push("--trust-level", params.trust_level);
  }
  if (params.auto_sync !== undefined) {
    args.push("--auto-sync", params.auto_sync.toString());
  }

  return await client.exec(args);
}
