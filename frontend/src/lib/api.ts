import axios, { AxiosInstance, AxiosError } from 'axios'
import type {
  ApiResponse,
  Issue,
  Spec,
  Relationship,
  IssueFeedback,
  CreateIssueRequest,
  UpdateIssueRequest,
  CreateSpecRequest,
  UpdateSpecRequest,
  CreateRelationshipRequest,
  DeleteRelationshipRequest,
  CreateFeedbackRequest,
  UpdateFeedbackRequest,
  AgentRequest,
  RespondToRequestRequest,
  Pattern,
  AutoResponseConfig,
  AutoResponseStats,
} from '@/types/api'
import type {
  Execution,
  ExecutionPrepareResult,
  PrepareExecutionRequest,
  CreateExecutionRequest,
  CreateFollowUpRequest,
} from '@/types/execution'

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Response interceptor to unwrap ApiResponse
api.interceptors.response.use(
  (response) => {
    const apiResponse = response.data as ApiResponse<any>
    if (!apiResponse.success) {
      const error = new Error(apiResponse.message || 'API request failed')
      ;(error as any).response = {
        data: apiResponse.error_data,
        status: response.status,
      }
      throw error
    }
    return apiResponse.data
  },
  (error: AxiosError) => {
    console.error('API Error:', error)

    // Handle network errors
    if (!error.response) {
      throw new Error('Network error: Please check your connection')
    }

    // Handle HTTP errors
    const status = error.response.status
    if (status === 404) {
      throw new Error('Resource not found')
    } else if (status === 500) {
      throw new Error('Server error: Please try again later')
    }

    throw error
  }
)

// Helper functions
const get = <T>(url: string) => api.get<T, T>(url)
const post = <T>(url: string, data?: any) => api.post<T, T>(url, data)
const put = <T>(url: string, data?: any) => api.put<T, T>(url, data)
const del = (url: string, data?: any) => api.delete(url, data ? { data } : undefined)

/**
 * Issues API
 */
export const issuesApi = {
  getAll: (archived?: boolean) => {
    const params = archived !== undefined ? `?archived=${archived}` : ''
    return get<Issue[]>(`/issues${params}`)
  },
  getById: (id: string) => get<Issue>(`/issues/${id}`),
  create: (data: CreateIssueRequest) => post<Issue>('/issues', data),
  update: (id: string, data: UpdateIssueRequest) => put<Issue>(`/issues/${id}`, data),
  delete: (id: string) => del(`/issues/${id}`),
}

/**
 * Specs API
 */
export const specsApi = {
  getAll: (archived?: boolean) => {
    const params = archived !== undefined ? `?archived=${archived}` : ''
    return get<Spec[]>(`/specs${params}`)
  },
  getById: (id: string) => get<Spec>(`/specs/${id}`),
  create: (data: CreateSpecRequest) => post<Spec>('/specs', data),
  update: (id: string, data: UpdateSpecRequest) => put<Spec>(`/specs/${id}`, data),
  delete: (id: string) => del(`/specs/${id}`),
  getFeedback: (id: string) => get<IssueFeedback[]>(`/feedback?spec_id=${id}`),
}

/**
 * Relationships API
 */
export const relationshipsApi = {
  getForEntity: (entityId: string, entityType: 'issue' | 'spec') =>
    get<Relationship[] | { outgoing: Relationship[]; incoming: Relationship[] }>(
      `/relationships/${entityType}/${entityId}`
    ),
  create: (data: CreateRelationshipRequest) => post<Relationship>('/relationships', data),
  delete: (data: DeleteRelationshipRequest) => del('/relationships', data),
}

/**
 * Feedback API
 */
export const feedbackApi = {
  getForSpec: (specId: string) => get<IssueFeedback[]>(`/feedback?spec_id=${specId}`),
  getById: (id: string) => get<IssueFeedback>(`/feedback/${id}`),
  create: (data: CreateFeedbackRequest) => post<IssueFeedback>('/feedback', data),
  update: (id: string, data: UpdateFeedbackRequest) => put<IssueFeedback>(`/feedback/${id}`, data),
  delete: (id: string) => del(`/feedback/${id}`),
}

/**
 * Executions API
 */
export const executionsApi = {
  // Prepare execution (preview template and gather context)
  prepare: (issueId: string, request?: PrepareExecutionRequest) =>
    post<ExecutionPrepareResult>(`/issues/${issueId}/executions/prepare`, request),

  // Create and start execution
  create: (issueId: string, request: CreateExecutionRequest) =>
    post<Execution>(`/issues/${issueId}/executions`, request),

  // Get execution by ID
  getById: (executionId: string) => get<Execution>(`/executions/${executionId}`),

  // List executions for issue
  list: (issueId: string) => get<Execution[]>(`/issues/${issueId}/executions`),

  // Create follow-up execution
  createFollowUp: (executionId: string, request: CreateFollowUpRequest) =>
    post<Execution>(`/executions/${executionId}/follow-up`, request),

  // Cancel execution
  cancel: (executionId: string) => del(`/executions/${executionId}`),

  // Check if worktree exists for execution
  worktreeExists: (executionId: string) =>
    get<{ exists: boolean }>(`/executions/${executionId}/worktree`),

  // Delete worktree for execution
  deleteWorktree: (executionId: string) => del(`/executions/${executionId}/worktree`),
}

/**
 * Agent Requests API
 */
export const agentRequestsApi = {
  // Get all pending agent requests
  getPending: () => get<AgentRequest[]>('/agent-requests/pending'),

  // Get agent request by ID
  getById: (id: string) => get<AgentRequest>(`/agent-requests/${id}`),

  // Mark request as presented
  markPresented: (id: string) => post<void>(`/agent-requests/${id}/presented`),

  // Respond to request
  respond: (id: string, data: RespondToRequestRequest) =>
    post<void>(`/agent-requests/${id}/respond`, data),

  // Cancel request
  cancel: (id: string) => post<void>(`/agent-requests/${id}/cancel`),

  // Get batches of similar requests
  getBatches: () => get<{ requests: AgentRequest[] }[]>('/agent-requests/batches'),

  // Get statistics
  getStats: () =>
    get<{
      total: number
      by_status: Record<string, number>
      by_type: Record<string, number>
      avg_response_time_ms: number
    }>('/agent-requests/stats'),
}

/**
 * Patterns API
 */
export const patternsApi = {
  // Get all patterns
  getAll: (options?: {
    autoResponseOnly?: boolean
    orderBy?: 'confidence' | 'occurrences' | 'recent'
    limit?: number
  }) => {
    const params = new URLSearchParams()
    if (options?.autoResponseOnly) params.append('autoResponseOnly', 'true')
    if (options?.orderBy) params.append('orderBy', options.orderBy)
    if (options?.limit) params.append('limit', options.limit.toString())
    const query = params.toString()
    return get<Pattern[]>(`/agent-requests/patterns${query ? `?${query}` : ''}`)
  },

  // Get pattern by ID
  getById: (id: string) => get<Pattern>(`/agent-requests/patterns/${id}`),

  // Toggle auto-response for pattern
  setAutoResponse: (id: string, enabled: boolean) =>
    put<void>(`/agent-requests/patterns/${id}/auto-response`, { enabled }),

  // Delete pattern
  delete: (id: string) => del(`/agent-requests/patterns/${id}`),

  // Get auto-response configuration
  getConfig: () => get<AutoResponseConfig>('/agent-requests/auto-response/config'),

  // Update auto-response configuration
  updateConfig: (config: Partial<AutoResponseConfig>) =>
    put<void>('/agent-requests/auto-response/config', config),

  // Get auto-response statistics
  getStats: () => get<AutoResponseStats>('/agent-requests/auto-response/stats'),
}

export default api
