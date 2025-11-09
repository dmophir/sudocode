import axios, { AxiosInstance, AxiosError } from 'axios'
import type {
  ApiResponse,
  Issue,
  Spec,
  Session,
  ContextBundle,
  ContextBundleItem,
  Relationship,
  IssueFeedback,
  CreateIssueRequest,
  UpdateIssueRequest,
  CreateSpecRequest,
  UpdateSpecRequest,
  CreateSessionRequest,
  UpdateSessionRequest,
  CreateBundleRequest,
  UpdateBundleRequest,
  AddBundleItemRequest,
  CreateRelationshipRequest,
  DeleteRelationshipRequest,
  CreateFeedbackRequest,
  UpdateFeedbackRequest,
} from '@/types/api'
import type {
  Execution,
  ExecutionPrepareResult,
  PrepareExecutionRequest,
  CreateExecutionRequest,
  CreateFollowUpRequest,
  ResumeSessionRequest,
  ForkSessionRequest,
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

  // Resume a previous Claude Code session
  resumeSession: (executionId: string, request: ResumeSessionRequest) =>
    post<Execution>(`/executions/${executionId}/resume`, request),

  // Fork a previous Claude Code session to explore alternatives
  forkSession: (executionId: string, request: ForkSessionRequest) =>
    post<Execution>(`/executions/${executionId}/fork`, request),

  // Cancel execution
  cancel: (executionId: string) => del(`/executions/${executionId}`),

  // Check if worktree exists for execution
  worktreeExists: (executionId: string) =>
    get<{ exists: boolean }>(`/executions/${executionId}/worktree`),

  // Delete worktree for execution
  deleteWorktree: (executionId: string) => del(`/executions/${executionId}/worktree`),
}

/**
 * Sessions API
 */
export const sessionsApi = {
  getAll: (options?: { agent_type?: string; archived?: boolean; limit?: number; offset?: number }) => {
    const params = new URLSearchParams()
    if (options?.agent_type) params.append('agent_type', options.agent_type)
    if (options?.archived !== undefined) params.append('archived', String(options.archived))
    if (options?.limit) params.append('limit', String(options.limit))
    if (options?.offset) params.append('offset', String(options.offset))
    const queryString = params.toString()
    return get<Session[]>(`/sessions${queryString ? '?' + queryString : ''}`)
  },
  getById: (id: string) => get<Session>(`/sessions/${id}`),
  getBySessionId: (sessionId: string) => get<Session>(`/sessions/by-session-id/${sessionId}`),
  create: (data: CreateSessionRequest) => post<Session>('/sessions', data),
  update: (id: string, data: UpdateSessionRequest) => put<Session>(`/sessions/${id}`, data),
  delete: (id: string) => del(`/sessions/${id}`),
}

/**
 * Context Bundles API
 */
export const bundlesApi = {
  getAll: (options?: { archived?: boolean; limit?: number; offset?: number }) => {
    const params = new URLSearchParams()
    if (options?.archived !== undefined) params.append('archived', String(options.archived))
    if (options?.limit) params.append('limit', String(options.limit))
    if (options?.offset) params.append('offset', String(options.offset))
    const queryString = params.toString()
    return get<ContextBundle[]>(`/bundles${queryString ? '?' + queryString : ''}`)
  },
  getById: (id: string) => get<ContextBundle>(`/bundles/${id}`),
  getItems: (bundleId: string) => get<ContextBundleItem[]>(`/bundles/${bundleId}/items`),
  create: (data: CreateBundleRequest) => post<ContextBundle>('/bundles', data),
  update: (id: string, data: UpdateBundleRequest) => put<ContextBundle>(`/bundles/${id}`, data),
  delete: (id: string) => del(`/bundles/${id}`),
  addItem: (bundleId: string, data: Omit<AddBundleItemRequest, 'bundle_id'>) =>
    post<ContextBundleItem>(`/bundles/${bundleId}/items`, data),
  removeItem: (bundleId: string, entityType: string, entityId: string) =>
    del(`/bundles/${bundleId}/items/${entityType}/${entityId}`),
}

export default api
