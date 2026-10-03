import { onlyKeys, record, text, positiveInteger, invalid } from './schemas'

export const WORKFLOW_RECOVERY_PERMISSIONS = {
  transfer: 'workflow:transfer',
  recover: 'workflow:recover',
} as const
export const parseTaskTransfer = (input: unknown) => {
  const body = record(input)
  onlyKeys(body, ['expectedRevision', 'targetUserId', 'reason'])
  const reason = text(body.reason, 'reason', 500)
  if (reason.trim().length < 2)
    invalid('reason', '请填写至少两个字符的转交或恢复原因')
  return {
    expectedRevision: positiveInteger(body.expectedRevision),
    targetUserId: text(body.targetUserId, 'targetUserId', 100),
    reason: reason.trim(),
  }
}
export const parseNextRecovery = (input: unknown) => {
  const body = record(input)
  onlyKeys(body, [
    'expectedRevision',
    'targetUserId',
    'reason',
    'nodeId',
    'originalAssigneeId',
  ])
  const base = parseTaskTransfer({
    expectedRevision: body.expectedRevision,
    targetUserId: body.targetUserId,
    reason: body.reason,
  })
  return {
    ...base,
    nodeId: text(body.nodeId, 'nodeId', 100),
    originalAssigneeId: text(
      body.originalAssigneeId,
      'originalAssigneeId',
      100
    ),
  }
}
