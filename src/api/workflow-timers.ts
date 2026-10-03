import { parseWorkflowTimerRetry } from '@af-admin/contracts'
import request from './request'
import type { WorkflowTimer } from '@af-admin/contracts'

export interface TimerEntry extends WorkflowTimer {
  requestId: string
  nodeName: string
}
export interface TimerRecoverySlot {
  nodeId: string
  nodeName: string
  originalAssigneeId: string
  assignedUserId: string
}
export const workflowTimers = async (current: number, status = '') =>
  (
    await request.get<{ list: TimerEntry[]; total: number }>(
      '/workflow-timers',
      { params: { current, pageSize: 20, ...(status ? { status } : {}) } }
    )
  ).data
export const timerRecoverySlots = async (id: string) =>
  (
    await request.get<TimerRecoverySlot[]>(
      `/workflow-timers/${encodeURIComponent(id)}/recovery-slots`
    )
  ).data
export const timerCandidates = async (id: string, slot: TimerRecoverySlot) =>
  (
    await request.get<{ id: string; name: string }[]>(
      `/workflow-timers/${encodeURIComponent(id)}/assignment-candidates`,
      {
        params: {
          nodeId: slot.nodeId,
          originalAssigneeId: slot.originalAssigneeId,
        },
      }
    )
  ).data
export const retryWorkflowTimer = async (
  id: string,
  body: unknown,
  key: string
) =>
  (
    await request.post<WorkflowTimer>(
      `/workflow-timers/${encodeURIComponent(id)}/retry`,
      parseWorkflowTimerRetry(body),
      { headers: { 'Idempotency-Key': key } }
    )
  ).data
