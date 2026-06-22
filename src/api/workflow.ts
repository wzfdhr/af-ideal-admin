import request from '@/api/request'
import {
  validateWorkflowSchema,
  type WorkflowSchema,
} from '@/components/workflow-designer/schema'

export type WorkflowDefinitionStatus = 'draft' | 'published' | 'disabled'
export type WorkflowInstanceStatus = 'running' | 'completed' | 'withdrawn'
export type WorkflowTaskStatus = 'pending' | 'approved' | 'rejected'
export type WorkflowHistoryAction =
  | 'start'
  | 'approve'
  | 'reject'
  | 'transfer'
  | 'withdraw'

export interface WorkflowDefinitionRecord {
  id: string
  name: string
  schema: WorkflowSchema
  status: WorkflowDefinitionStatus
  version: number
  createdAt: string
  updatedAt: string
  publishedAt?: string
}

export interface WorkflowDefinitionQuery {
  current: number
  pageSize: number
  keyword?: string
  status?: WorkflowDefinitionStatus
}

export interface WorkflowPageResult<T> {
  list: T[]
  total: number
}

export interface CreateWorkflowDefinitionPayload {
  name: string
  schema: unknown
}

export interface WorkflowDefinitionMutationResult {
  id: string
  name?: string
  schema?: WorkflowSchema
  status?: WorkflowDefinitionStatus
  version?: number
}

export interface StartWorkflowInstancePayload {
  formId?: string
  businessKey?: string
  values?: Record<string, unknown>
}

export interface WorkflowInstanceRecord {
  id: string
  workflowId: string
  workflowName: string
  formId?: string
  businessKey?: string
  status: WorkflowInstanceStatus
  starterId: string
  values: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface WorkflowTaskRecord {
  id: string
  instanceId: string
  workflowId: string
  workflowName: string
  nodeId: string
  nodeName: string
  assignee: string
  status: WorkflowTaskStatus
  businessKey?: string
  createdAt: string
  updatedAt: string
}

export interface WorkflowTaskQuery {
  current: number
  pageSize: number
  keyword?: string
}

export interface WorkflowActionPayload {
  comment?: string
}

export interface WorkflowTransferPayload extends WorkflowActionPayload {
  targetUserId: string
}

export interface WorkflowHistoryRecord {
  id: string
  instanceId: string
  taskId?: string
  action: WorkflowHistoryAction
  operatorId: string
  targetUserId?: string
  comment?: string
  createdAt: string
}

export const fetchWorkflowDefinitions = async (
  params: WorkflowDefinitionQuery
) => {
  const response = await request.get<
    WorkflowPageResult<WorkflowDefinitionRecord>
  >('/workflows', {
    params,
  })
  return response.data
}

export const getWorkflowDefinition = async (id: string) => {
  const response = await request.get<WorkflowDefinitionRecord>(
    `/workflows/${id}`
  )
  return response.data
}

export const createWorkflowDefinition = async ({
  name,
  schema,
}: CreateWorkflowDefinitionPayload) => {
  const validatedSchema = validateWorkflowSchema(schema)
  const response = await request.post<WorkflowDefinitionMutationResult>(
    '/workflows',
    {
      name,
      schema: validatedSchema,
    }
  )

  return response.data
}

export const saveWorkflowDefinition = async (id: string, schema: unknown) => {
  const validatedSchema = validateWorkflowSchema(schema)
  const response = await request.put<WorkflowDefinitionMutationResult>(
    `/workflows/${id}`,
    {
      schema: validatedSchema,
    }
  )

  return response.data
}

export const publishWorkflowDefinition = async (
  id: string,
  schema: unknown
) => {
  const validatedSchema = validateWorkflowSchema(schema)
  const response = await request.post<WorkflowDefinitionMutationResult>(
    `/workflows/${id}/publish`,
    {
      schema: validatedSchema,
    }
  )

  return response.data
}

export const disableWorkflowDefinition = async (id: string) => {
  const response = await request.post<WorkflowDefinitionMutationResult>(
    `/workflows/${id}/disable`
  )
  return response.data
}

export const startWorkflowInstance = async (
  workflowId: string,
  payload: StartWorkflowInstancePayload
) => {
  const response = await request.post<WorkflowInstanceRecord>(
    '/workflow-instances',
    {
      workflowId,
      ...payload,
    }
  )
  return response.data
}

export const fetchWorkflowTodos = async (params: WorkflowTaskQuery) => {
  const response = await request.get<WorkflowPageResult<WorkflowTaskRecord>>(
    '/workflow-todos',
    {
      params,
    }
  )
  return response.data
}

export const fetchWorkflowDone = async (params: WorkflowTaskQuery) => {
  const response = await request.get<WorkflowPageResult<WorkflowTaskRecord>>(
    '/workflow-done',
    {
      params,
    }
  )
  return response.data
}

export const approveWorkflowTask = async (
  taskId: string,
  payload: WorkflowActionPayload
) => {
  const response = await request.post<WorkflowTaskRecord>(
    `/workflow-tasks/${taskId}/approve`,
    payload
  )
  return response.data
}

export const rejectWorkflowTask = async (
  taskId: string,
  payload: WorkflowActionPayload
) => {
  const response = await request.post<WorkflowTaskRecord>(
    `/workflow-tasks/${taskId}/reject`,
    payload
  )
  return response.data
}

export const transferWorkflowTask = async (
  taskId: string,
  payload: WorkflowTransferPayload
) => {
  const response = await request.post<WorkflowTaskRecord>(
    `/workflow-tasks/${taskId}/transfer`,
    payload
  )
  return response.data
}

export const withdrawWorkflowInstance = async (
  instanceId: string,
  payload: WorkflowActionPayload
) => {
  const response = await request.post<WorkflowInstanceRecord>(
    `/workflow-instances/${instanceId}/withdraw`,
    payload
  )
  return response.data
}

export const fetchWorkflowHistory = async (instanceId: string) => {
  const response = await request.get<WorkflowHistoryRecord[]>(
    `/workflow-instances/${instanceId}/history`
  )
  return response.data
}
