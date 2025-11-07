import type {
  Issue,
  Spec,
  Relationship,
  IssueFeedback,
  IssueStatus,
  EntityType,
  RelationshipType,
  FeedbackType,
  FeedbackAnchor,
} from '@sudocode-ai/types'

/**
 * API Response wrapper
 */
export interface ApiResponse<T> {
  success: boolean
  data: T | null
  error_data?: any
  message?: string
}

/**
 * Issue API types
 */
export interface CreateIssueRequest {
  title: string
  description?: string
  content?: string
  status?: IssueStatus
  priority?: number
  parent_id?: string
  tags?: string[]
}

export interface UpdateIssueRequest {
  title?: string
  description?: string
  content?: string
  status?: IssueStatus
  priority?: number
  assignee?: string
  parent_id?: string
  archived?: boolean
}

/**
 * Spec API types
 */
export interface CreateSpecRequest {
  title: string
  content?: string
  priority?: number
  parent_id?: string
  tags?: string[]
}

export interface UpdateSpecRequest {
  title?: string
  content?: string
  priority?: number
  parent_id?: string
  archived?: boolean
}

/**
 * Relationship API types
 */
export interface CreateRelationshipRequest {
  from_id: string
  from_type: EntityType
  to_id: string
  to_type: EntityType
  relationship_type: RelationshipType
}

export interface DeleteRelationshipRequest {
  from_id: string
  from_type: EntityType
  to_id: string
  to_type: EntityType
  relationship_type: RelationshipType
}

/**
 * Feedback API types
 */
export interface CreateFeedbackRequest {
  issue_id: string
  spec_id: string
  feedback_type: FeedbackType
  content: string
  anchor?: FeedbackAnchor
}

export interface UpdateFeedbackRequest {
  content?: string
  feedback_type?: FeedbackType
  anchor?: FeedbackAnchor
  dismissed?: boolean
}

/**
 * Agent Request types
 */
export type RequestType = 'confirmation' | 'guidance' | 'choice' | 'input'
export type RequestStatus = 'queued' | 'presented' | 'responded' | 'expired' | 'cancelled'
export type IssuePriority = 'critical' | 'high' | 'medium' | 'low'
export type Urgency = 'blocking' | 'non-blocking'

export interface AgentRequest {
  id: string
  execution_id: string
  issue_id: string

  // Request details
  type: RequestType
  message: string
  context?: any

  // Priority and batching
  issue_priority?: IssuePriority
  urgency?: Urgency
  estimated_impact?: number
  batching_key?: string
  keywords?: string[]
  pattern_signature?: string

  // Response options
  options?: string[]

  // Response
  response_value?: string
  response_timestamp?: string
  response_auto?: boolean
  response_pattern_id?: string

  // Status
  status: RequestStatus

  // Timing
  created_at: string
  presented_at?: string
  responded_at?: string
  expires_at?: string
}

export interface RespondToRequestRequest {
  value: string
}

/**
 * Pattern types
 */
export interface Pattern {
  id: string
  signature: string

  // Pattern characteristics
  request_type: RequestType
  keywords: string[]
  context_patterns: string[]

  // Statistics
  total_occurrences: number
  confidence_score: number
  last_seen: string

  // Auto-response
  suggested_response: string | null
  auto_response_enabled: boolean

  // Metadata
  created_at: string
  updated_at: string
}

export interface AutoResponseConfig {
  enabled: boolean
  min_confidence: number
  min_occurrences: number
  notify_user: boolean
  respect_recent_overrides: boolean
  override_window_days: number
}

export interface AutoResponseStats {
  total_patterns: number
  auto_response_enabled: number
  average_confidence: number
  total_responses: number
}

/**
 * WebSocket message types
 */
export interface WebSocketMessage {
  type:
    | 'issue_created'
    | 'issue_updated'
    | 'issue_deleted'
    | 'spec_created'
    | 'spec_updated'
    | 'spec_deleted'
    | 'relationship_created'
    | 'relationship_deleted'
    | 'feedback_created'
    | 'feedback_updated'
    | 'feedback_deleted'
    | 'agent_request_queued'
    | 'agent_request_presented'
    | 'agent_request_responded'
    | 'agent_request_expired'
    | 'agent_auto_response'
  data: Issue | Spec | Relationship | IssueFeedback | AgentRequest
  timestamp: string
}

export interface WebSocketSubscribeMessage {
  type: 'subscribe'
  entity_type: 'issue' | 'spec' | 'all'
  entity_id?: string
}

/**
 * Re-export types from @sudocode-ai/types
 */
export type {
  Issue,
  Spec,
  Relationship,
  IssueFeedback,
  IssueStatus,
  EntityType,
  RelationshipType,
  FeedbackType,
  FeedbackAnchor,
}
