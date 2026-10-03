import { record, onlyKeys, positiveInteger, text, invalid } from './schemas'

export const WORKFLOW_TIMER_PERMISSIONS = {
  read: 'workflow:timer:read',
  retry: 'workflow:timer:retry',
} as const
export interface WorkflowTimer {
  id: string
  instanceId: string
  nodeId: string
  activityId: string
  kind: 'resume' | 'deadline'
  status:
    | 'pending'
    | 'processing'
    | 'completed'
    | 'cancelled'
    | 'blocked'
    | 'failed'
  dueAt: string
  revision: number
  attempts: number
  nextAttemptAt: string
  errorCode: string | null
  completedAt: string | null
}
export const parseWorkflowTimerRetry = (input: unknown) => {
  const body = record(input)
  onlyKeys(body, [
    'expectedRevision',
    'reason',
    'targetUserId',
    'nodeId',
    'originalAssigneeId',
  ])
  const reason = text(body.reason, 'reason', 500).trim()
  if (reason.length < 2) invalid('reason', '请填写至少两个字符的恢复原因')
  const mappingKeys = ['targetUserId', 'nodeId', 'originalAssigneeId']
  const mapping = mappingKeys.filter((key) => body[key] !== undefined)
  if (mapping.length !== 0 && mapping.length !== mappingKeys.length)
    invalid('mapping', '恢复分配必须明确完整票位与目标')
  return {
    expectedRevision: positiveInteger(body.expectedRevision),
    reason,
    ...(mapping.length
      ? {
          targetUserId: text(body.targetUserId, 'targetUserId', 100),
          nodeId: text(body.nodeId, 'nodeId', 100),
          originalAssigneeId: text(
            body.originalAssigneeId,
            'originalAssigneeId',
            100
          ),
        }
      : {}),
  }
}
