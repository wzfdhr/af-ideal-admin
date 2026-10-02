import { DomainError } from '@af-admin/contracts'
import { requirePermission } from '@af-admin/workflow-core'
import { readRecordRow } from './record-access'
import { rows, one } from './support'
import type { Database } from './support'
import type { Actor } from './auth'

export const writableAttachment = async (
  db: Database,
  actor: Actor,
  recordId: string
) => {
  const row = await readRecordRow(db, actor, recordId, true)
  if (row.applicant_id !== actor.userId)
    throw new DomainError(404, 'NOT_FOUND', '资源不存在')
  requirePermission(
    actor.permissions,
    row.record_kind === 'generic' ? 'business:update:self' : 'leave:update:self'
  )
  if (row.status !== 'draft')
    throw new DomainError(409, 'ATTACHMENTS_LOCKED', '已提交记录的附件不能修改')
  return row
}
export const assertFilesReady = async (
  db: Database,
  tenantId: string,
  recordId: string
) => {
  const pending = one(
    await rows<{ total: string }>(
      db,
      "SELECT (SELECT count(*) FROM file_uploads WHERE tenant_id=$1 AND record_id=$2 AND status='uploading')+(SELECT count(*) FROM stored_files WHERE tenant_id=$1 AND record_id=$2 AND status NOT IN ('ready','deleted')) AS total",
      [tenantId, recordId]
    )
  )
  if (Number(pending.total))
    throw new DomainError(
      409,
      'FILES_NOT_READY',
      '附件尚未上传或扫描完成，请处理后再提交'
    )
}
