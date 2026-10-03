import { parseTaskTransfer, parseNextRecovery } from '@af-admin/contracts'
import request from './request'

export interface AssignmentIssue {
  id: string
  nodeId: string
  nodeName: string
  requestId: string
  instanceId: string
  revision: number
  assigneeId: string
  assigneeUnavailable: boolean
  nextSlots: {
    nodeId: string
    nodeName: string
    originalAssigneeId: string
    assignedUserId: string
  }[]
}
export const assignmentCandidates = async (
  id: string,
  mode: 'transfer' | 'recover' | 'recover-next',
  slot?: AssignmentIssue['nextSlots'][number]
) =>
  (
    await request.get<{ id: string; name: string }[]>(
      `/workflow-tasks/${encodeURIComponent(id)}/assignment-candidates`,
      {
        params: {
          mode,
          ...(slot
            ? {
                nodeId: slot.nodeId,
                originalAssigneeId: slot.originalAssigneeId,
              }
            : {}),
        },
      }
    )
  ).data
export const transferAssignment = async (
  id: string,
  body: unknown,
  key: string,
  mode: 'transfer' | 'recover'
) =>
  (
    await request.post(
      `/workflow-tasks/${encodeURIComponent(id)}/${mode}`,
      parseTaskTransfer(body),
      { headers: { 'Idempotency-Key': key } }
    )
  ).data
export const recoverNextAssignment = async (
  id: string,
  body: unknown,
  key: string
) =>
  (
    await request.post(
      `/workflow-tasks/${encodeURIComponent(id)}/recover-next`,
      parseNextRecovery(body),
      { headers: { 'Idempotency-Key': key } }
    )
  ).data
export const inspectAssignments = async (current: number) =>
  (
    await request.get<{ list: AssignmentIssue[]; total: number }>(
      '/workflow-exceptions',
      { params: { current, pageSize: 20 } }
    )
  ).data
