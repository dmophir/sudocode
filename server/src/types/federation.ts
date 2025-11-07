/**
 * TypeScript types for cross-repository federation
 */

/**
 * Trust levels for remote repositories
 */
export type TrustLevel = 'trusted' | 'verified' | 'untrusted';

/**
 * Sync status for remote repositories
 */
export type SyncStatus = 'synced' | 'stale' | 'unreachable' | 'unknown';

/**
 * Entity types that can be referenced across repos
 */
export type EntityType = 'issue' | 'spec';

/**
 * Relationship types for cross-repo references
 */
export type RelationshipType =
  | 'blocks'
  | 'blocked-by'
  | 'related'
  | 'implements'
  | 'depends-on'
  | 'parent-child'
  | 'discovered-from';

/**
 * Direction of cross-repo communication
 */
export type Direction = 'outgoing' | 'incoming';

/**
 * Request types for cross-repo mutations
 */
export type RequestType = 'create_issue' | 'create_spec' | 'update_issue' | 'query';

/**
 * Status of cross-repo requests
 */
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'completed' | 'failed';

/**
 * Fetch status for cached remote data
 */
export type FetchStatus = 'success' | 'failed' | 'pending';

/**
 * Subscription status
 */
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled';

/**
 * Audit log status
 */
export type AuditStatus = 'success' | 'failed' | 'pending';

/**
 * Remote repository configuration
 */
export interface RemoteRepo {
  url: string; // Primary key - e.g., "github.com/org/repo"
  display_name: string;
  description?: string;
  trust_level: TrustLevel;
  capabilities?: string; // JSON string
  rest_endpoint?: string;
  ws_endpoint?: string;
  git_url?: string;
  last_synced_at?: string;
  sync_status: SyncStatus;
  added_at: string;
  added_by: string;
  auto_sync: boolean;
  sync_interval_minutes: number;
}

/**
 * Permissions for a remote repository
 */
export interface RemotePermissions {
  query?: {
    allowed: boolean;
    entities?: EntityType[];
    filters?: string[];
    exclude_fields?: string[];
  };
  mutate?: {
    allowed: boolean;
    operations?: RequestType[];
    auto_approve_conditions?: string[];
    max_creates_per_day?: number;
  };
  subscribe?: {
    allowed: boolean;
    max_subscriptions?: number;
  };
}

/**
 * Cached data for a remote entity
 */
export interface RemoteEntityCache {
  title: string;
  status: string;
  priority?: number;
  updated_at: string;
  [key: string]: any; // Allow additional fields
}

/**
 * Cross-repository reference
 */
export interface CrossRepoReference {
  local_uuid: string;
  local_entity_type: EntityType;
  remote_repo_url: string;
  remote_entity_type: EntityType;
  remote_id: string; // e.g., "issue-042"
  remote_uuid?: string;
  canonical_ref: string; // e.g., "org/repo#issue-042"
  relationship_type: RelationshipType;
  cached_data?: string; // JSON string
  last_fetched_at?: string;
  fetch_status: FetchStatus;
  created_at: string;
  created_by: string;
}

/**
 * Cross-repository request
 */
export interface CrossRepoRequest {
  request_id: string;
  direction: Direction;
  from_repo: string;
  to_repo: string;
  request_type: RequestType;
  payload: string; // JSON string
  status: RequestStatus;
  requires_approval: boolean;
  approved_by?: string;
  approved_at?: string;
  rejection_reason?: string;
  result?: string; // JSON string
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

/**
 * Cross-repository subscription
 */
export interface CrossRepoSubscription {
  subscription_id: string;
  direction: Direction;
  from_repo: string;
  to_repo: string;
  watch_config: string; // JSON string
  callback_url?: string;
  callback_auth?: string; // JSON string
  status: SubscriptionStatus;
  created_at: string;
  last_event_at?: string;
  event_count: number;
}

/**
 * Cross-repository audit log entry
 */
export interface CrossRepoAuditLog {
  log_id: string;
  operation_type: string;
  direction: Direction;
  local_repo: string;
  remote_repo: string;
  request_id?: string;
  payload?: string; // JSON string
  result?: string; // JSON string
  status: AuditStatus;
  error_message?: string;
  timestamp: string;
  duration_ms?: number;
}

/**
 * A2A Protocol Message Types
 */

/**
 * Base A2A message
 */
export interface A2AMessage {
  type: string;
  from: string; // Repo URL
  to: string; // Repo URL
  timestamp: string;
  message_id?: string;
}

/**
 * Discover message - request capabilities
 */
export interface A2ADiscoverMessage extends A2AMessage {
  type: 'discover';
}

/**
 * Capabilities returned by discover
 */
export interface A2ACapabilities {
  protocols: string[]; // e.g., ["rest", "websocket", "git"]
  operations: string[]; // e.g., ["query_specs", "query_issues", "create_issues"]
  schemas_version: string;
  trust_level?: TrustLevel;
  endpoints: {
    rest?: string;
    ws?: string;
    git?: string;
  };
}

/**
 * Discover response
 */
export interface A2ADiscoverResponse extends A2AMessage {
  type: 'discover_response';
  capabilities: A2ACapabilities;
}

/**
 * Query filters
 */
export interface A2AQueryFilters {
  labels?: string[];
  status?: string | string[];
  priority?: number | number[];
  assignee?: string;
  [key: string]: any;
}

/**
 * Query message - request data
 */
export interface A2AQueryMessage extends A2AMessage {
  type: 'query';
  query: {
    entity: EntityType;
    filters?: A2AQueryFilters;
    include?: string[]; // e.g., ["relationships", "spec_refs"]
    limit?: number;
    offset?: number;
  };
}

/**
 * Query response
 */
export interface A2AQueryResponse extends A2AMessage {
  type: 'query_response';
  results: any[]; // Array of issues or specs
  metadata: {
    total: number;
    limit?: number;
    offset?: number;
    cached_at?: string;
  };
}

/**
 * Mutate message - request state change
 */
export interface A2AMutateMessage extends A2AMessage {
  type: 'mutate';
  operation: 'create_issue' | 'create_spec' | 'update_issue';
  data: {
    title?: string;
    description?: string;
    content?: string;
    priority?: number;
    labels?: string[];
    relationships?: Array<{
      type: RelationshipType;
      remote_ref: string;
    }>;
    [key: string]: any;
  };
  metadata?: {
    request_id: string;
    requester: string;
    auto_approve?: boolean;
  };
}

/**
 * Mutate response
 */
export interface A2AMutateResponse extends A2AMessage {
  type: 'mutate_response';
  status: 'pending_approval' | 'completed' | 'rejected' | 'failed';
  request_id: string;
  approval_url?: string;
  message?: string;
  created?: {
    id: string;
    uuid: string;
    canonical_ref: string;
    url?: string;
  };
  error?: string;
}

/**
 * Subscribe message - request change notifications
 */
export interface A2ASubscribeMessage extends A2AMessage {
  type: 'subscribe';
  watch: {
    entity_type: EntityType;
    entity_id?: string;
    entity_uuid?: string;
    filters?: A2AQueryFilters;
  };
  callback: {
    url: string;
    auth?: {
      type: 'bearer' | 'api_key';
      token: string;
    };
  };
}

/**
 * Subscribe response
 */
export interface A2ASubscribeResponse extends A2AMessage {
  type: 'subscribe_response';
  status: 'subscribed' | 'failed';
  subscription_id?: string;
  message?: string;
  error?: string;
}

/**
 * Event notification
 */
export interface A2AEventMessage extends A2AMessage {
  type: 'event';
  event: {
    type: 'issue_created' | 'issue_updated' | 'issue_closed' | 'spec_created' | 'spec_updated';
    entity: {
      id: string;
      uuid: string;
      canonical_ref: string;
      [key: string]: any;
    };
    changes?: {
      [field: string]: {
        from: any;
        to: any;
      };
    };
    timestamp: string;
  };
}

/**
 * Delegate message - request task handoff
 */
export interface A2ADelegateMessage extends A2AMessage {
  type: 'delegate';
  task: {
    type: 'spec' | 'issue';
    title: string;
    description: string;
    requirements?: any;
    context?: any;
  };
}

/**
 * Delegate response
 */
export interface A2ADelegateResponse extends A2AMessage {
  type: 'delegate_response';
  status: 'accepted' | 'rejected';
  created?: {
    type: 'spec' | 'issue';
    id: string;
    canonical_ref: string;
  };
  estimated_completion?: string;
  assignee?: string;
  rejection_reason?: string;
}

/**
 * Union type for all A2A messages
 */
export type A2AMessageUnion =
  | A2ADiscoverMessage
  | A2ADiscoverResponse
  | A2AQueryMessage
  | A2AQueryResponse
  | A2AMutateMessage
  | A2AMutateResponse
  | A2ASubscribeMessage
  | A2ASubscribeResponse
  | A2AEventMessage
  | A2ADelegateMessage
  | A2ADelegateResponse;

/**
 * Error response format (RFC 7807)
 */
export interface ProblemDetails {
  type: string; // URI reference
  title: string;
  status: number; // HTTP status code
  detail: string;
  instance: string; // URI reference
  [key: string]: any; // Extensions
}
