import request from '@/api/request'
import {
  parseCreateLeave,
  parseUpdateLeave,
  parseCommand,
  parsePublish,
} from '@af-admin/contracts'
import type {
  Application,
  LeaveRequest,
  Release,
  WorkflowTask,
  PageResult,
  CreateLeaveInput,
  UpdateLeaveInput,
  PublishInput,
} from '@af-admin/contracts'

export const getLeaveApplication = async (id: string) =>
  (await request.get<Application>(`/applications/${encodeURIComponent(id)}`))
    .data

export const fetchLeaveRequests = async (params: {
  current: number
  pageSize: number
  status?: string
}) =>
  (await request.get<PageResult<LeaveRequest>>('/leave-requests', { params }))
    .data

export const getLeaveRequest = async (id: string) =>
  (await request.get<LeaveRequest>(`/leave-requests/${encodeURIComponent(id)}`))
    .data

export const createLeaveRequest = async (
  payload: CreateLeaveInput,
  key?: string
) =>
  (
    await request.post<LeaveRequest>(
      '/leave-requests',
      parseCreateLeave(payload),
      key ? { headers: { 'Idempotency-Key': key } } : undefined
    )
  ).data

export const fetchLeaveTasks = async (
  params: { current: number; pageSize: number; keyword?: string },
  done = false
) =>
  (
    await request.get<PageResult<WorkflowTask>>(
      done ? '/workflow-done' : '/workflow-todos',
      { params }
    )
  ).data

export const updateLeaveRequest = async (
  id: string,
  payload: UpdateLeaveInput
) =>
  (
    await request.patch<LeaveRequest>(
      `/leave-requests/${encodeURIComponent(id)}`,
      parseUpdateLeave(payload)
    )
  ).data

export const submitLeaveRequest = async (
  id: string,
  expectedRevision: number,
  key: string
) =>
  (
    await request.post<LeaveRequest>(
      `/leave-requests/${encodeURIComponent(id)}/submit`,
      parseCommand({ expectedRevision }),
      { headers: { 'Idempotency-Key': key } }
    )
  ).data

export const decideLeaveTask = async (
  id: string,
  action: 'approve' | 'reject',
  expectedRevision: number,
  comment: string,
  key: string
) =>
  (
    await request.post<WorkflowTask>(
      `/workflow-tasks/${encodeURIComponent(id)}/${action}`,
      parseCommand({ expectedRevision, comment }, action === 'reject'),
      { headers: { 'Idempotency-Key': key } }
    )
  ).data

export const withdrawLeaveRequest = async (
  instanceId: string,
  expectedRevision: number,
  key: string
) =>
  (
    await request.post<LeaveRequest>(
      `/workflow-instances/${encodeURIComponent(instanceId)}/withdraw`,
      parseCommand({ expectedRevision }),
      { headers: { 'Idempotency-Key': key } }
    )
  ).data

export const publishLeaveApplication = async (
  id: string,
  payload: PublishInput,
  key: string
) =>
  (
    await request.post<Release>(
      `/applications/${encodeURIComponent(id)}/releases`,
      parsePublish(payload),
      { headers: { 'Idempotency-Key': key } }
    )
  ).data

export const activateLeaveRelease = async (
  id: string,
  releaseId: string,
  expectedRevision: number,
  key: string
) =>
  (
    await request.post<Application>(
      `/applications/${encodeURIComponent(id)}/activate-release`,
      { releaseId, expectedRevision },
      { headers: { 'Idempotency-Key': key } }
    )
  ).data
